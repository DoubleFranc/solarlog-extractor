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

    // 🔥 ASPETTA RENDER COMPLETO SVG + JS
    await page.waitForTimeout(8000);

    // =========================
    // DOM EXTRACTION (QUI STA LA SOLUZIONE)
    // =========================
    const result = await page.evaluate(() => {

      const text = document.body.innerText || "";

      // estrai tutti i numeri kW visibili nel DOM
      const matches = text.match(/\d+(\.\d+)?\s?kW/g) || [];

      return matches;
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
  console.log("running");
});
