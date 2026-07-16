const axios = require('axios');
const fs = require('fs');

async function run() {
  try {
    const res = await axios.get("https://html.duckduckgo.com/html/?q=Cl%C3%ADnica%20de%20Psicologia", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      timeout: 15000
    });
    console.log("Status:", res.status);
    fs.writeFileSync("dgg_test_axios.html", res.data);
    console.log("Written to dgg_test_axios.html");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();
