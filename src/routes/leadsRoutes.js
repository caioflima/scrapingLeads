const express = require("express");
const { enrichLead } = require("../services/leadEnrichmentService");

const env = require("../config/env");
const {
  listLeads,
  listEngagementLeads,
  listUncontactedLeadsWithPhone,
  countUncontactedLeadsWithPhone,
  markLeadAsContacted,
  countLeadsByFieldArea
} = require("../repositories/leadRepository");
const { getEngagementSummary, recalculateAllLeads, fetchLeadSignals, buildEngagementFromSignals, classifyClickUrl } = require("../services/leadScoringService");
const { listLeadEmailEvents, VALID_EVENT_TYPES } = require("../repositories/emailRepository");

const router = express.Router();

function parseLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseOffset(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

router.get("/", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const offset = parseOffset(req.query.offset, 0);
    const sourceId = req.query.source_id ? Number(req.query.source_id) : null;
    const rawGender = req.query.gender ? String(req.query.gender).toUpperCase() : null;
    const gender = rawGender && ["F", "M"].includes(rawGender) ? rawGender : null;
    const temperature = req.query.temperature ? String(req.query.temperature) : null;
    const funnelStage = req.query.funnel_stage ? String(req.query.funnel_stage) : null;
    const fieldArea = req.query.field_area ? String(req.query.field_area) : null;

    const leads = await listLeads({ limit, offset, sourceId, gender, temperature, funnelStage, fieldArea });
    res.json({ data: leads, pagination: { limit, offset, gender, field_area: fieldArea } });
  } catch (error) {
    next(error);
  }
});

router.get("/segments", async (req, res, next) => {
  try {
    const segments = await countLeadsByFieldArea();
    res.json({ data: segments });
  } catch (error) {
    next(error);
  }
});

router.get("/uncontacted", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 100);
    const offset = parseOffset(req.query.offset, 0);
    const leads = await listUncontactedLeadsWithPhone({ limit, offset });
    const total = await countUncontactedLeadsWithPhone();
    res.json({ data: leads, pagination: { limit, offset, total } });
  } catch (error) {
    next(error);
  }
});

router.get("/engagement/summary", async (req, res, next) => {
  try {
    const summary = await getEngagementSummary();
    res.json({ data: summary });
  } catch (error) {
    next(error);
  }
});

router.get("/engagement", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const offset = parseOffset(req.query.offset, 0);
    const sourceId = req.query.source_id ? Number(req.query.source_id) : null;
    const temperature = req.query.temperature ? String(req.query.temperature) : null;
    const funnelStage = req.query.funnel_stage ? String(req.query.funnel_stage) : null;

    const leads = await listEngagementLeads({ limit, offset, sourceId, temperature, funnelStage });
    res.json({ data: leads, pagination: { limit, offset, temperature, funnel_stage: funnelStage } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/email-events", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }

    const limit = parseLimit(req.query.limit, 50);
    const offset = parseOffset(req.query.offset, 0);
    const rawEventType = req.query.event_type ? String(req.query.event_type).toLowerCase() : null;
    const eventType = rawEventType && VALID_EVENT_TYPES.has(rawEventType) ? rawEventType : null;

    if (rawEventType && !eventType) {
      return res.status(400).json({ message: "event_type inválido. Use: open, click ou unsubscribe" });
    }

    const result = await listLeadEmailEvents(id, { limit, offset, eventType });
    if (!result) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const events = result.events.map((ev) => ({
      id: ev.id,
      event_type: ev.event_type,
      occurred_at: ev.occurred_at,
      url_clicked: ev.url_clicked || null,
      click_type: ev.event_type === "click" ? classifyClickUrl(ev.url_clicked) : null,
      email_send_id: ev.email_send_id,
      email_subject: ev.email_subject,
      email_sent_at: ev.email_sent_at,
      campaign_name: ev.campaign_name || null,
      utm_campaign: ev.utm_campaign || null,
      provider: ev.provider || null
    }));

    res.json({
      data: { lead: result.lead, events },
      pagination: { limit, offset, total: result.total }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/engagement", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    const signals = await fetchLeadSignals(id);
    if (!signals) {
      return res.status(404).json({ message: "Lead not found" });
    }
    res.json({ data: { signals, engagement: buildEngagementFromSignals(signals) } });
  } catch (error) {
    next(error);
  }
});

router.post("/engagement/recalculate", async (req, res, next) => {
  try {
    if (env.panel.runToken) {
      const token = req.headers["x-panel-token"];
      if (token !== env.panel.runToken) {
        return res.status(401).json({ message: "Unauthorized" });
      }
    }
    const result = await recalculateAllLeads();
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/contact", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    await markLeadAsContacted(id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


router.post("/:id/enrich", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    const result = await enrichLead(id);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
