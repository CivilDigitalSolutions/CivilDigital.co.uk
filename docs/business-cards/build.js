// Renders business-cards.html to print-ready PDF and PNG previews.
//   node docs/business-cards/build.js
// Writes, next to this file:
//   civil-digital-business-card.pdf   2 pages, 91 x 61 mm (85 x 55 trim + 3 mm bleed)
//   preview-front.png, preview-back.png   trimmed to 85 x 55 mm, for checking
// Needs Playwright with Chromium; set PLAYWRIGHT_PATH if it is not resolvable.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const dir = __dirname;
const page_url = 'file://' + path.join(dir, 'business-cards.html');
const mm = 96 / 25.4;   // CSS px per mm
const scale = 1200 / 91; // preview width ~1200 px across the bleed page

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(page_url, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: path.join(dir, 'civil-digital-business-card.pdf'),
    width: '91mm', height: '61mm', printBackground: true, preferCSSPageSize: true,
  });

  const shots = await browser.newPage({ deviceScaleFactor: scale / mm });
  await shots.goto(page_url, { waitUntil: 'networkidle' });
  await shots.emulateMedia({ media: 'print' });
  for (const side of ['front', 'back']) {
    const box = await shots.locator('.' + side).boundingBox();
    await shots.screenshot({
      path: path.join(dir, `preview-${side}.png`),
      clip: { x: box.x + 3 * mm, y: box.y + 3 * mm, width: 85 * mm, height: 55 * mm },
    });
  }
  await browser.close();
})();
