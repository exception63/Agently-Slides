// FX verification: entrance animations (data-anim) actually play, auto vs manual
// play mode works, the ▶ button replays, and the offline manual-apply UI is gone.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/fx'), { recursive: true });

const checks = [];
const ok = (name, cond, extra = '') => { checks.push({ name, pass: !!cond, extra }); };

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');

  // inspector shape: new controls present, offline manual-apply gone
  const shape = await page.evaluate(() => ({
    hasFxMode: !!document.getElementById('hFxMode'),
    hasAnimPlay: !!document.getElementById('hAnimPlay'),
    gone_apply: !document.getElementById('aiApplyPaste') && !document.getElementById('aiApply') && !document.getElementById('aiPatchFile') && !document.getElementById('aiPaste'),
    gone_exportOne: !document.getElementById('aiExportOne'),
  }));
  ok('动效播放 select present', shape.hasFxMode);
  ok('▶ 播放本页动效 button present', shape.hasAnimPlay);
  ok('offline 手动应用 AI 返回 removed', shape.gone_apply);
  ok('仅导出本页 removed', shape.gone_exportOne);

  await page.evaluate((html) => window.__SM_IMPORT__('keynote.html', html), keynote);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelector('#deck .slide'));
  }, { timeout: 8000 });
  await page.waitForTimeout(700); // edit wiring + FX_JS

  // FX engine injected into the live preview
  const fx = await page.evaluate(() => {
    const w = document.getElementById('preview').contentWindow;
    const d = w.document;
    return {
      hasPlay: typeof w.__SM_FX_PLAY__ === 'function',
      hasRearm: typeof w.__SM_FX_REARM__ === 'function',
      smfx: d.documentElement.getAttribute('data-smfx'),
      activeHasPlay: !!(d.querySelector('#deck .slide.active') || d.querySelector('#deck .slide')).classList.contains('sm-play'),
    };
  });
  ok('FX engine __SM_FX_PLAY__ in preview', fx.hasPlay);
  ok('auto mode default (data-smfx=auto)', fx.smfx === 'auto' || fx.smfx === null);
  ok('auto: active slide auto-played (sm-play)', fx.activeHasPlay);

  // assign an entrance animation to the cover title, ▶ replay, assert it animates
  const entrance = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide .cover__title') || d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide h3');
    if (!el) return { err: 'no target element' };
    // click to select, then set entrance anim = rise via the inspector select
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: d.defaultView }));
    const sel = document.getElementById('hAnim'); sel.value = 'rise';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // ▶ replay
    document.getElementById('hAnimPlay').click();
    await new Promise((r) => setTimeout(r, 60));
    const cs = d.defaultView.getComputedStyle(el);
    const slide = el.closest('.slide');
    return { dataAnim: el.getAttribute('data-anim'), animName: cs.animationName, slidePlay: slide.classList.contains('sm-play') };
  });
  ok('entrance attr set on element (data-anim=rise)', entrance.dataAnim === 'rise', JSON.stringify(entrance));
  ok('entrance animation actually applied (animationName=sm-a-rise)', entrance.animName === 'sm-a-rise', entrance.animName);

  // motion + manual gating: set a motion, check auto runs / manual pauses until click
  const motion = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument;
    const w = document.getElementById('preview').contentWindow;
    const el = d.querySelector('#deck .slide .cover__title') || d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide h3');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: d.defaultView }));
    const m = document.getElementById('hMotion'); m.value = 'glow';
    m.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
    const autoState = d.defaultView.getComputedStyle(el).animationPlayState;
    // switch to manual
    const fm = document.getElementById('hFxMode'); fm.value = 'manual';
    fm.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const manualState = d.defaultView.getComputedStyle(el).animationPlayState;
    const smfx = d.documentElement.getAttribute('data-smfx');
    // viewer clicks the deck → build plays → motion runs
    d.getElementById('deck').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: d.defaultView }));
    await new Promise((r) => setTimeout(r, 60));
    const afterClick = d.defaultView.getComputedStyle(el).animationPlayState;
    return { autoState, manualState, smfx, afterClick };
  });
  ok('auto: motion running', motion.autoState === 'running', motion.autoState);
  ok('manual: data-smfx=manual set live', motion.smfx === 'manual');
  ok('manual: motion paused until played', motion.manualState === 'paused', motion.manualState);
  ok('manual: click on deck starts motion', motion.afterClick === 'running', motion.afterClick);

  // export carries the FX system + chosen mode
  const exp = await page.evaluate(() => window.__SM_EXPORT_HTML__());
  ok('export has data-smfx=manual', /<html[^>]*data-smfx="manual"/.test(exp), exp.slice(0, 120));
  ok('export has FX CSS (sm-a-rise)', exp.includes('sm-a-rise'));
  ok('export has FX JS (__SM_FX_PLAY__)', exp.includes('__SM_FX_PLAY__'));
  ok('export kept the entrance attr', /data-anim="rise"/.test(exp));

  await page.screenshot({ path: resolve(root, 'dist/fx/inspector.png') });
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
