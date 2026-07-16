const puppeteer = require("puppeteer");
const { safePhone } = require("./scraperSanitizers");
const { extractEmailFromWebsite, isScrapableWebsite } = require("./emailExtractor");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhoneCandidate(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) return null;
  const area = digits.slice(0, 2);
  const body = digits.slice(2);
  if (area.startsWith("0") || area.startsWith("1") || body.startsWith("0") || body.startsWith("1")) return null;
  if (body.length === 9) return `(${area}) ${body.slice(0, 5)}-${body.slice(5)}`;
  return `(${area}) ${body.slice(0, 4)}-${body.slice(4)}`;
}

function resolveBrowserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return puppeteer.executablePath();
  } catch (error) {
    return null;
  }
}

async function launchBrowser(logger) {
  const executablePath = resolveBrowserExecutable();
  const launchOptions = {
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  };
  if (executablePath) launchOptions.executablePath = executablePath;

  try {
    return await puppeteer.launch(launchOptions);
  } catch (error) {
    logger.error({ err: error }, "Failed to launch Puppeteer browser");
    throw new Error("Chrome/Chromium nao encontrado para o Puppeteer. Instale com: npx puppeteer browsers install chrome");
  }
}

async function scrapeWebKeyword(source, config, logger, hooks = {}) {
  const leads = [];
  const onProgress = typeof hooks.onProgress === "function" ? hooks.onProgress : null;
  
  // Transform duckduckgo url to bing to avoid blocks
  let searchUrl = source.base_url;
  if (searchUrl.includes("duckduckgo.com")) {
    const urlObj = new URL(searchUrl);
    const q = urlObj.searchParams.get("q");
    searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(q || "")}`;
  }
  
  logger.info({ url: searchUrl }, "Iniciando Web Search via Puppeteer (Bing)");

  let browser;
  let rawResults = [];
  try {
    browser = await launchBrowser(logger);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    
    // Auto scroll slightly to ensure all results load
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(1000);

    rawResults = await page.$$eval('.b_algo', els => {
      return els.map(el => {
        const title = el.querySelector('h2') ? el.querySelector('h2').innerText : '';
        let href = el.querySelector('h2 a') ? el.querySelector('h2 a').href : (el.querySelector('a') ? el.querySelector('a').href : '');
        const snippet = el.querySelector('p') ? el.querySelector('p').innerText : '';
        const cite = el.querySelector('cite') ? el.querySelector('cite').innerText : '';
        return { title, href, snippet, cite };
      });
    });
    await browser.close();
  } catch (error) {
    logger.error({ err: error.message }, "Erro ao buscar na Web via Puppeteer");
    if (browser) await browser.close().catch(() => {});
    return leads;
  }

  let toScrape = [];

  for (const item of rawResults) {
    let href = item.href;
    
    // Decode Bing URL redirect if present
    if (href.includes('u=a1')) {
      try {
        const b64 = href.split('u=a1')[1].split('&')[0];
        href = Buffer.from(b64, 'base64').toString('utf8');
      } catch(e) {}
    } else if (!href && item.cite) {
       href = item.cite;
    }

    if (!href) continue;
    if (!href.startsWith("http")) href = "https://" + href;

    const isSocial = href.includes("instagram.com") || href.includes("facebook.com") || href.includes("linkedin.com");
    
    if (isSocial) {
       const snippet = item.snippet;
       const emails = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
       let email = emails.length > 0 ? emails[0].toLowerCase() : null;
       
       const phones = snippet.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/g) || [];
       let phone = null;
       for (const p of phones) {
         const candidate = normalizePhoneCandidate(p);
         if (candidate) { phone = candidate; break; }
       }
       
       const finalEmail = email || (() => {
         let key = Math.floor(Math.random() * 1000000).toString();
         if (phone) key = phone.replace(/\D/g, "");
         else {
           const parts = href.split("/");
           const last = parts[parts.length - 1] || parts[parts.length - 2];
           if (last) key = last.replace(/[^a-zA-Z0-9]/g, "");
         }
         return `sem-email-${key}@social.local`;
       })();
       
       leads.push({
         name: item.title || "Lead Social",
         email: finalEmail.toLowerCase(),
         phone: safePhone(phone),
         raw_data: {
           source: "Web Search (Social)",
           social_url: href,
           snippet: snippet,
           scraped_phone: phone,
           scraped_email: email
         }
       });
    } else if (isScrapableWebsite(href)) {
       toScrape.push(href);
    }
  }

  // Remove duplicates
  toScrape = [...new Set(toScrape)];
  logger.info({ count: toScrape.length, social_leads: leads.length }, "Sites encontrados via Web Search");

  if (onProgress) {
    await onProgress({ scraped: leads.length, phase: "details" });
  }

  for (let i = 0; i < toScrape.length; i++) {
    const website = toScrape[i];
    try {
      logger.debug({ website }, "Analisando site");
      
      let email = await extractEmailFromWebsite(website, { timeoutMs: 15000, maxPages: 2 });
      
      // We no longer download the whole page here to parse phone because extractEmailFromWebsite does it
      // However, we still want phone numbers! Let's fetch the homepage just for phones if we want it.
      let phone = null;
      let title = "Lead Web";
      
      try {
        const pageRes = await puppeteerFetchHTML(website); 
        if (pageRes) {
          title = pageRes.title;
          const bodyText = pageRes.text;
          
          if (!email) {
            const emails = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
            if (emails.length > 0) email = emails[0].toLowerCase();
          }

          const phones = bodyText.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/g) || [];
          for (const p of phones) {
            const candidate = normalizePhoneCandidate(p);
            if (candidate) {
              phone = candidate;
              break;
            }
          }
        }
      } catch (e) {}

      const finalEmail = email || (() => {
        const phoneKey = phone ? phone.replace(/\D/g, "") : Math.floor(Math.random() * 1000000).toString();
        return `sem-email-${phoneKey}@webscraper.local`;
      })();

      if (title && (phone || email)) {
        leads.push({
          name: title,
          email: finalEmail.toLowerCase(),
          phone: safePhone(phone),
          raw_data: {
            source: "Web Search",
            website: website,
            scraped_phone: phone,
            scraped_email: email
          }
        });
      }

    } catch (err) {
       logger.debug({ website, error: err.message }, "Erro ao extrair do site");
    }

    if (onProgress) {
      await onProgress({ scraped: leads.length, phase: "details" });
    }
    
    await sleep(1000); // polite delay
  }

  return leads;
}

async function puppeteerFetchHTML(url) {
  let browser;
  try {
    browser = await launchBrowser({ error: () => {} });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const title = await page.title();
    const text = await page.evaluate(() => document.body.innerText);
    await browser.close();
    return { title: title.substring(0, 100), text: text.replace(/\s+/g, " ") };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

module.exports = {
  scrapeWebKeyword
};
