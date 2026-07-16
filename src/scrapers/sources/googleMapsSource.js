const puppeteer = require("puppeteer");
const { safePhone } = require("./scraperSanitizers");
const {
  pickBestEmailFromMapsProfile,
  extractEmailFromWebsite,
  isScrapableWebsite
} = require("./emailExtractor");

const DEFAULT_GMAPS_TIMEOUT_MS = 45 * 60 * 1000;

function resolveBrowserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

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

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  try {
    return await puppeteer.launch(launchOptions);
  } catch (error) {
    logger.error({ err: error }, "Failed to launch Puppeteer browser");
    throw new Error(
      "Chrome/Chromium nao encontrado para o Puppeteer. Instale com: npx puppeteer browsers install chrome"
    );
  }
}

async function resolveLeadEmail({ mapsEmails, website, logger, name }) {
  const mapsEmail = pickBestEmailFromMapsProfile(mapsEmails, website);
  if (mapsEmail) return mapsEmail.toLowerCase();

  if (!website) return null;
  if (!isScrapableWebsite(website)) return null;

  try {
    const email = await extractEmailFromWebsite(website, { timeoutMs: 12000, maxPages: 4 });
    return email ? email.toLowerCase() : null;
  } catch (err) {
    logger.debug({ website, name, error: err.message }, "Falha ao extrair email do site");
    return null;
  }
}

async function scrapeGoogleMaps(source, config, logger, hooks = {}) {
  const leads = [];
  let browser;
  const onProgress = typeof hooks.onProgress === "function" ? hooks.onProgress : null;
  const timeoutMs = Math.max(60000, Number(config.gmapsTimeoutMs || DEFAULT_GMAPS_TIMEOUT_MS));

  const searchUrl = source.base_url;
  const maxItems = Math.max(1, Number(config.maxItems || 10000));

  const scrapeTask = async () => {
    logger.info({ url: searchUrl }, "Iniciando Puppeteer para Google Maps");
    browser = await launchBrowser(logger);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 45000 });
    await page.waitForSelector('div[role="feed"]', { timeout: 15000 }).catch(() => null);

    let attempts = 0;
    let previousHeight = 0;

    logger.info("Realizando scroll para carregar todos os resultados...");
    while (attempts < 15) {
      const currentHeight = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollBy(0, 5000);
          return feed.scrollHeight;
        }
        return 0;
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const isEnd = await page.evaluate(() => {
        return document.body.innerText.includes("Você chegou ao final da lista")
          || document.body.innerText.includes("You've reached the end of the list");
      });

      if (isEnd) {
        logger.info("Chegou ao final da lista do Google Maps.");
        break;
      }

      if (currentHeight === previousHeight && currentHeight > 0) {
        attempts += 1;
      } else {
        attempts = 0;
        previousHeight = currentHeight;
      }
    }

    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('div[role="feed"] a'));
      return anchors
        .map((anchor) => anchor.href)
        .filter((href) => href.includes("/maps/place/"));
    });

    const uniqueLinks = [...new Set(links)].slice(0, maxItems);
    logger.info({ count: uniqueLinks.length }, "Locais encontrados no Maps");

    if (onProgress) {
      await onProgress({ scraped: uniqueLinks.length, phase: "details" });
    }

    for (const link of uniqueLinks) {
      let detailPage = null;
      try {
        detailPage = await browser.newPage();
        await detailPage.goto(link, { waitUntil: "domcontentloaded", timeout: 20000 });
        await detailPage.waitForSelector("h1", { timeout: 10000 }).catch(() => null);

        const data = await detailPage.evaluate(() => {
          const nameEl = document.querySelector("h1");
          const name = nameEl ? nameEl.innerText : "Nome Não Encontrado";

          const buttons = Array.from(document.querySelectorAll("button"));
          let phone = null;
          let website = null;
          const mapsEmails = [];

          for (const btn of buttons) {
            const text = btn.innerText || "";
            const aria = btn.getAttribute("aria-label") || "";
            const dataItemId = btn.getAttribute("data-item-id") || "";

            if (dataItemId.startsWith("mailto:")) {
              mapsEmails.push(dataItemId.replace(/^mailto:/i, "").split("?")[0]);
            }

            if (text.match(/[\d\s\(\)\-]{8,}/) && !phone) {
              if (!text.includes("CEP") && !text.includes(",")) {
                phone = text.replace(/[^\d\(\)\-\+ ]/g, "").trim();
              }
            }

            const emailInText = `${text} ${aria}`.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (emailInText) {
              mapsEmails.push(...emailInText);
            }
          }

          const anchors = Array.from(document.querySelectorAll("a"));
          let instagram = null;
          let facebook = null;
          let linkedin = null;
          
          for (const anchor of anchors) {
            const href = anchor.href || "";
            if (href.startsWith("mailto:")) {
              mapsEmails.push(href.replace(/^mailto:/i, "").split("?")[0]);
            } else if (href.includes("instagram.com/")) {
              if (!instagram) instagram = href;
            } else if (href.includes("facebook.com/")) {
              if (!facebook) facebook = href;
            } else if (href.includes("linkedin.com/")) {
              if (!linkedin) linkedin = href;
            } else if (href.startsWith("http") && !href.includes("google.com") && !website) {
              website = href;
            }
          }

          const bodyEmails = (document.body.innerText || "").match(
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
          );
          if (bodyEmails) {
            mapsEmails.push(...bodyEmails);
          }

          return { name, phone, website, mapsEmails, instagram, facebook, linkedin };
        });

        await detailPage.close();
        detailPage = null;

        const mapsEmail = pickBestEmailFromMapsProfile(data.mapsEmails, data.website);
        const email = mapsEmail
          || (await resolveLeadEmail({
            mapsEmails: [],
            website: data.website,
            logger,
            name: data.name
          }));

        const validPhone = safePhone(data.phone);
        const hasContact = validPhone || data.instagram || data.facebook || data.linkedin || email;

        const finalEmail = email || (() => {
          let key = Math.floor(Math.random() * 1000000).toString();
          if (validPhone) {
            key = validPhone.replace(/\D/g, "");
          } else if (data.instagram) {
            key = data.instagram.split("/").filter(Boolean).pop() || key;
          } else if (data.facebook) {
            key = data.facebook.split("/").filter(Boolean).pop() || key;
          }
          return `sem-email-${key.replace(/[^a-zA-Z0-9]/g, "")}@mapscraper.local`;
        })();

        if (data.name && data.name !== "Nome Não Encontrado" && hasContact) {
          leads.push({
            name: data.name,
            email: finalEmail.toLowerCase(),
            phone: validPhone,
            raw_data: {
              source: "Google Maps",
              website: data.website,
              maps_url: link,
              instagram: data.instagram,
              facebook: data.facebook,
              linkedin: data.linkedin,
              scraped_phone: data.phone,
              email_from_maps: !!mapsEmail,
              email_from_website: !!email && !mapsEmail
            }
          });
        } else {
          logger.debug({ name: data.name, hasContact }, "Lead descartado por falta de contato (telefone, email ou rede social)");
        }

        if (onProgress) {
          await onProgress({ scraped: leads.length, phase: "details" });
        }
      } catch (errDetail) {
        logger.warn({ link, error: errDetail.message }, "Erro ao extrair detalhes de um local");
      } finally {
        if (detailPage) {
          await detailPage.close().catch(() => {});
        }
      }
    }
  };

  try {
    await Promise.race([
      scrapeTask(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Google Maps scraping exceeded ${Math.round(timeoutMs / 60000)} minutes`));
        }, timeoutMs).unref();
      })
    ]);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return leads;
}

module.exports = {
  scrapeGoogleMaps
};
