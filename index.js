import express from "express";
import { chromium } from "playwright";

const app = express();

app.get("/solarlog", async (req, res) => {

  const cid = req.query.cid;

  if (!cid) {
    return res.json({ error: "missing cid" });
  }

  let browser;

  try {

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // =========================
    // CARICAMENTO PAGINA
    // =========================
    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    await page.waitForTimeout(8000);

    // =========================
    // ESTRAZIONE SVG -> VALORI kW
    // =========================
    const values = await page.evaluate(() => {

      const svg = document.querySelector("svg");
      if (!svg) return [];

      const text = svg.innerHTML || "";

      const matches = text.match(/(\d+(\.\d+)?)\s*kW/g) || [];

      return matches;
    });

    await browser.close();

    // =========================
    // PULIZIA DATI
    // =========================
    const clean = values
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v));

    if (clean.length < 2) {
      return res.json({
        plant: cid,
        error: "not_enough_data",
        raw: values
      });
    }

    // prendi ultimi 2 valori (inverter A/B)
    const lastTwo = clean.slice(-2);

    const inverter = [
      { id: "A", power: lastTwo[0] },
      { id: "B", power: lastTwo[1] }
    ];

    const total = lastTwo.reduce((a, b) => a + b, 0);

    return res.json({
      plant: cid,
      timestamp: Date.now(),
      inverter,
      total
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
  console.log("SolarLog API running on port " + PORT);
});
