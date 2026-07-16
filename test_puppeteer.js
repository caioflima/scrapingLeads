const puppeteer = require('puppeteer');

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  
//  console.log("Navigating to DDG...");
//  await page.goto("https://html.duckduckgo.com/html/?q=Cl%C3%ADnica%20de%20Psicologia", { waitUntil: "networkidle2" });
//  console.log("DDG Title:", await page.title());
//  let results = await page.$$eval('.result', els => els.length);
//  console.log("DDG Results count:", results);

  console.log("Navigating to Google...");
  await page.goto("https://www.google.com/search?q=Cl%C3%ADnica+de+Psicologia", { waitUntil: "networkidle2" });
  console.log("Google Title:", await page.title());
  results = await page.$$eval('div.g', els => els.length);
  console.log("Google Results count:", results);

  await browser.close();
}
run();