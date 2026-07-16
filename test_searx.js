const axios = require('axios');

async function run() {
  try {
    const res = await axios.get("https://searx.be/search?q=Cl%C3%ADnica+de+Psicologia&format=json", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      timeout: 15000
    });
    console.log("Status:", res.status);
    console.log("SearX Results:", res.data.results.length);
    console.log(res.data.results.slice(0, 2).map(r => r.url));
  } catch (error) {
    console.error("Error:", error.message);
  }
}
run();