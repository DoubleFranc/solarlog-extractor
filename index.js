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

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    // 🔥 aspetta rendering completo SVG
    await page.waitForTimeout(8000);

    // =========================
    // SVG EXTRACTION DIRETTA
    // =========================
    const result = await page.evaluate(() => {

      const svgText = document.querySelector("svg")?.innerHTML || "";

      // 🔥 trova tutti i valori kW nel SVG
      const matches = svgText.match(/(\d{1,4}\.\d{1,2})\s*kW/g) || [];

      // pulizia duplicati
      const unique = [...new Set(matches)];

      return unique;
    });

    await browser.close();

    return res.json({
      plant: cid,
      timestamp: Date.now(),
      values_found: result
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
  console.log("SolarLog extractor running");
});
