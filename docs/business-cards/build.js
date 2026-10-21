// Renders business-cards.html to print-ready PDF and PNG previews.
//   node docs/business-cards/build.js
// Writes, next to this file:
//   civil-digital-business-card.pdf   2 pages, 88 x 58 mm (85 x 55 trim + 1.5 mm bleed)
//   preview-front.png, preview-back.png   trimmed to 85 x 55 mm, for checking
// Needs Playwright with Chromium (set PLAYWRIGHT_PATH if it is not resolvable)
// and Python with pypdf, for set-boxes.py.
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const dir = __dirname;
const page_url = 'file://' + path.join(dir, 'business-cards.html');
const mm = 96 / 25.4;   // CSS px per mm
const bleed = 1.5;       // mm each side, as in business-cards.html
const scale = 1200 / 88; // preview width ~1200 px across the bleed page

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(page_url, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  // Chromium rounds the page size, so the CSS page is 1 mm larger than the
  // card, with the card at its top-left; set-boxes.py crops to 88 x 58 mm.
  const pdf = path.join(dir, 'civil-digital-business-card.pdf');
  await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true });
  execFileSync('python3', [path.join(dir, 'set-boxes.py'), pdf], { stdio: 'inherit' });

  const shots = await browser.newPage({ deviceScaleFactor: scale / mm });
  await shots.goto(page_url, { waitUntil: 'networkidle' });
  await shots.emulateMedia({ media: 'print' });
  for (const side of ['front', 'back']) {
    const box = await shots.locator('.' + side).boundingBox();
    await shots.screenshot({
      path: path.join(dir, `preview-${side}.png`),
      clip: { x: box.x + bleed * mm, y: box.y + bleed * mm, width: 85 * mm, height: 55 * mm },
    });
  }
  await browser.close();
})();
