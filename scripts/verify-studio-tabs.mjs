// Verify the Keynote-style Studio rework: 3 top tabs (格式 / 动画效果 / AI 修改),
// font picker, B/I/U + alignment toggles, animation sub-tabs (进入 / 动作 / 消失) with
// a new exit animation, the 嵌入字体 export option, and that exit-on-nav works in the
// exported deck. Network is used only for the font-embedding check (skipped if offline).
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const deckHtml = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/tabs'), { recursive: true });

const checks = [];
const ok = (name, cond, extra = '') => checks.push({ name, pass: !!cond, extra });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((html) => window.__SM_IMPORT__('keynote.html', html), deckHtml);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelector('#deck .slide'));
  }, { timeout: 8000 });
  await page.waitForTimeout(700);

  // 1) three top tabs + embed checkbox + control shape
  const shape = await page.evaluate(() => {
    const htabs = [...document.querySelectorAll('.htab')].map((b) => b.textContent.trim());
    const stabs = [...document.querySelectorAll('.stab')].map((b) => b.textContent.trim());
    const fontOpts = [...document.querySelectorAll('#hFont option')].map((o) => o.value).filter(Boolean);
    const motionOpts = [...document.querySelectorAll('#hMotion option')].map((o) => o.value);
    const outOpts = [...document.querySelectorAll('#hAnimOut option')].map((o) => o.value);
    return {
      htabs, stabs, fontCount: fontOpts.length,
      hasNoto: fontOpts.includes('noto-sc'), hasInter: fontOpts.includes('inter'),
      hasShimmer: motionOpts.includes('shimmer'),
      outOpts,
      embed: !!document.getElementById('embedFonts'),
      bold: !!document.getElementById('hBold'), italic: !!document.getElementById('hItalic'),
      under: !!document.getElementById('hUnder'),
      align: !!document.getElementById('hAlignL') && !!document.getElementById('hAlignC') && !!document.getElementById('hAlignR'),
      oldAiPanel: !document.getElementById('aiPaste'),
    };
  });
  ok('3 top tabs = 格式/动画效果/AI 修改', shape.htabs.join(',') === '格式,动画效果,AI 修改', shape.htabs.join(','));
  ok('animation sub-tabs = 进入/动作/消失', shape.stabs.join(',') === '进入,动作,消失', shape.stabs.join(','));
  ok('font picker populated (≥12 fonts)', shape.fontCount >= 12, 'got ' + shape.fontCount);
  ok('font picker has CJK (Noto SC) + EN (Inter)', shape.hasNoto && shape.hasInter);
  ok('motion has 流光溢彩 (shimmer)', shape.hasShimmer);
  ok('exit anim options present', shape.outOpts.includes('fade-out') && shape.outOpts.includes('sink') && shape.outOpts.includes('zoom-out'), shape.outOpts.join(','));
  ok('B / I / U toggles present', shape.bold && shape.italic && shape.under);
  ok('alignment L/C/R buttons present', shape.align);
  ok('嵌入字体 checkbox present', shape.embed);

  // 2) tab switching shows the right pane
  const tabSwitch = await page.evaluate(() => {
    const click = (sel) => document.querySelector(sel).click();
    click('.htab[data-htab="anim"]');
    const animVisible = !document.querySelector('.hpane[data-hpane="anim"]').hidden && document.querySelector('.hpane[data-hpane="fmt"]').hidden;
    click('.htab[data-htab="ai"]');
    const aiVisible = !document.querySelector('.hpane[data-hpane="ai"]').hidden;
    const aiHasSend = !!document.getElementById('aiExportAll') && !!document.getElementById('auditRun');
    click('.htab[data-htab="fmt"]');
    const fmtVisible = !document.querySelector('.hpane[data-hpane="fmt"]').hidden;
    return { animVisible, aiVisible, aiHasSend, fmtVisible };
  });
  ok('动画效果 tab switches pane', tabSwitch.animVisible);
  ok('AI 修改 tab holds send + 视觉自检', tabSwitch.aiVisible && tabSwitch.aiHasSend);
  ok('格式 tab switches back', tabSwitch.fmtVisible);

  // 3) select an element → controls populate; apply font + exit anim; verify on the element
  const applied = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]');
    if (!el) return { ok: false };
    el.click();
    // 格式 tab: pick a font the deck does NOT already load (so injection is exercised)
    const fsel = document.getElementById('hFont'); fsel.value = 'mashanzheng';
    fsel.dispatchEvent(new Event('change', { bubbles: true }));
    // bold toggle
    document.getElementById('hBold').click();
    // 动画效果 → 消失 sub-tab → pick sink
    document.querySelector('.htab[data-htab="anim"]').click();
    document.querySelector('.stab[data-stab="out"]').click();
    const osel = document.getElementById('hAnimOut'); osel.value = 'sink';
    osel.dispatchEvent(new Event('change', { bubbles: true }));
    const sel = document.querySelector('#preview').contentDocument.querySelector('.sm-sel') || el;
    return {
      ok: true,
      font: /Ma Shan Zheng/.test(sel.style.fontFamily),
      bold: parseInt(sel.style.fontWeight, 10) >= 600,
      out: sel.getAttribute('data-anim-out') === 'sink',
      boldBtnOn: document.getElementById('hBold').classList.contains('on'),
    };
  });
  ok('selecting element + font applied (Ma Shan Zheng)', applied.ok && applied.font);
  ok('bold toggle applies font-weight', applied.bold && applied.boldBtnOn);
  ok('exit anim (sink) set on element', applied.out);

  // 4) export (no embed) carries exit system + font link + data-anim-out
  const exp = await page.evaluate(() => window.__SM_EXPORT_HTML__());
  writeFileSync(resolve(process.cwd(), 'dist/tabs/exported.html'), exp);
  ok('export has data-anim-out', /data-anim-out="sink"/.test(exp));
  ok('export has exit keyframes', /@keyframes sm-o-sink/.test(exp) && /sm-exit \[data-anim-out\]/.test(exp));
  ok('export has exit-on-nav interception', /data-smfx-edit/.test(exp) && /__SM_FX_PLAY_OUT__/.test(exp));
  ok('export injects picked font link (Ma Shan Zheng)', /fonts\.googleapis\.com\/css2\?family=Ma\+Shan\+Zheng/.test(exp));
  ok('edit preview marked, export not', !/data-smfx-edit="1"/.test(exp));
  ok('typography: text-wrap balance/pretty injected', /text-wrap:\s*balance/.test(exp) && /text-wrap:\s*pretty/.test(exp));

  // 5) exit-on-nav actually fires in the exported (non-edit) deck
  const exitPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await exitPage.goto('file://' + resolve(process.cwd(), 'dist/tabs/exported.html'), { waitUntil: 'load' });
  await exitPage.waitForTimeout(600);
  const exitFire = await exitPage.evaluate(async () => {
    const deck = document.getElementById('deck');
    const cur = deck.querySelector('.slide.active') || deck.querySelector('.slide');
    // ensure the active slide has an exit-marked element
    let mark = cur.querySelector('[data-anim-out]');
    if (!mark) { mark = cur.querySelector('*') || cur; mark.setAttribute('data-anim-out', 'fade-out'); }
    let sawExit = false;
    const obs = new MutationObserver(() => { if (cur.classList.contains('sm-exit')) sawExit = true; });
    obs.observe(cur, { attributes: true, attributeFilter: ['class'] });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 200));
    obs.disconnect();
    return { sawExit };
  });
  ok('exit animation fires on ArrowRight in exported deck', exitFire.sawExit);
  await exitPage.close();

  // 6) font embedding (network) — best-effort
  let embedTried = false, embedOk = false, embedNote = '';
  try {
    const res = await page.evaluate(async () => {
      document.getElementById('embedFonts').checked = true;
      const html = await window.__SM_BUILD_EXPORT__();
      return {
        hasData: /data:font\/woff2;base64,/.test(html),
        // offline-blockers gone = no live <link> / @import to Google Fonts (a URL in a comment is harmless)
        noGoogleLink: !/<link[^>]+fonts\.(googleapis|gstatic)\.com/.test(html) && !/@import[^;]*fonts\.googleapis\.com/.test(html),
        len: html.length,
      };
    });
    embedTried = true;
    embedOk = res.hasData && res.noGoogleLink;
    embedNote = 'data-uri=' + res.hasData + ' noLink=' + res.noGoogleLink;
  } catch (e) { embedNote = 'skipped (offline?): ' + (e && e.message); }
  if (embedTried) ok('嵌入字体: woff2 inlined + remote link removed', embedOk, embedNote);
  else console.log('• 嵌入字体 check skipped — ' + embedNote);

  ok('no page/console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

let pass = 0;
for (const c of checks) { console.log((c.pass ? '✓' : '✗') + ' ' + c.name + (c.extra ? '  — ' + c.extra : '')); if (c.pass) pass++; }
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
