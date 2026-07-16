const puppeteer = require('puppeteer');

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");

  console.log("Navigating to Bing...");
  try {
    await page.goto("https://www.bing.com/search?q=Cl%C3%ADnica+de+Psicologia", { waitUntil: "networkidle2", timeout: 20000 });
    console.log("Bing Title:", await page.title());
    
    let results = await page.$$eval('.b_algo', els => els.length);
    console.log("Bing Results count:", results);
    if (results > 0) {
      const titles = await page.$$eval('.b_algo h2', els => els.map(e => e.innerText));
      console.log(titles.slice(0, 2));
    }
  } catch (e) {
    console.log("Error:", e.message);
  }

  await browser.close();
}
run();