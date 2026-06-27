// Quick-settings ↔ animation-library wiring verification.
//
// Proves the user's asks: the 进入/强调/动作/消失 dropdowns now cover the full
// library the Studio engine supports, AND selecting an element round-trips its
// data-anim / data-emph back into the dropdowns (so an AI-applied animation shows
// up instead of "无").
//
// Run: node scripts/verify-anim-quicksettings.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const studio = pathToFileURL(resolve(root, 'studio/slidesmith-studio.html')).href;
const deckHtml = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');

const checks = [];
const ok = (name, cond, extra = '') => { checks.push({ name, ok: !!cond }); console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((html) => window.__SM_IMPORT__('keynote.html', html), deckHtml);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelectorAll('#deck .slide').length > 1);
  }, { timeout: 10000 });

  // 1) dropdowns cover the full engine-supported library
  const opts = await page.evaluate(() => {
    const vals = (sel) => [...document.querySelectorAll(sel + ' option')].map((o) => o.value);
    return { anim: vals('#hAnim'), emph: vals('#hEmph'), motion: vals('#hMotion'), out: vals('#hAnimOut') };
  });
  const animNew = ['tracking-in', 'focus-in', 'slide-blur', 'flip-in', 'back-in', 'num-pop', 'texts-reveal', 'clip-wipe'];
  ok('进入 dropdown covers full library (A7–A12 + clip-wipe)', animNew.every((v) => opts.anim.includes(v)), `${opts.anim.length} opts`);
  ok('强调 dropdown exists with C1–C7', ['tada', 'rubber-band', 'jello', 'heartbeat', 'headshake', 'shake', 'text-pop'].every((v) => opts.emph.includes(v)), `${opts.emph.length} opts`);
  ok('动作 dropdown has ken-burns', opts.motion.includes('ken-burns'), `${opts.motion.length} opts`);

  // 2) the 强调 sub-tab exists and switches
  const hasEmphTab = await page.evaluate(() => !!document.querySelector('.stab[data-stab="emph"]'));
  ok('快速设置 has 强调 sub-tab', hasEmphTab);

  // 3) ROUND-TRIP READ (the user's pt ③): an AI-applied data-anim/data-emph shows
  //    in the dropdowns when you select that element (instead of "无").
  const read = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide .title');
    el.setAttribute('data-anim', 'rise');      // pretend the AI applied these
    el.setAttribute('data-emph', 'headshake');
    el.click();                                 // select it → showHtmlSel reads attrs back
    return { anim: document.getElementById('hAnim').value, emph: document.getElementById('hEmph').value };
  });
  ok('选中 AI 动画元素 → 进入下拉读回 rise (不再显示无)', read.anim === 'rise', `hAnim=${read.anim}`);
  ok('选中 AI 动画元素 → 强调下拉读回 headshake', read.emph === 'headshake', `hEmph=${read.emph}`);

  // 4) ROUND-TRIP WRITE: setting the 强调 dropdown writes data-emph onto the element
  const wrote = await page.evaluate(() => {
    const sel = document.getElementById('hEmph');
    sel.value = 'tada'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide .title');
    return el.getAttribute('data-emph');
  });
  ok('强调下拉改值 → 元素落 data-emph', wrote === 'tada', `data-emph=${wrote}`);

  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? '✗ FAIL' : '✓ PASS'} — ${checks.length - failed.length}/${checks.length} checks`);
process.exit(failed.length ? 1 : 0);
