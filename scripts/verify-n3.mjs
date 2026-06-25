// N3 verification: import keynote.html, target one slide, EXPORT an AI change
// request, simulate the AI returning a rewritten <section> patch, APPLY it, and
// assert ONLY that slide changed + it survives export→re-import.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/n3'), { recursive: true });
const MARK = '【AI 改写】这一页已被整页替换';

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

  // target slide index 4 (its own thumbnail click sets the deck active slide)
  await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const th = d.querySelector('.thumb[data-idx="4"]'); if (th) th.click();
  });
  await page.evaluate(() => { document.getElementById('aiInstruction').value = '把这页整体改成一句话的金句版。'; });

  // 1) export the change request
  const req = await page.evaluate(() => window.__SM_AI_REQUEST__());
  writeFileSync(resolve(root, 'dist/n3/' + req.name), req.content);
  const reqOK = req.content.includes('data-id') && req.content.includes('把这页整体改成') && /<section[^>]*class="slide/.test(req.content);

  // 2) simulate the AI: a rewritten <section> patch keeping the SAME data-id
  const patch = `Here is the rewritten slide:\n\n\`\`\`html\n<section class="slide insight" data-id="${req.id}"><div class="insight__eyebrow">AI</div><h2 class="insight__statement" style="font-size:84px;">${MARK}</h2></section>\n\`\`\`\n`;

  // 3) apply the patch
  page.on('console', (m) => errs.push('console:' + m.text()));
  const applyDump = await page.evaluate((p) => {
    window.__SM_APPLY_PATCH__(p);
    return { exportHasMark: window.__SM_EXPORT_HTML__().includes('已被整页替换') };
  }, patch);
  await page.waitForFunction((mark) => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.textContent && d.textContent.includes(mark));
  }, MARK, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: resolve(root, 'dist/n3/patched.png') });
  // scroll the preview to the rewritten slide for a clearer shot
  await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelectorAll('#deck .slide')[4];
    const w = (el && el.closest('.slide-wrap')) || el;
    if (w) w.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(root, 'dist/n3/patched-slide.png') });

  const afterApply = await page.evaluate((mark) => {
    const d = document.getElementById('preview').contentDocument;
    const slides = Array.prototype.slice.call(d.querySelectorAll('#deck .slide'));
    const target = slides[4];
    const cover = d.querySelector('#deck .slide .cover__title');
    return {
      slideCount: slides.length,
      targetHasMark: !!(target && target.textContent.includes(mark)),
      coverUntouched: !!(cover && cover.textContent.includes('人机共生')),
      otherHasMark: slides.filter((s, i) => i !== 4 && s.textContent.includes(mark)).length,
    };
  }, MARK);

  // 4) export -> re-import: patch persists, others intact
  const exported = await page.evaluate(() => window.__SM_EXPORT_HTML__());
  const page2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page2.on('pageerror', (e) => errs.push('reimport:' + e));
  await page2.goto(studio, { waitUntil: 'load' });
  await page2.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page2.evaluate((html) => window.__SM_IMPORT__('roundtrip.html', html), exported);
  await page2.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelector('#deck .slide .cover__title'));
  }, { timeout: 8000 });
  const afterRound = await page2.evaluate((mark) => {
    const d = document.getElementById('preview').contentDocument;
    const slides = Array.prototype.slice.call(d.querySelectorAll('#deck .slide'));
    return {
      slideCount: slides.length,
      targetHasMark: !!(slides[4] && slides[4].textContent.includes(mark)),
      coverUntouched: !!(d.querySelector('#deck .slide .cover__title') || {}).textContent?.includes('人机共生'),
    };
  }, MARK);

  console.log(JSON.stringify({
    requestFile: req.name, requestOK: reqOK, reqId: req.id, applyDump,
    afterApply, afterRound,
    pass: reqOK && afterApply.targetHasMark && afterApply.coverUntouched && afterApply.otherHasMark === 0
      && afterApply.slideCount === 36 && afterRound.targetHasMark && afterRound.coverUntouched && afterRound.slideCount === 36,
    pageErrors: errs,
  }, null, 2));
} finally {
  await browser.close();
}
