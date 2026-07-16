const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function run() {
  try {
    const res = await axios.get("https://search.yahoo.com/search?p=Cl%C3%ADnica+de+Psicologia", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      timeout: 15000
    });
    console.log("Status:", res.status);
    const $ = cheerio.load(res.data);
    const results = $('.algo-sr');
    console.log("Yahoo Results:", results.length);
    if (results.length === 0) {
      console.log("Check test_yahoo.html for details");
      fs.writeFileSync("test_yahoo.html", res.data);
    } else {
      results.each((i, el) => {
        console.log($(el).find('.title a').attr('href'));
      });
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();