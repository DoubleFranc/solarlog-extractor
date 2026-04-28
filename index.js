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

    const networkCalls = [];

    // 🔥 CATTURA TUTTE LE REQUEST REALI
    page.on("request", request => {
      networkCalls.push({
        type: "request",
        url: request.url()
      });
    });

    page.on("response", async response => {
      try {
        const url = response.url();
        const ct = response.headers()["content-type"] || "";

        let text = "";

        try {
          text = await response.text();
        } catch {}

        networkCalls.push({
          type: "response",
          url,
          contentType: ct,
          snippet: text.substring(0, 300)
        });

      } catch {}
    });

    await page.goto(
      `https://emmest.solarlog-portal.it/sds/module/solarlogweb/Statistik.php?c=${cid}`,
      { waitUntil: "networkidle" }
    );

    await page.waitForTimeout(8000);

    await browser.close();

    // 🔥 FILTRA SOLO URL INTERESSANTI
    const filtered = networkCalls.filter(c =>
      c.url.includes("ajax") ||
      c.url.includes("get") ||
      c.url.includes("data") ||
      c.url.includes("chart") ||
      c.url.includes("realtime") ||
      c.url.includes("json")
    );

    return res.json({
      plant: cid,
      total_calls: networkCalls.length,
      interesting_calls: filtered
    });

  } catch (err) {

    if (browser) await browser.close();

    return res.json({
      error: "runtime_error",
      message: err.message
    });
  }
});

app.listen(3000, () => console.log("running"));
