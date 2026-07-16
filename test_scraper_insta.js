const { scrapeWebKeyword } = require('./src/scrapers/sources/webKeywordSource');
const pino = require('pino');

const logger = pino({ level: 'debug' });

async function run() {
  const source = {
    base_url: "https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%20%22%40psico%22%20psicologia"
  };
  const leads = await scrapeWebKeyword(source, {}, logger);
  console.log("Found Leads:", leads.length);
  if (leads.length > 0) {
    console.log(leads.slice(0, 3));
  }
}
run();