const { scrapeWebKeyword } = require('./src/scrapers/sources/webKeywordSource');
const pino = require('pino');

const logger = pino({ level: 'debug' });

async function run() {
  const source = {
    base_url: "https://html.duckduckgo.com/html/?q=Cl%C3%ADnica%20de%20Psicologia"
  };
  const leads = await scrapeWebKeyword(source, {}, logger);
  console.log("Found Leads:", leads.length);
  if (leads.length > 0) {
    console.log(leads.slice(0, 3));
  }
}
run();