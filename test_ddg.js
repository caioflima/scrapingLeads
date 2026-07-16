const axios = require('axios');
const cheerio = require('cheerio');

async function search(query) {
  try {
    const res = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result__url').each((i, el) => {
      results.push($(el).text().trim());
    });
    console.log(results);
  } catch (e) {
    console.error(e.message);
  }
}
search('Studio Mix Cabelo & Estética');
