import express from "express";
import { chromium } from "playwright";

const app = express();

// =========================
// IMPIANTI
// =========================
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
// SCRAPER IMPIANTO
// =========================
async function fetchPlant(browser, cid) {

  const page = await browser.newPage();

  try {

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    // =========================
    // WAIT INTELLIGENTE SVG READY
    // =========================
    await page.waitForFunction(() => {

      const svg = document.querySelector("svg");
      if (!svg) return false;

      const texts = Array.from(svg.querySelectorAll("text"));

      return texts.some(t =>
        /\d+(\.\d+)?\s*kW/.test(t.textContent || "")
      );

    }, { timeout: 25000 });

    // =========================
    // ESTRAZIONE ROBUSTA INVERTER
    // =========================
    const values = await page.evaluate(() => {

      const svg = document.querySelector("svg");
      if (!svg) return [];

      const texts = Array.from(svg.querySelectorAll("text"));

      const out = [];

      for (const t of texts) {

        const txt = (t.textContent || "").trim();

        // filtro intelligente: solo inverter labels
        if (
          txt.includes("S0-IN") ||
          txt.toUpperCase().includes("INVERTER")
        ) {
          const match = txt.match(/(\d+(\.\d+)?)\s*kW/);
          if (match) out.push(parseFloat(match[1]));
        }
      }

      return out;
    });

    await page.close();

    // =========================
    // VALIDAZIONE
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

    // default = tutti impianti
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

    for (const cid of cids) {
      results.push(await fetchPlant(browser, cid.trim()));
    }

    await browser.close();

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
  console.log("SolarLog FINAL API running");
});
