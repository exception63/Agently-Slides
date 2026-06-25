// N1 verification: load the built Studio, import the real keynote.html contract
// deck via the __SM_IMPORT__ hook, assert it parsed, and screenshot.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/n1'), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((html) => window.__SM_IMPORT__('keynote-target.html', html), keynote);
  await page.waitForTimeout(2000); // iframe self-renders + engine builds segnav/thumbs

  const rows = await page.evaluate(() => document.querySelectorAll('.srow').length);
  const banner = await page.evaluate(() => {
    const b = document.getElementById('htmlbanner');
    return b ? getComputedStyle(b).display : 'missing';
  });
  // inspect inside the deck iframe: did its own engine build segnav + thumbnails?
  const inside = await page.evaluate(() => {
    const ifr = document.getElementById('preview');
    const d = ifr && ifr.contentDocument;
    if (!d) return null;
    return {
      slides: d.querySelectorAll('#deck > .slide').length,
      segs: d.querySelectorAll('.segnav__seg').length,
      thumbs: d.querySelectorAll('.thumb').length,
    };
  });

  await page.screenshot({ path: resolve(root, 'dist/n1/studio-import.png') });

  // click slide 20 in Studio's left list -> the iframe should scroll there
  await page.evaluate(() => document.querySelectorAll('.srow')[19]?.click());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(root, 'dist/n1/studio-jump20.png') });

  console.log(JSON.stringify({ leftRows: rows, banner, inside, pageErrors: errs }, null, 2));
} finally {
  await browser.close();
}
