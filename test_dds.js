const { search } = require('duck-duck-scrape');

async function run() {
  try {
    const searchResults = await search('Clínica de Psicologia');
    console.log("DDScrape Results:", searchResults.results.length);
    console.log(searchResults.results.slice(0, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}
run();