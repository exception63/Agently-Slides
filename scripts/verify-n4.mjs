// N4 verification: (a) in-Studio visual audit catches an injected overflow,
// (b) PDF export yields one page per slide, (c) applying a patch keeps you on
// that slide (no jump to page 1).
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/n4'), { recursive: true });

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
    return !!(d && d.querySelector('#deck .slide .cover__title'));
  }, { timeout: 8000 });

  // (a1) audit the clean deck
  const cleanFindings = await page.evaluate(() => window.__SM_AUDIT__());

  // (a2) inject an overflowing slide (slide index 3 = SLIDE_MAP s4), then audit
  page.on('console', (m) => errs.push('console:' + m.text()));
  const overflowPatch = '<section class="slide" data-id="s4"><h2 style="font-size:150px;line-height:1.45">超出测试 一<br>二<br>三<br>四<br>五<br>六<br>七<br>八</h2></section>';
  const applyDbg = await page.evaluate((p) => {
    window.__SM_APPLY_PATCH__(p);
    return { exportHasText: window.__SM_EXPORT_HTML__().includes('超出测试') };
  }, overflowPatch);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.textContent && d.textContent.includes('超出测试'));
  }, { timeout: 8000 }).catch(() => {});

  // (c) after the patch, are we still on the patched slide (index 3, 1-based 4)?
  const activeIdx = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const all = Array.prototype.slice.call(d.querySelectorAll('#deck .slide'));
    const a = d.querySelector('#deck .slide.active');
    return a ? all.indexOf(a) : -1;
  });

  // run the audit again + render the report in the panel, screenshot it
  const overflowFindings = await page.evaluate(() => { const f = window.__SM_AUDIT__(); return f; });
  await page.evaluate(() => document.getElementById('auditRun').click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(root, 'dist/n4/audit-report.png') });

  // (b) PDF export — render the print HTML headless and count pages
  const printHtml = await page.evaluate(() => window.__SM_PDF_HTML__());
  const pp = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await pp.setContent(printHtml, { waitUntil: 'load' });
  await pp.waitForTimeout(600);
  const pdfPath = resolve(root, 'dist/n4/deck.pdf');
  await pp.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
  const buf = readFileSync(pdfPath, 'latin1');
  const pageCount = (buf.match(/\/Type\s*\/Page(?![s])/g) || []).length;

  const overflowOnS4 = overflowFindings.some((f) => f.index === 4 && f.code.startsWith('overflow'));
  console.log(JSON.stringify({
    applyDbg,
    cleanFindingCounts: { errors: cleanFindings.filter((f) => f.level === 'error').length, total: cleanFindings.length },
    overflowDetectedOnPatchedSlide: overflowOnS4,
    overflowSample: overflowFindings.filter((f) => f.index === 4),
    activeIdxAfterPatch: activeIdx, positionPreserved: activeIdx === 3,
    pdfPages: pageCount, pdfOK: pageCount === 36,
    pageErrors: errs,
  }, null, 2));
} finally {
  await browser.close();
}
