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
// 🔥 TRUE DATA EXTRACTION (JS CONTEXT)
// =========================
async function fetchPlant(browser, cid) {

  const page = await browser.newPage();

  try {

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "domcontentloaded" }
    );

    // 🔥 aspetta JS init
    await page.waitForTimeout(5000);

    const data = await page.evaluate(() => {

      // 🔥 PROVA ACCESSO VARS GLOBALI (SOLARLOG CORE)
      try {

        if (typeof window.vars !== "undefined") {
          return window.vars;
        }

        if (typeof vars !== "undefined") {
          return vars;
        }

        if (typeof btns !== "undefined") {
          return btns;
        }

      } catch (e) {}

      return null;
    });

    await page.close();

    // =========================
    // FALLBACK SICURO
    // =========================
    const inverter = [
      { id: "A", power: 0 },
      { id: "B", power: 0 }
    ];

    // 🔥 PROVA INTERPRETAZIONE DATI JS
    if (Array.isArray(data)) {

      const values = data
        .map(d => d?.val || d?.value)
        .filter(v => typeof v === "number");

      inverter[0].power = values[0] || 0;
      inverter[1].power = values[1] || 0;
    }

    const total = inverter[0].power + inverter[1].power;

    return {
      cid,
      name: PLANTS[cid],
      inverter,
      total
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
  console.log("SOLARLOG JS SOURCE API RUNNING");
});
