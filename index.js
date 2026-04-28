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
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    const responses = [];

    // =========================
    // LISTENER AGGRESSIVO (FIX DEFINITIVO)
    // =========================
    page.on("response", async (response) => {
      try {

        const url = response.url();

        let text = "";

        try {
          text = await response.text();
        } catch {
          return;
        }

        // 🔥 cattura tutto ciò che contiene dati energetici
        if (
          text.includes("kW") ||
          text.includes("kwh") ||
          text.includes("power") ||
          text.includes("W") ||
          /\d+\.\d+\s*kW/.test(text)
        ) {
          responses.push({
            url,
            snippet: text.substring(0, 1500)
          });
        }

      } catch {}
    });

    // =========================
    // NAVIGAZIONE SOLARLOG
    // =========================
    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    // lascia eseguire svg.js + fetch interni
    await page.waitForTimeout(8000);

    await browser.close();

    // =========================
    // RISPOSTA
    // =========================
    return res.json({
      plant: cid,
      timestamp: Date.now(),
      calls_found: responses.length,
      data: responses
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
  console.log("SolarLog extractor running on port " + PORT);
});
