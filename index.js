import express from "express";
import { chromium } from "playwright";

const app = express();

// endpoint principale
app.get("/solarlog", async (req, res) => {

  const cid = req.query.cid;

  if (!cid) {
    return res.json({ error: "missing cid" });
  }

  let browser;

  try {
    browser = await chromium.launch({
      args: ["--no-sandbox"]
    });

    const page = await browser.newPage();

    let responses = [];

    // intercetta tutte le risposte di rete
    page.on("response", async (response) => {
      try {
       const url = response.url();
const ct = response.headers()["content-type"] || "";

// 🔥 intercetta solo chiamate utili reali
if (
  ct.includes("json") ||
  url.includes("ajax") ||
  url.includes("Get") ||
  url.includes("Data") ||
  url.includes("Realtime") ||
  url.includes("chart")
) {
  const text = await response.text();

  if (
    text.includes("kW") ||
    text.includes("power") ||
    text.includes("W")
  ) {
    responses.push({
      url,
      snippet: text.substring(0, 800)
    });
  }
}
      } catch {}
    });

    // vai alla pagina SolarLog
    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    // aspetta esecuzione JS
    await page.waitForTimeout(6000);

    await browser.close();

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

// porta (Render la imposta automaticamente)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
