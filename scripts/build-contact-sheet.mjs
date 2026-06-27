// Regenerate the all-skins contact sheet that Step 0 of the editorial-slides skill
// shows inline so the user can browse every skin in a single image.
// Source = gallery/theme-showcase.html (22 live cover iframes). We force every iframe
// to load eagerly (it ships loading="lazy" for the live page) so none render black,
// then full-page screenshot to gallery/theme-contact-sheet.png.
// Run after adding/removing a skin: `node scripts/build-contact-sheet.mjs`
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const root = process.cwd();
const src = 'file://' + resolve(root, 'plugin/slidesmith/skills/editorial-slides/gallery/theme-showcase.html');
const out = resolve(root, 'plugin/slidesmith/skills/editorial-slides/gallery/theme-contact-sheet.png');

const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1320, height: 2600 }, deviceScaleFactor: 1 })).newPage();
  await page.goto(src, { waitUntil: 'load' });
  // defeat loading="lazy": eager-load + re-trigger src so every cover paints before capture
  await page.evaluate(() => {
    document.querySelectorAll('iframe').forEach((f) => {
      f.loading = 'eager'; const s = f.getAttribute('src'); f.setAttribute('src', ''); f.setAttribute('src', s);
    });
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out, fullPage: true });
  console.log('✓ contact sheet →', out);
} finally {
  await browser.close();
}
