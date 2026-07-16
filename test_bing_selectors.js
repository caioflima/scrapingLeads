const puppeteer = require('puppeteer');

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");

  try {
    await page.goto("https://www.bing.com/search?q=Cl%C3%ADnica+de+Psicologia", { waitUntil: "networkidle2", timeout: 20000 });
    
    const results = await page.$$eval('.b_algo', els => {
      return els.map(el => {
        const title = el.querySelector('h2') ? el.querySelector('h2').innerText : '';
        const href = el.querySelector('h2 a') ? el.querySelector('h2 a').href : (el.querySelector('a') ? el.querySelector('a').href : '');
        const snippet = el.querySelector('p') ? el.querySelector('p').innerText : '';
        return { title, href, snippet };
      });
    });
    console.log(results.slice(0, 3));
  } catch (e) {}

  await browser.close();
}
run();