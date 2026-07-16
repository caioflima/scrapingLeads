const puppeteer = require('puppeteer');

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();

  console.log("Navigating to DDG normal...");
  await page.goto("https://duckduckgo.com/?q=Cl%C3%ADnica+de+Psicologia", { waitUntil: "networkidle2" });
  console.log("DDG Title:", await page.title());
  
  await page.waitForSelector('[data-testid="result"]', { timeout: 10000 }).catch(() => {});
  const results = await page.$$eval('[data-testid="result"]', els => els.length);
  console.log("DDG Results count:", results);

  await browser.close();
}
run();