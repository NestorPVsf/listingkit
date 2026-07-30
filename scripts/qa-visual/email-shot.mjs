import { chromium } from "playwright";
import path from "node:path";

const preset = process.argv[2];
const fileUrl = "file:///" + path.join(process.cwd(), `output/qa-visual/${preset}/email.html`).replaceAll("\\", "/");

const browser = await chromium.launch();
for (const [label, width] of [["mobile", 375], ["desktop", 1000]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(fileUrl);
  await page.screenshot({ path: `output/qa-visual/_email-${preset}-${label}.png`, fullPage: true });
}
await browser.close();
console.log("done");
