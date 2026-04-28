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
// 🔥 REAL SOURCE INTERCEPT (JS HOOKING)
// =========================
async function fetchPlant(browser, cid) {

  const page = await browser.newPage();

  try {

    const values = [];

    // 🔥 INTERCEPT JS FUNCTIONS BEFORE PAGE RUNS
    await page.addInitScript(() => {

      window.__solarlog_data = [];

      const originalSetVar = window.setVar;

      if (originalSetVar) {
        window.setVar = function (...args) {

          try {
            window.__solarlog_data.push(args);
          } catch (e) {}

          return originalSetVar.apply(this, args);
        };
      }

    });

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "domcontentloaded" }
    );

    await page.waitForTimeout(6000);

    const data = await page.evaluate(() => window.__solarlog_data || []);

    await page.close();

    // =========================
    // PARSING REAL DATA STREAM
    // =========================
    const inverter = [
      { id: "A", power: 0 },
      { id: "B", power: 0 }
    ];

    for (const d of data) {

      // tipico: setVar('inv', 2)
      if (Array.isArray(d)) {

        const val = d.find(v => typeof v === "number");

        if (val !== undefined) {
          if (inverter[0].power === 0) inverter[0].power = val;
          else inverter[1].power = val;
        }
      }
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
  console.log("SOLARLOG INTERCEPT ENGINE RUNNING");
});
