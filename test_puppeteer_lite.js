const puppeteer = require('puppeteer');

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");

  console.log("Navigating to DDG Lite...");
  try {
    await page.goto("https://lite.duckduckgo.com/lite/", { waitUntil: "domcontentloaded", timeout: 20000 });
    console.log("DDG Lite Title:", await page.title());
    
    await page.type('input[name="q"]', 'Clínica de Psicologia');
    await Promise.all([
      page.click('input[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })
    ]);
    
    const results = await page.$$eval('.result-snippet', els => els.length);
    console.log("DDG Lite Results count:", results);
  } catch (e) {
    console.log("Error:", e.message);
  }

  await browser.close();
}
run();