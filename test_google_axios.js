const axios = require('axios');
const fs = require('fs');

async function run() {
  try {
    const res = await axios.get("https://www.google.com/search?q=Cl%C3%ADnica+de+Psicologia", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      timeout: 15000
    });
    console.log("Status:", res.status);
    fs.writeFileSync("google_test_axios.html", res.data);
    console.log("Written to google_test_axios.html");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();
