import express from "express";
import { chromium } from "playwright";

const app = express();

// =========================
// IMPIANTI
// =========================
const PLANTS = {
  "24563": "Nord",
  "24490": "Centro",
  "24486": "Sud",
  "24468": "Villetta",
  "24474": "Villetta2",
  "24655": "Vallicelletta",
  "24669": "Vallicelletta2"
};

// =========================
// SCRAPER SINGOLO IMPIANTO
// =========================
async function fetchPlant(browser, cid) {

  const page = await browser.newPage();

  try {

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    // =========================
    // 🔥 WAIT INTELLIGENTE (NON TIMEOUT FISSO)
    // =========================
    await page.waitForFunction(() => {

      const svg = document.querySelector("svg");
      if (!svg) return false;

      const text = svg.innerHTML || "";

      return /\d+(\.\d+)?\s*kW/.test(text);

    }, { timeout: 20000 });

    // =========================
    // 🔥 ESTRAZIONE SICURA
    // =========================
    const values = await page.evaluate(() => {

      const svg = document.querySelector("svg");
      if (!svg) return [];

      const text = svg.innerHTML;

      const matches = [...text.matchAll(/(\d+(\.\d+)?)\s*kW/g)];

      return matches.map(m => parseFloat(m[1]));
    });

    await page.close();

    // =========================
    // PULIZIA
    // =========================
    const clean = values.filter(v => !isNaN(v));

    if (clean.length < 2) {
      return {
        cid,
        name: PLANTS[cid] || "unknown",
        error: "not_enough_data",
        raw: values
      };
    }

    const lastTwo = clean.slice(-2);

    const inverter = [
      { id: "A", power: lastTwo[0] },
      { id: "B", power: lastTwo[1] }
    ];

    const total = inverter.reduce((a, b) => a + b.power, 0);

    return {
      cid,
      name: PLANTS[cid] || "unknown",
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
// API PRINCIPALE
// =========================
app.get("/solarlog", async (req, res) => {

  let browser;

  try {

    let cids = req.query.cid;

    // =========================
    // DEFAULT = TUTTI IMPIANTI
    // =========================
    if (!cids || cids.trim() === "") {
      cids = Object.keys(PLANTS);
    } else {
      cids = cids.split(",");
    }

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const results = [];

    // sequenziale stabile (Render-safe)
    for (const cid of cids) {
      results.push(await fetchPlant(browser, cid.trim()));
    }

    await browser.close();

    // =========================
    // TOTALE GLOBALE
    // =========================
    const globalTotal = results.reduce((sum, p) => {
      return sum + (p.total || 0);
    }, 0);

    return res.json({
      timestamp: Date.now(),
      plants: results,
      global_total: globalTotal
    });

  } catch (err) {

    if (browser) await browser.close();

    return res.json({
      error: "runtime_error",
      message: err.message
    });
  }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("SolarLog Stable API running");
});
