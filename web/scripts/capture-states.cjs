// Retakes the home page's four product captures (public/captures/*.png) from the running app.
// The current ones came from a stand-in model; retake them once the trained model is served.
//
//   1. Run the app with the trained model (docker compose up, or the dev setup in the READMEs).
//   2. node scripts/capture-states.cjs <photo the model is sure about> <photo it is not sure about>
//
// Needs Playwright with Chromium (npx playwright install chromium, or a global install).
// Element captures at 2x: the answer block, the "not sure" card, the empty picker and the top-3 bars.
const { chromium } = require("playwright");
const path = require("node:path");

const [sure, unsure] = process.argv.slice(2);
const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = path.join(__dirname, "..", "public", "captures");
if (!sure || !unsure) {
  console.error("usage: node scripts/capture-states.cjs <sure-photo> <unsure-photo>");
  process.exit(1);
}

async function scan(page, photo) {
  await page.goto(BASE + "/scan");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.setInputFiles('input[aria-label="Upload a photo"]', photo);
  await page.getByRole("button", { name: /Sort it/ }).click();
  await page.getByRole("heading", { name: "Here's where it goes" }).waitFor();
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();

  await page.goto(BASE + "/scan");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-capture="picker"]').screenshot({ path: path.join(OUT, "picker.png") });

  await scan(page, sure);
  if (!(await page.locator('[data-capture="answer"]').count())) throw new Error(`the model was not sure about ${sure}`);
  await page.locator('[data-capture="answer"]').screenshot({ path: path.join(OUT, "answer.png") });
  await page.locator('[data-capture="top3"] summary').click();
  await page.locator('[data-capture="top3"] .more__body').screenshot({ path: path.join(OUT, "top3.png") });

  await scan(page, unsure);
  if (!(await page.locator('[data-capture="notsure"]').count())) throw new Error(`the model was sure about ${unsure}`);
  await page.locator('[data-capture="notsure"]').screenshot({ path: path.join(OUT, "notsure.png") });

  await browser.close();
  console.log("Saved 4 captures in", OUT, "- update their CSS sizes (half the pixel size) in src/pages/HomePage.tsx");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
