const axios = require('axios');
const cheerio = require('cheerio');

async function run() {
  try {
    const res = await axios.get("https://www.ecosia.org/search?q=Cl%C3%ADnica+de+Psicologia", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      timeout: 15000
    });
    console.log("Status:", res.status);
    const $ = cheerio.load(res.data);
    const results = $('.result-snippet');
    console.log("Ecosia Results:", results.length);
    if (results.length === 0) {
      console.log("Empty results, trying another selector:", $('.result').length);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}
run();