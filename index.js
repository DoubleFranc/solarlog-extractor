import express from "express";
import { chromium } from "playwright";

const app = express();

const PLANTS = {
  "24468": "Villetta",
  "24474": "Villetta2",
  "24486": "Sud",
  "24490": "Centro",
  "24563": "Nord",
  "24655": "Vallicelletta",
  "24669": "Vallicelletta2"
};

// =========================
// BROWSER SINGLETON (ANTI CRASH)
// =========================
let browser;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });
  }
  return browser;
}

// =========================
// RETRY SAFE SCRAPER
// =========================
async function fetchPlant(browser, cid, attempt = 1) {

  const page = await browser.newPage();

  try {

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "domcontentloaded" }
    );

    // 🔥 WAIT PIÙ INTELLIGENTE (NON BLOCCANTE)
    await page.waitForTimeout(5000);

    const values = await page.evaluate(() => {

      const svg = document.querySelector("svg");
      if (!svg) return [];

      const texts = Array.from(svg.querySelectorAll("text"));

      const out = [];

      for (const t of texts) {

        const txt = (t.textContent || "").trim();

        // 🔥 filtro meno restrittivo (IMPORTANTISSIMO)
        const match = txt.match(/(\d+(\.\d+)?)\s*kW/);

        if (match) {
          out.push(parseFloat(match[1]));
        }
      }

      return out;
    });

    await page.close();

    const clean = values.filter(v => !isNaN(v));

    // 🔥 RETRY LOGIC (fondamentale su Render)
    if (clean.length < 2 && attempt <= 2) {
      return fetchPlant(browser, cid, attempt + 1);
    }

    const lastTwo = clean.slice(-2);

    return {
      cid,
      name: PLANTS[cid] || "unknown",
      inverter: [
        { id: "A", power: lastTwo[0] || 0 },
        { id: "B", power: lastTwo[1] || 0 }
      ],
      total: (lastTwo[0] || 0) + (lastTwo[1] || 0)
    };

  } catch (err) {

    await page.close();

    return {
      cid,
      error: err.message
    };
  }
}

// =========================
// API
// =========================
app.get("/solarlog", async (req, res) => {

  try {

    const browser = await getBrowser();

    let cids = req.query.cid;

    if (!cids) cids = Object.keys(PLANTS);
    else cids = cids.split(",");

    const results = [];

    // 🔥 SEMPRE SEQUENZIALE SU RENDER FREE
    for (const cid of cids) {
      results.push(await fetchPlant(browser, cid.trim()));
    }

    const global_total = results.reduce((a, b) => a + (b.total || 0), 0);

    return res.json({
      timestamp: Date.now(),
      plants: results,
      global_total
    });

  } catch (err) {

    return res.json({
      error: "runtime_error",
      message: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("RENDER STABLE SOLARLOG API RUNNING");
});
