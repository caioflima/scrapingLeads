const env = require("../config/env");
const logger = require("../config/logger");
const db = require("../database/knex");
const { leadSchema } = require("../validation/leadSchema");
const { normalizeLead } = require("../utils/normalizeLead");
const { getActiveSources } = require("../repositories/sourceRepository");
const {
  createExecution,
  finishExecution,
  logScrapingError,
  cleanupStaleExecutions,
  countRunningExecutions,
  updateExecutionProgress,
  recoverInterruptedExecutions
} = require("../repositories/executionRepository");
const {
  findLeadByEmailAndSource,
  insertLead
} = require("../repositories/leadRepository");
const { scrapeSource } = require("../scrapers");

const STALE_EXECUTION_MINUTES = 120;
let activeScrapePromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry(handler, { retries, baseDelayMs }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await handler();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      const delay = baseDelayMs * 2 ** attempt;
      await sleep(delay);
    }
  }
  throw lastError;
}

async function processLead(executionId, sourceId, rawLead, counters) {
  const { error, value } = leadSchema.validate({ ...rawLead, source_id: sourceId });
  if (error) {
    counters.errors += 1;
    await logScrapingError({
      execution_id: executionId,
      error_type: "validation",
      error_code: "LEAD_SCHEMA_INVALID",
      message: error.message + " (Lead data: " + JSON.stringify(rawLead).substring(0, 200) + ")"
    });
    return;
  }

  const normalized = normalizeLead(value);
  if (!normalized.phone_normalized) {
    normalized.phone = null;
  }

  if (!normalized.name || !normalized.email_normalized) {
    counters.errors += 1;
    await logScrapingError({
      execution_id: executionId,
      error_type: "validation",
      error_code: "REQUIRED_FIELDS_MISSING",
      message: "Lead rejected: name and email are mandatory"
    });
    return;
  }

  const duplicate = await findLeadByEmailAndSource(normalized.email_normalized, sourceId);
  if (duplicate) {
    counters.duplicates += 1;
    return;
  }

  await db.transaction(async (trx) => {
    await insertLead(trx, normalized);
  });

  counters.saved += 1;
}

async function processSource(source) {
  const execution = await createExecution(source.id);
  const counters = {
    scraped: 0,
    saved: 0,
    duplicates: 0,
    errors: 0
  };
  let lastProgressAt = 0;

  async function reportProgress(force = false) {
    const now = Date.now();
    if (!force && now - lastProgressAt < 3000) {
      return;
    }
    lastProgressAt = now;
    await updateExecutionProgress(execution.id, counters);
  }

  try {
    const rawLeads = await runWithRetry(
      () => scrapeSource(source, env.scrape, logger, {
        onProgress: async (partial) => {
          if (partial?.scraped !== undefined) {
            counters.scraped = partial.scraped;
          }
          await reportProgress();
        }
      }),
      { retries: env.scrape.retryMax, baseDelayMs: env.scrape.retryBaseDelayMs }
    );

    counters.scraped = rawLeads.length;
    await reportProgress(true);

    for (const rawLead of rawLeads) {
      // Process sequentially to keep transaction and logs deterministic.
      await processLead(execution.id, source.id, rawLead, counters);
      await reportProgress();
    }

    await finishExecution(execution.id, {
      status: counters.errors > 0 ? "partial" : "completed",
      total_scraped: counters.scraped,
      total_saved: counters.saved,
      duplicates_found: counters.duplicates,
      errors_count: counters.errors,
      error_log: null
    });

    await db("lead_sources")
      .where({ id: source.id })
      .update({ last_scraped_at: db.fn.now(), updated_at: db.fn.now() });

    return counters;
  } catch (error) {
    logger.error({ err: error, sourceId: source.id }, "Source scraping failed");

    await logScrapingError({
      execution_id: execution.id,
      error_type: "runtime",
      error_code: error.code || "UNKNOWN",
      message: error.message,
      url_attempted: source.base_url
    });

    await finishExecution(execution.id, {
      status: "failed",
      total_scraped: counters.scraped,
      total_saved: counters.saved,
      duplicates_found: counters.duplicates,
      errors_count: counters.errors + 1,
      error_log: [{ message: error.message, code: error.code || "UNKNOWN" }]
    });

    return counters;
  }
}

async function runScraping({ sourceId, fieldArea } = {}) {
  const sources = await getActiveSources();
  let selectedSources = sources;

  if (sourceId) {
    selectedSources = selectedSources.filter((source) => source.id === Number(sourceId));
  } else if (fieldArea) {
    selectedSources = selectedSources.filter((source) => source.field_area === fieldArea);
  }

  if (selectedSources.length === 0) {
    logger.warn({ sourceId }, "No sources to process");
    return { processedSources: 0, totals: { scraped: 0, saved: 0, duplicates: 0, errors: 0 } };
  }

  const totals = {
    scraped: 0,
    saved: 0,
    duplicates: 0,
    errors: 0
  };

  for (const source of selectedSources) {
    const sourceResult = await processSource(source);
    totals.scraped += sourceResult.scraped;
    totals.saved += sourceResult.saved;
    totals.duplicates += sourceResult.duplicates;
    totals.errors += sourceResult.errors;
  }

  return {
    processedSources: selectedSources.length,
    totals
  };
}

function isScrapingActive() {
  return activeScrapePromise !== null;
}

async function startScraping(options = {}) {
  if (activeScrapePromise) {
    return { started: false, alreadyRunning: true };
  }

  const runningInDb = await countRunningExecutions();
  if (runningInDb > 0) {
    return { started: false, alreadyRunning: true, runningExecutions: runningInDb };
  }

  activeScrapePromise = runScraping(options)
    .catch((error) => {
      logger.error({ err: error }, "Background scraping failed");
      return { processedSources: 0, totals: { scraped: 0, saved: 0, duplicates: 0, errors: 1 }, failed: true };
    })
    .finally(() => {
      activeScrapePromise = null;
    });

  return { started: true, alreadyRunning: false };
}

async function initializeScrapeMaintenance() {
  const recovered = await recoverInterruptedExecutions();
  if (recovered > 0) {
    logger.warn({ recovered }, "Recovered interrupted scraping executions after startup");
  }

  const cleaned = await cleanupStaleExecutions(STALE_EXECUTION_MINUTES);
  if (cleaned > 0) {
    logger.warn({ cleaned, staleMinutes: STALE_EXECUTION_MINUTES }, "Marked stale scraping executions as failed");
  }

  setInterval(() => {
    cleanupStaleExecutions(STALE_EXECUTION_MINUTES)
      .then((count) => {
        if (count > 0) {
          logger.warn({ cleaned: count, staleMinutes: STALE_EXECUTION_MINUTES }, "Marked stale scraping executions as failed");
        }
      })
      .catch((error) => {
        logger.error({ err: error }, "Failed to cleanup stale scraping executions");
      });
  }, 5 * 60 * 1000).unref();
}

module.exports = {
  runScraping,
  startScraping,
  isScrapingActive,
  initializeScrapeMaintenance,
  cleanupStaleExecutions
};
