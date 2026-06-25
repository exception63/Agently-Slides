// N2 verification: import keynote.html, edit a title's text + change the accent
// token, EXPORT the edited HTML, then RE-IMPORT it and assert the edits survived
// (true round-trip). Screenshots before/after.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/n2'), { recursive: true });
const EDITED = '【已就地编辑】人机共生 · 测试标题';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((html) => window.__SM_IMPORT__('keynote-target.html', html), keynote);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    const t = d && d.querySelector('#deck .slide .cover__title, #deck .slide h1, #deck .slide .title');
    return !!(t && (t.textContent || '').trim());
  }, { timeout: 8000 });

  // 0) regression checks: deck's own nav present + slide is 16:9 (not square)
  const display = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const cover = d.querySelector('#deck .slide');
    const r = cover ? cover.getBoundingClientRect() : { width: 0, height: 0 };
    return {
      segs: d.querySelectorAll('.segnav__seg').length,
      thumbs: d.querySelectorAll('.thumb').length,
      coverAspect: r.height ? +(r.width / r.height).toFixed(2) : 0,
      navCollapsed: document.body.classList.contains('navcollapsed'),
    };
  });

  // 1) edit the cover title text inside the edit iframe (contentEditable harvest)
  const titleBefore = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const t = d.querySelector('#deck .slide .cover__title, #deck .slide h1, #deck .slide .title');
    return t ? t.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) : null;
  });
  await page.evaluate((txt) => {
    const d = document.getElementById('preview').contentDocument;
    const t = d.querySelector('#deck .slide .cover__title, #deck .slide h1, #deck .slide .title');
    if (t) { t.focus && t.focus(); t.textContent = txt; }
  }, EDITED);

  // 2) change the accent token via the inspector color input
  await page.evaluate(() => {
    const i = document.getElementById('hAccent');
    i.value = '#ff2d55';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(root, 'dist/n2/edit-cover.png') });

  // 3) export the edited HTML (capture the Blob the download would produce)
  const exported = await page.evaluate(() => window.__SM_EXPORT_HTML__ && window.__SM_EXPORT_HTML__());

  // 4) re-import the exported HTML into a fresh studio page -> assert edits survived
  const page2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page2.on('pageerror', (e) => errs.push('reimport:' + e));
  await page2.goto(studio, { waitUntil: 'load' });
  await page2.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page2.evaluate((html) => window.__SM_IMPORT__('roundtrip.html', html), exported);
  await page2.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    const t = d && d.querySelector('#deck .slide .cover__title, #deck .slide h1, #deck .slide .title');
    return !!(t && (t.textContent || '').trim());
  }, { timeout: 8000 });
  const after = await page2.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const t = d.querySelector('#deck .slide .cover__title, #deck .slide h1, #deck .slide .title');
    const rootCs = getComputedStyle(d.documentElement);
    const slides = document.querySelectorAll('.srow').length;
    return {
      title: t ? t.textContent.replace(/\s+/g, ' ').trim() : null,
      accent: rootCs.getPropertyValue('--accent').trim(),
      slides,
    };
  });
  await page2.screenshot({ path: resolve(root, 'dist/n2/roundtrip.png') });

  console.log(JSON.stringify({
    display,                                  // regression: nav present + 16:9
    aspectOK: display.coverAspect >= 1.6 && display.coverAspect <= 1.85,
    titleBefore,
    textEditSurvived: after.title === EDITED,
    accentAfter: after.accent,
    accentSurvived: /ff2d55/i.test(after.accent),
    slidesAfter: after.slides,
    exportedKB: Math.round((exported || '').length / 1024),
    pageErrors: errs,
  }, null, 2));
} finally {
  await browser.close();
}
