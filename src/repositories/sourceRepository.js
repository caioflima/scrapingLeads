const db = require("../database/knex");

async function getActiveSources() {
  return db("lead_sources")
    .select("id", "name", "base_url", "rate_limit_per_hour", "last_scraped_at", "field_area")
    .where({ is_active: true })
    .orderBy("id", "asc");
}

async function listSources({ fieldArea = null } = {}) {
  const query = db("lead_sources")
    .select(
      "id",
      "name",
      "base_url",
      "rate_limit_per_hour",
      "last_scraped_at",
      "field_area",
      "is_active",
      "notes",
      "created_at",
      "updated_at"
    )
    .orderBy("id", "asc");

  if (fieldArea) {
    query.where({ field_area: fieldArea });
  }

  return query;
}

async function createSources(sources) {
  return db.batchInsert("lead_sources", sources, 50);
}

module.exports = {
  getActiveSources,
  listSources,
  createSources
};
