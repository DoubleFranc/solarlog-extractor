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
// BROWSER SINGLETON (CRUCIALE)
// =========================
let browser;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  }
  return browser;
}

// =========================
// SCRAPER SAFE (NO MEMORY SPIKE)
// =========================
async function fetchPlant(browser, cid) {

  const page = await browser.newPage();

  try {

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "domcontentloaded" }
    );

    await page.waitForTimeout(3000);

    const values = await page.evaluate(() => {

      const svg = document.querySelector("svg");
      if (!svg) return [];

      const texts = Array.from(svg.querySelectorAll("text"));

      const out = [];

      for (const t of texts) {
        const txt = t.textContent || "";

        if (txt.includes("S0-IN") || txt.includes("INVERTER")) {
          const m = txt.match(/(\d+(\.\d+)?)\s*kW/);
          if (m) out.push(parseFloat(m[1]));
        }
      }

      return out;
    });

    await page.close();

    const clean = values.filter(v => !isNaN(v));

    const lastTwo = clean.slice(-2);

    return {
      cid,
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

    // 🔥 IMPORTANT: sequenziale (NO PARALLEL)
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
  console.log("MEMORY SAFE API RUNNING");
});
