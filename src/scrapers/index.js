const { scrapeSampleStaticSource } = require("./sources/sampleStaticSource");
const { scrapeCamaraDeputados } = require("./sources/camaraDeputadosSource");
const { scrapeOverpassSource } = require("./sources/overpassSource");
const { scrapeGenericApiSource } = require("./sources/genericApiSource");
const { scrapeCnpj } = require("./sources/cnpjSource");
const { scrapeGoogleMaps } = require("./sources/googleMapsSource");
const { scrapeWebKeyword } = require("./sources/webKeywordSource");

function isLikelyJsonApi(source) {
  const url = String(source.base_url || "").toLowerCase();
  return (
    url.includes("/api/")
    || url.includes("formato=json")
    || url.endsWith(".json")
    || url.includes("api.github.com")
    || url.includes("servicodados.ibge.gov.br")
    || url.includes("api.bcb.gov.br")
  );
}

async function scrapeSource(source, config, logger, hooks = {}) {
  if (source.name === "camara-deputados-api") {
    return scrapeCamaraDeputados(source, config, logger);
  }

  if (source.name.startsWith("osm-") && source.base_url.includes("overpass-api.de/api/interpreter")) {
    return scrapeOverpassSource(source, config, logger);
  }

  if (source.name.startsWith("cnpj-receita")) {
    return scrapeCnpj(source, config, logger);
  }

  if (source.name.startsWith("gmaps-")) {
    return scrapeGoogleMaps(source, config, logger, hooks);
  }

  if (source.name.startsWith("websearch-")) {
    return scrapeWebKeyword(source, config, logger, hooks);
  }

  if (isLikelyJsonApi(source)) {
    return scrapeGenericApiSource(source, config, logger);
  }

  // Fallback: source with HTML selectors.
  return scrapeSampleStaticSource(source, config, logger);
}

module.exports = {
  scrapeSource
};
