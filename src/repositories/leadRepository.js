const db = require("../database/knex");
const { normalizeEmail, normalizePhone } = require("../utils/normalizeLead");

const FEMALE_HINTS = new Set([
  "maria", "ana", "beatriz", "bianca", "bruna", "camila", "carla", "carolina", "claudia",
  "daniela", "debora", "eduarda", "elaine", "fernanda", "gabriela", "isabela", "jessica",
  "juliana", "larissa", "leticia", "luana", "luciana", "mariana", "patricia", "paula",
  "raquel", "renata", "sabrina", "simone", "tatiana", "vanessa", "vitoria"
]);

const MALE_HINTS = new Set([
  "joao", "jose", "antonio", "carlos", "daniel", "diego", "douglas", "eduardo", "fabio",
  "felipe", "fernando", "francisco", "gabriel", "gustavo", "henrique", "jair", "jean",
  "jorge", "leandro", "leo", "leonardo", "lucas", "luiz", "marcos", "mateus", "paulo",
  "pedro", "rafael", "ricardo", "rodrigo", "thiago", "vinicius", "wesley", "william"
]);

function tokenizeIdentity(name, email) {
  const nameTokens = String(name || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const emailLocal = String(email || "").toLowerCase().split("@")[0] || "";
  const emailTokens = emailLocal
    .replace(/[^a-z]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: nameTokens[0] || "",
    emailFirst: emailTokens[0] || ""
  };
}

function inferGenderByIdentity(name, email, explicitGender) {
  if (explicitGender === "F" || explicitGender === "M") {
    return explicitGender;
  }

  const { firstName, emailFirst } = tokenizeIdentity(name, email);
  const candidates = [firstName, emailFirst].filter(Boolean);

  for (const token of candidates) {
    if (FEMALE_HINTS.has(token)) return "F";
    if (MALE_HINTS.has(token)) return "M";
  }

  if (firstName.endsWith("a") && !firstName.endsWith("ia")) {
    return "F";
  }

  if (firstName.endsWith("o") || firstName.endsWith("r")) {
    return "M";
  }

  return null;
}

async function findLeadByEmailAndSource(emailNormalized, sourceId) {
  return db("leads")
    .select("id", "email_normalized", "source_id")
    .where({ email_normalized: emailNormalized, source_id: sourceId })
    .first();
}

async function findLeadsByIdentity({ email, phone }) {
  const emailNormalized = email ? normalizeEmail(email) : null;
  const phoneNormalized = phone ? normalizePhone(phone) : null;

  if (!emailNormalized && !phoneNormalized) {
    return [];
  }

  const query = db("leads")
    .select(
      "id",
      "name",
      "email",
      "phone",
      "source_id",
      "is_active",
      "email_unsubscribed",
      "whatsapp_opt_out",
      "contact_notes",
      "alternate_email",
      "suppressed_at"
    );

  query.where(function whereIdentity() {
    if (emailNormalized) {
      this.orWhere({ email_normalized: emailNormalized });
    }
    if (phoneNormalized) {
      this.orWhere({ phone_normalized: phoneNormalized });
    }
  });

  return query.orderBy("id", "desc");
}

async function searchLeads({ q, limit = 20 }) {
  const term = String(q || "").trim();
  if (!term) {
    return [];
  }

  const emailNormalized = normalizeEmail(term);
  const phoneNormalized = normalizePhone(term);
  const likeTerm = `%${term.replace(/[%_]/g, "")}%`;

  const query = db("leads")
    .select(
      "id",
      "name",
      "email",
      "phone",
      "source_id",
      "is_active",
      "email_unsubscribed",
      "whatsapp_opt_out",
      "contact_notes",
      "alternate_email",
      "suppressed_at",
      "engagement_score",
      "temperature"
    )
    .orderBy("id", "desc")
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 50));

  query.where(function whereSearch() {
    this.where("name", "like", likeTerm)
      .orWhere("email", "like", likeTerm);

    if (emailNormalized) {
      this.orWhere({ email_normalized: emailNormalized });
    }

    if (phoneNormalized) {
      this.orWhere({ phone_normalized: phoneNormalized });
    }
  });

  return query;
}

async function listSuppressedLeads({ limit = 50, offset = 0 } = {}) {
  return db("leads")
    .select(
      "id",
      "name",
      "email",
      "phone",
      "source_id",
      "is_active",
      "email_unsubscribed",
      "whatsapp_opt_out",
      "contact_notes",
      "alternate_email",
      "suppressed_at",
      "updated_at"
    )
    .where(function whereSuppressed() {
      this.where("is_active", false)
        .orWhere("email_unsubscribed", true)
        .orWhere("whatsapp_opt_out", true);
    })
    .orderBy("suppressed_at", "desc")
    .orderBy("updated_at", "desc")
    .limit(limit)
    .offset(offset);
}

async function findLeadByFullIdentity({ sourceId, name, emailNormalized, phoneNormalized }) {
  const query = db("leads")
    .select("id", "source_id", "name", "email_normalized", "phone_normalized")
    .where({ source_id: sourceId, name, email_normalized: emailNormalized });

  if (phoneNormalized) {
    query.where({ phone_normalized: phoneNormalized });
  } else {
    query.whereNull("phone_normalized");
  }

  return query.first();
}

async function insertLead(trx, lead) {
  const insertedIds = await trx("leads").insert({
    name: lead.name,
    email: lead.email,
    email_normalized: lead.email_normalized,
    phone: lead.phone,
    phone_normalized: lead.phone_normalized,
    source_id: lead.source_id,
    raw_data: lead.raw_data,
    is_valid: true,
    is_active: true,
    is_duplicate_of: lead.is_duplicate_of || null
  });

  const insertedId = Array.isArray(insertedIds) ? insertedIds[0] : insertedIds;

  return trx("leads")
    .select("id", "name", "email", "phone", "source_id", "created_at")
    .where({ id: insertedId })
    .first();
}

async function insertDeduplicationLog(trx, payload) {
  await trx("lead_deduplication_log").insert({
    lead_id: payload.lead_id,
    duplicate_of_lead_id: payload.duplicate_of_lead_id,
    reason: payload.reason,
    confidence: payload.confidence || null
  });
}

async function listLeads({
  limit = 50,
  offset = 0,
  sourceId = null,
  gender = null,
  temperature = null,
  funnelStage = null,
  fieldArea = null
}) {
  const query = db("leads")
    .select(
      "id",
      "name",
      "email",
      "phone",
      "source_id",
      "created_at",
      "is_duplicate_of",
      "engagement_score",
      "temperature",
      "funnel_stage",
      "last_engagement_at",
      "next_action",
      "contacted",
      "email_unsubscribed",
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) as gender"),
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.website')) as website"),
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.address')) as address"),
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.segmento')) as segmento"),
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.instagram')) as instagram"),
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.facebook')) as facebook"),
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.enriched_at')) as enriched_at")
    )
    .orderBy("engagement_score", "desc")
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);

  if (sourceId) {
    query.where({ source_id: sourceId });
  } else if (fieldArea) {
    query.whereIn("source_id", function () {
      this.select("id").from("lead_sources").where("field_area", fieldArea);
    });
  }

  if (gender) {
    query.whereRaw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) = ?", [gender]);
  }

  if (temperature) {
    query.where({ temperature });
  }

  if (funnelStage) {
    query.where({ funnel_stage: funnelStage });
  }

  return query;
}

async function listEngagementLeads({
  limit = 50,
  offset = 0,
  sourceId = null,
  temperature = null,
  funnelStage = null
}) {
  return listLeads({ limit, offset, sourceId, temperature, funnelStage, gender: null });
}

async function countLeads() {
  const row = await db("leads").count("* as total").first();
  return Number(row?.total || 0);
}

async function countEmailContactBreakdown() {
  const [mapscraperRow, leadLocalRow, realRow, sentRow, pendingRow] = await Promise.all([
    db("leads").where("email_normalized", "like", "%@mapscraper.local").count("id as total").first(),
    db("leads").where("email_normalized", "like", "%@lead.local").count("id as total").first(),
    db("leads")
      .where({ is_valid: true, is_active: true, email_unsubscribed: false })
      .whereRaw("email_normalized NOT LIKE ?", ["%@mapscraper.local"])
      .whereRaw("email_normalized NOT LIKE ?", ["%@lead.local"])
      .count("id as total")
      .first(),
    db("leads as l")
      .where("l.is_valid", true)
      .where("l.is_active", true)
      .whereRaw("l.email_normalized NOT LIKE ?", ["%@mapscraper.local"])
      .whereRaw("l.email_normalized NOT LIKE ?", ["%@lead.local"])
      .whereExists(function () {
        this.select(1)
          .from("email_sends as es")
          .whereRaw("es.lead_id = l.id")
          .where("es.status", "sent");
      })
      .count("l.id as total")
      .first(),
    db("leads")
      .where({ is_valid: true, is_active: true, email_unsubscribed: false })
      .whereRaw("email_normalized NOT LIKE ?", ["%@mapscraper.local"])
      .whereRaw("email_normalized NOT LIKE ?", ["%@lead.local"])
      .whereNotExists(function () {
        this.select(1)
          .from("email_sends as es")
          .whereRaw("es.lead_id = leads.id")
          .where("es.status", "sent");
      })
      .count("id as total")
      .first()
  ]);

  const placeholderMapscraper = Number(mapscraperRow?.total || 0);
  const placeholderLeadLocal = Number(leadLocalRow?.total || 0);

  return {
    realEmail: Number(realRow?.total || 0),
    placeholder: placeholderMapscraper + placeholderLeadLocal,
    placeholderMapscraper,
    placeholderLeadLocal,
    emailSent: Number(sentRow?.total || 0),
    emailPending: Number(pendingRow?.total || 0)
  };
}

async function countFemaleLeads() {
  const row = await db("leads")
    .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) = ?", ["F"])
    .count({ total: "id" })
    .first();

  return Number(row?.total || 0);
}

async function countMaleLeads() {
  const row = await db("leads")
    .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) = ?", ["M"])
    .count({ total: "id" })
    .first();

  return Number(row?.total || 0);
}

async function countInferredGenderLeads() {
  const rows = await db("leads")
    .select(
      "name",
      "email",
      db.raw("JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.gender')) as gender")
    )
    .where({ is_active: true });

  let female = 0;
  let male = 0;

  for (const row of rows) {
    const inferred = inferGenderByIdentity(row.name, row.email, row.gender);
    if (inferred === "F") female += 1;
    if (inferred === "M") male += 1;
  }

  return { female, male };
}

async function countLeadsForEmailEnrichment() {
  const row = await db("leads")
    .where("email_normalized", "like", "%@mapscraper.local")
    .whereRaw(
      "JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.website')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.website')) NOT IN ('', 'null')"
    )
    .count("id as total")
    .first();
  return Number(row?.total || 0);
}

async function countUncontactedLeadsWithPhone() {
  const row = await db("leads")
    .where("contacted", false)
    .where("is_active", true)
    .where("is_valid", true)
    .where("email_unsubscribed", false)
    .where("whatsapp_opt_out", false)
    .whereNotIn("temperature", ["lost"])
    .whereNotNull("phone_normalized")
    .where("phone_normalized", "!=", "")
    .count("id as total")
    .first();
  return Number(row?.total || 0);
}

async function listLeadsForEmailEnrichment({ limit = 50, offset = 0 } = {}) {
  return db("leads")
    .select("id", "source_id", "name", "email", "email_normalized", "raw_data")
    .where("email_normalized", "like", "%@mapscraper.local")
    .whereRaw(
      "JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.website')) IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.website')) NOT IN ('', 'null')"
    )
    .orderBy("id", "asc")
    .limit(limit)
    .offset(offset);
}

async function updateLeadEmailEnrichment(leadId, { email, emailNormalized, enrichmentMeta = {} }) {
  const lead = await db("leads").where({ id: leadId }).first();
  if (!lead) return null;

  const duplicate = await db("leads")
    .where({ email_normalized: emailNormalized, source_id: lead.source_id })
    .whereNot({ id: leadId })
    .first();

  if (duplicate) {
    return { updated: false, reason: "duplicate_email_in_source", duplicateId: duplicate.id };
  }

  let rawData = lead.raw_data;
  if (typeof rawData === "string") {
    try {
      rawData = JSON.parse(rawData);
    } catch {
      rawData = {};
    }
  }
  rawData = rawData || {};
  rawData.email_enriched_at = new Date().toISOString();
  Object.assign(rawData, enrichmentMeta);

  await db("leads").where({ id: leadId }).update({
    email,
    email_normalized: emailNormalized,
    raw_data: JSON.stringify(rawData)
  });

  return { updated: true, leadId };
}

async function listUncontactedLeadsWithPhone({ limit = 100, offset = 0 } = {}) {
  return db("leads")
    .select(
      "id",
      "name",
      "phone",
      "phone_normalized",
      "engagement_score",
      "temperature",
      "funnel_stage",
      "next_action"
    )
    .where("contacted", false)
    .where("is_active", true)
    .where("is_valid", true)
    .where("email_unsubscribed", false)
    .where("whatsapp_opt_out", false)
    .whereNotIn("temperature", ["lost"])
    .whereNotNull("phone_normalized")
    .where("phone_normalized", "!=", "")
    .orderBy("engagement_score", "desc")
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);
}

async function markLeadAsContacted(id) {
  const { recalculateLeadEngagement } = require("../services/leadScoringService");
  await db("leads")
    .where({ id })
    .update({
      contacted: true,
      contacted_at: db.fn.now()
    });
  await recalculateLeadEngagement(id);
  return true;
}

async function countLeadsByFieldArea() {
  return db("leads")
    .join("lead_sources", "leads.source_id", "lead_sources.id")
    .select("lead_sources.field_area")
    .count("leads.id as total")
    .groupBy("lead_sources.field_area")
    .orderBy("total", "desc");
}

module.exports = {
  findLeadByEmailAndSource,
  findLeadByFullIdentity,
  findLeadsByIdentity,
  searchLeads,
  listSuppressedLeads,
  insertLead,
  insertDeduplicationLog,
  listLeads,
  listEngagementLeads,
  countLeads,
  countEmailContactBreakdown,
  countFemaleLeads,
  countMaleLeads,
  countInferredGenderLeads,
  listLeadsForEmailEnrichment,
  countLeadsForEmailEnrichment,
  countUncontactedLeadsWithPhone,
  updateLeadEmailEnrichment,
  listUncontactedLeadsWithPhone,
  markLeadAsContacted,
  countLeadsByFieldArea
};
