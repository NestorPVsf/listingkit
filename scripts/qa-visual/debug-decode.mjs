import { chromium } from "playwright";

const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (msg) => console.log("[console]", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("requestfailed", (req) => console.log("[requestfailed]", req.url(), req.failure()?.errorText));
page.on("response", (res) => {
  if (res.url().includes("/api/assets/")) {
    console.log("[response]", res.status(), res.url(), res.headers()["content-type"], res.headers()["content-length"]);
  }
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("[data-piece-canvas]", { state: "visible" });

const result = await page.evaluate(async () => {
  const images = Array.from(document.images);
  const out = [];
  for (const image of images) {
    let status = "ok";
    try {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", (e) => reject(e), { once: true });
        });
      }
      await image.decode();
    } catch (e) {
      status = String(e);
    }
    out.push({
      src: image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      complete: image.complete,
      status,
    });
  }
  return out;
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
