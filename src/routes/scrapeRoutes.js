const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const pdfParse = require("pdf-parse");
const puppeteer = require("puppeteer");
const env = require("../config/env");
const { startScraping, isScrapingActive } = require("../services/scrapeService");
const db = require("../database/knex");
const { createExecution, finishExecution } = require("../repositories/executionRepository");
const { leadSchemaManual } = require("../validation/leadSchemaManual");
const { normalizeLead } = require("../utils/normalizeLead");
const { findLeadByFullIdentity, insertLead } = require("../repositories/leadRepository");

const router = express.Router();

const ALLOWED_MANUAL_FIELDS = ["nome", "email", "telefone", "cpf", "cnpj"];
const MANUAL_SOURCE_NAME = "scraping-manual";

function hasValidToken(req) {
  if (!env.panel.runToken) {
    return true;
  }

  const providedToken = req.headers["x-panel-token"];
  return Boolean(providedToken && providedToken === env.panel.runToken);
}

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return /^(localhost|127\.|0\.0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|\[::1\]|fe80:|fc00:)/.test(host);
}

function normalizeFields(fieldsInput) {
  if (Array.isArray(fieldsInput)) {
    return fieldsInput.map((entry) => String(entry).toLowerCase().trim()).filter(Boolean);
  }

  if (typeof fieldsInput === "string") {
    return fieldsInput
      .split(",")
      .map((entry) => entry.toLowerCase().trim())
      .filter(Boolean);
  }

  return [];
}

function dedupeLimit(values, limit = null) {
  const unique = Array.from(new Set(values));
  if (typeof limit === "number" && limit > 0) {
    return unique.slice(0, limit);
  }
  return unique;
}

function applyLimit(values, limit = null) {
  if (typeof limit === "number" && limit > 0) {
    return values.slice(0, limit);
  }
  return values;
}

function toBoundedPositiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function paginateExtracted(extracted, page, pageSize) {
  const entries = Object.entries(extracted);
  const counts = Object.fromEntries(entries.map(([field, values]) => [field, values.length]));
  const maxItems = Math.max(0, ...Object.values(counts));
  const totalPages = Math.max(1, Math.ceil(maxItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  const paginated = Object.fromEntries(
    entries.map(([field, values]) => [field, values.slice(start, end)])
  );

  return {
    counts,
    extracted: paginated,
    pagination: {
      page: safePage,
      pageSize,
      totalPages,
      maxItems
    }
  };
}

async function getManualSourceId() {
  const source = await db("lead_sources")
    .select("id", "is_active")
    .where({ name: MANUAL_SOURCE_NAME })
    .first();

  if (!source || !source.is_active) {
    const error = new Error("Manual scraping source is missing or inactive");
    error.statusCode = 500;
    throw error;
  }

  return source.id;
}

async function persistManualLeads({ sourceId, consent, extracted, requestedFields, url }) {
  if (consent !== true) {
    const error = new Error("LGPD consent is required to persist manual leads");
    error.statusCode = 400;
    throw error;
  }

  const emails = extracted.email || [];
  const names = extracted.nome || [];
  const phones = extracted.telefone || [];
  const maxItems = Math.max(emails.length, names.length, phones.length);

  const counters = {
    attempted: maxItems,
    saved: 0,
    duplicates: 0,
    errors: 0
  };

  const warnings = [];

  if (requestedFields.includes("cpf") || requestedFields.includes("cnpj")) {
    warnings.push("CPF/CNPJ detectados no preview nao sao persistidos por padrao.");
  }

  if (maxItems === 0) {
    warnings.push("Nenhum dado encontrado para persistir.");
    return { counters, warnings };
  }

  for (let index = 0; index < maxItems; index += 1) {
    const email = emails[index] || `manual-${sourceId}-${Date.now()}-${index}@manual.local`;
    const name = names[index] || names[0] || `Lead Manual ${index + 1}`;
    const phone = phones[index] || phones[0] || null;

    const candidate = {
      name,
      email,
      phone,
      source_id: sourceId,
      raw_data: {
        origin: "manual_scrape",
        source_url: url,
        manual_partial: !(emails[index] && names[index] && phones[index]),
        lgpd: {
          consent: true,
          consented_at: new Date().toISOString()
        }
      }
    };

    const validation = leadSchemaManual.validate(candidate);
    if (validation.error) {
      counters.errors += 1;
      continue;
    }

    const normalized = normalizeLead(validation.value);
    const duplicate = await findLeadByFullIdentity({
      sourceId,
      name: normalized.name,
      emailNormalized: normalized.email_normalized,
      phoneNormalized: normalized.phone_normalized
    });
    if (duplicate) {
      counters.duplicates += 1;
      continue;
    }

    try {
      await db.transaction(async (trx) => {
        await insertLead(trx, normalized);
      });
    } catch (error) {
      if (error && (error.code === "ER_DUP_ENTRY" || error.code === "SQLITE_CONSTRAINT")) {
        counters.duplicates += 1;
        continue;
      }
      counters.errors += 1;
      continue;
    }

    counters.saved += 1;
  }

  return { counters, warnings };
}

function extractNameCandidates($) {
  const names = new Set();
  $("title, h1, h2").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text.length >= 2) {
      names.add(text);
    }
  });
  return Array.from(names).slice(0, 10);
}

function normalizePhoneCandidate(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) {
    return null;
  }

  const area = digits.slice(0, 2);
  const body = digits.slice(2);
  if (area.startsWith("0") || area.startsWith("1") || body.startsWith("0") || body.startsWith("1")) {
    return null;
  }

  if (body.length === 9) {
    return `(${area}) ${body.slice(0, 5)}-${body.slice(5)}`;
  }
  return `(${area}) ${body.slice(0, 4)}-${body.slice(4)}`;
}

function extractTitleFromPathname(pathname) {
  const lastSegment = String(pathname || "").split("/").filter(Boolean).pop() || "documento";
  const clean = decodeURIComponent(lastSegment).replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
  return clean || "documento";
}

async function extractRenderedBodyText(url, timeoutMs) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setUserAgent("LeadScraperBot/1.0 (+contato@empresa.com)");
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });

    const payload = await page.evaluate(() => ({
      title: document.title || "",
      text: (document.body && document.body.innerText) ? document.body.innerText : ""
    }));

    const title = String(payload.title || "").trim();
    const text = String(payload.text || "").replace(/\s+/g, " ");
    return { title, text };
  } catch (error) {
    return { title: "", text: "" };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

router.get("/status", async (req, res, next) => {
  try {
    return res.status(200).json({
      data: {
        active: isScrapingActive()
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/run", async (req, res, next) => {
  try {
    if (!hasValidToken(req)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const sourceIdRaw = req.body?.sourceId;
    const fieldArea = req.body?.fieldArea;
    let sourceId = null;

    if (sourceIdRaw !== undefined && sourceIdRaw !== null && sourceIdRaw !== "") {
      sourceId = Number(sourceIdRaw);
      if (!Number.isInteger(sourceId) || sourceId <= 0) {
        return res.status(400).json({ message: "Invalid sourceId" });
      }
    }

    const launch = await startScraping({ sourceId, fieldArea });
    if (launch.alreadyRunning) {
      return res.status(409).json({
        message: "Ja existe um scraping em andamento. Aguarde a conclusao ou atualize a tabela de execucoes.",
        data: launch
      });
    }

    return res.status(202).json({
      message: "Scraping iniciado em background.",
      data: launch
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/manual", async (req, res, next) => {
  let execution = null;
  try {
    if (!hasValidToken(req)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const url = String(req.body?.url || "").trim();
    const requestedFields = normalizeFields(req.body?.fields);
    const page = toBoundedPositiveInt(req.body?.page, 1, 1, 1000000);
    const pageSize = toBoundedPositiveInt(req.body?.pageSize, 100, 1, 1000);
    const fetchAll = req.body?.fetchAll !== false;
    const persistConsent = req.body?.consent === true;
    const sourceId = await getManualSourceId();
    execution = await createExecution(sourceId);

    if (!url) {
      return res.status(400).json({ message: "URL is required" });
    }

    if (requestedFields.length === 0) {
      return res.status(400).json({ message: "At least one field is required" });
    }

    if (requestedFields.some((field) => !ALLOWED_MANUAL_FIELDS.includes(field))) {
      return res.status(400).json({ message: "Invalid field list" });
    }

    if (!persistConsent) {
      return res.status(400).json({ message: "LGPD consent is required for manual scraping" });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return res.status(400).json({ message: "Invalid URL" });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ message: "Only HTTP/HTTPS URLs are allowed" });
    }

    if (isBlockedHost(parsedUrl.hostname)) {
      return res.status(403).json({ message: "Blocked URL by security policy" });
    }

    const response = await axios.get(parsedUrl.toString(), {
      timeout: env.scrape.timeoutMs,
      maxRedirects: 3,
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "LeadScraperBot/1.0 (+contato@empresa.com)",
        Accept: "text/html,application/xhtml+xml,text/plain,application/pdf"
      }
    });

    const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
    const isPdf = contentType.includes("application/pdf") || parsedUrl.pathname.toLowerCase().endsWith(".pdf");

    let $ = cheerio.load("<html><body></body></html>");
    let bodyText = "";
    let pdfTitle = "";

    if (isPdf) {
      const pdfData = await pdfParse(Buffer.from(response.data));
      bodyText = String(pdfData?.text || "").replace(/\s+/g, " ");
      pdfTitle = String(pdfData?.info?.Title || "").trim();
    } else {
      const html = Buffer.from(response.data || "").toString("utf8");
      $ = cheerio.load(html);
      bodyText = $("body").text().replace(/\s+/g, " ");
    }

    const extracted = {};

    if (requestedFields.includes("nome")) {
      if (isPdf) {
        const titleCandidate = pdfTitle || extractTitleFromPathname(parsedUrl.pathname);
        extracted.nome = [titleCandidate];
      } else {
        extracted.nome = extractNameCandidates($);
      }
    }

    if (requestedFields.includes("email")) {
      const emails = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      extracted.email = applyLimit(emails.map((entry) => entry.toLowerCase()));
    }

    if (requestedFields.includes("telefone")) {
      const phones = bodyText.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/g) || [];
      extracted.telefone = applyLimit(
        phones
          .map((entry) => normalizePhoneCandidate(entry))
          .filter(Boolean)
      );
    }

    if (requestedFields.includes("cpf")) {
      const cpfs = bodyText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) || [];
      extracted.cpf = applyLimit(cpfs.map((entry) => entry.replace(/\D/g, "")));
    }

    if (requestedFields.includes("cnpj")) {
      const cnpjs = bodyText.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
      extracted.cnpj = applyLimit(cnpjs.map((entry) => entry.replace(/\D/g, "")));
    }

    const shouldUseRenderedFallback = !isPdf
      && parsedUrl.hostname.includes("scribd.com")
      && (
        (requestedFields.includes("email") && (!extracted.email || extracted.email.length === 0))
        || (requestedFields.includes("telefone") && (!extracted.telefone || extracted.telefone.length === 0))
      );

    if (shouldUseRenderedFallback) {
      const rendered = await extractRenderedBodyText(parsedUrl.toString(), env.scrape.timeoutMs + 15000);
      const renderedText = rendered.text || "";

      if (requestedFields.includes("nome")) {
        const titleCandidate = rendered.title || extractTitleFromPathname(parsedUrl.pathname);
        extracted.nome = dedupeLimit([...(extracted.nome || []), titleCandidate]);
      }

      if (requestedFields.includes("email")) {
        const renderedEmails = renderedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        extracted.email = applyLimit(dedupeLimit([...(extracted.email || []), ...renderedEmails.map((entry) => entry.toLowerCase())]));
      }

      if (requestedFields.includes("telefone")) {
        const renderedPhones = renderedText.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/g) || [];
        extracted.telefone = applyLimit(dedupeLimit([
          ...(extracted.telefone || []),
          ...renderedPhones.map((entry) => normalizePhoneCandidate(entry)).filter(Boolean)
        ]));
      }
    }

    const paginatedPreview = paginateExtracted(extracted, page, pageSize);
    const fullCounts = Object.fromEntries(
      Object.entries(extracted).map(([field, values]) => [field, values.length])
    );
    const maxItems = Math.max(0, ...Object.values(fullCounts));
    const persisted = await persistManualLeads({
      sourceId,
      consent: persistConsent,
      extracted,
      requestedFields,
      url: parsedUrl.toString()
    });

    const manualStatus = "completed";
    await finishExecution(execution.id, {
      status: manualStatus,
      total_scraped: maxItems,
      total_saved: persisted.counters.saved,
      duplicates_found: persisted.counters.duplicates,
      errors_count: persisted.counters.errors,
      error_log: persisted.warnings
    });

    return res.status(200).json({
      data: {
        url: parsedUrl.toString(),
        requestedFields,
        counts: fullCounts,
        extracted: fetchAll ? extracted : paginatedPreview.extracted,
        pagination: fetchAll
          ? {
              page: 1,
              pageSize: maxItems,
              totalPages: 1,
              maxItems
            }
          : paginatedPreview.pagination,
        persist: {
          enabled: true,
          consent: persistConsent,
          sourceId,
          result: persisted
        }
      }
    });
  } catch (error) {
    if (execution && execution.id) {
      await finishExecution(execution.id, {
        status: "failed",
        total_scraped: 0,
        total_saved: 0,
        duplicates_found: 0,
        errors_count: 1,
        error_log: [error.message]
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
});

module.exports = router;
