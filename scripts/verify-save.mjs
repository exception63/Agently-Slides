// Save-HTML verification: "保存 HTML" overwrites the opened file in place.
//  (1) toolbar has #saveHtml and the old #expJson/#expMd are gone;
//  (2) with a captured handle, save writes the current exported HTML to that handle
//      (silent overwrite, no picker) — and edits flow through on the next save;
//  (3) with no handle, save calls showSaveFilePicker once, then remembers the handle;
//  (4) no File System Access API → save falls back to downloading a copy.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/save'), { recursive: true });

const checks = [];
const ok = (name, cond, extra = '') => { checks.push({ name, pass: !!cond, extra }); };

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');

  // --- toolbar shape ---
  const toolbar = await page.evaluate(() => ({
    hasSave: !!document.getElementById('saveHtml'),
    hasExpJson: !!document.getElementById('expJson'),
    hasExpMd: !!document.getElementById('expMd'),
    hasExpHtml: !!document.getElementById('expHtml'),
    saveLabel: document.getElementById('saveHtml')?.textContent || '',
  }));
  ok('toolbar has 保存 HTML button', toolbar.hasSave, toolbar.saveLabel);
  ok('old 存 .json button removed', !toolbar.hasExpJson);
  ok('old 存 .md button removed', !toolbar.hasExpMd);
  ok('导出 HTML 副本 still present', toolbar.hasExpHtml);

  // import the keynote deck (no handle yet — like a bridge/plain import)
  await page.evaluate((html) => window.__SM_IMPORT__('keynote-v2.html', html), keynote);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelector('#deck .slide'));
  }, { timeout: 8000 });
  await page.waitForTimeout(500);
  ok('after import, no file handle yet', !(await page.evaluate(() => window.__SM_HAS_FILE_HANDLE__())));

  // install a mock File System Access layer that captures writes into window.__WRITTEN__
  await page.evaluate(() => {
    window.__WRITTEN__ = [];
    window.__PICKER_CALLS__ = 0;
    const makeHandle = (name) => ({
      kind: 'file', name,
      async createWritable() {
        let buf = '';
        return { async write(d) { buf += d; }, async close() { window.__WRITTEN__.push({ name, html: buf }); } };
      },
    });
    window.showSaveFilePicker = async (opts) => {
      window.__PICKER_CALLS__++;
      return makeHandle((opts && opts.suggestedName) || 'picked.html');
    };
  });

  // --- (3) first save: no handle → picker fires once, file written, handle remembered ---
  await page.evaluate(() => window.__SM_SAVE_HTML__());
  await page.waitForFunction(() => window.__WRITTEN__.length >= 1, { timeout: 5000 });
  const firstSave = await page.evaluate(() => ({
    pickerCalls: window.__PICKER_CALLS__,
    written: window.__WRITTEN__[0],
    exported: window.__SM_EXPORT_HTML__(),
    hasHandle: window.__SM_HAS_FILE_HANDLE__(),
  }));
  ok('first save called picker once', firstSave.pickerCalls === 1, 'calls=' + firstSave.pickerCalls);
  ok('first save wrote exported HTML verbatim', firstSave.written.html === firstSave.exported,
    'len ' + firstSave.written.html.length + ' vs ' + firstSave.exported.length);
  ok('first save used suggestedName *.html', /\.html$/.test(firstSave.written.name), firstSave.written.name);
  ok('handle remembered after first save', firstSave.hasHandle);

  // --- (2) edit a page, then save again: silent overwrite (no new picker call) with new content ---
  await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide .cover__title') || d.querySelector('#deck .slide h1, #deck .slide h2');
    if (el) el.textContent = 'SAVE-IN-PLACE ✓';
  });
  await page.evaluate(() => window.__SM_SAVE_HTML__());
  await page.waitForFunction(() => window.__WRITTEN__.length >= 2, { timeout: 5000 });
  const secondSave = await page.evaluate(() => ({
    pickerCalls: window.__PICKER_CALLS__,
    written: window.__WRITTEN__[1],
  }));
  ok('second save did NOT re-prompt (silent overwrite)', secondSave.pickerCalls === 1, 'calls=' + secondSave.pickerCalls);
  ok('second save persisted the edit', secondSave.written.html.includes('SAVE-IN-PLACE ✓'));

  // --- (4) no File System Access API → download fallback ---
  await page.evaluate((html) => window.__SM_IMPORT__('fallback.html', html), keynote); // clears handle
  await page.evaluate(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; });
  await page.waitForTimeout(300);
  const dlPromise = page.waitForEvent('download', { timeout: 5000 }).then((d) => d.suggestedFilename()).catch(() => null);
  await page.evaluate(() => window.__SM_SAVE_HTML__());
  const dlName = await dlPromise;
  ok('no-API fallback downloads a copy', typeof dlName === 'string' && /\.html$/.test(dlName), String(dlName));

  await page.screenshot({ path: resolve(root, 'dist/save/toolbar.png') });
  ok('no page/console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

let pass = 0;
for (const c of checks) {
  console.log((c.pass ? '✓' : '✗') + ' ' + c.name + (c.extra ? '  — ' + c.extra : ''));
  if (c.pass) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
