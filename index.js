import express from "express";
import { chromium } from "playwright";

const app = express();

// =========================
// CONFIG IMPIANTI
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
// FUNZIONE SCRAPING SINGOLO IMPIANTO
// =========================
async function fetchPlant(browser, cid) {

  const page = await browser.newPage();

  try {

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    await page.waitForTimeout(8000);

    const values = await page.evaluate(() => {

      const svg = document.querySelector("svg");
      if (!svg) return [];

      const text = svg.innerHTML || "";

      const matches = text.match(/(\d+(\.\d+)?)\s*kW/g) || [];

      return matches;
    });

    const clean = values
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v));

    const lastTwo = clean.slice(-2);

    const inverter = [
      { id: "A", power: lastTwo[0] || 0 },
      { id: "B", power: lastTwo[1] || 0 }
    ];

    const total = inverter.reduce((a, b) => a + b.power, 0);

    await page.close();

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
// API ENDPOINT
// =========================
app.get("/solarlog", async (req, res) => {

  let browser;

  try {

  let cids = req.query.cid;

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

    // sequenziale (più stabile su Render)
    for (const cid of cids) {
      const data = await fetchPlant(browser, cid.trim());
      results.push(data);
    }

    await browser.close();

    // =========================
    // TOTALE GENERALE
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Multi SolarLog API running");
});
