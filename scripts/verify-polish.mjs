// Polish verification: (1) continuous motion (data-motion) is settable + ships in
// export with its keyframes; (2) batch Submit-to-AI bundles all written pages into
// one request; (3) paste-apply replaces the right page.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/polish'), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((html) => window.__SM_IMPORT__('keynote-target.html', html), keynote);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelector('#deck .slide .cover__title'));
  }, { timeout: 8000 });

  await page.waitForTimeout(500); // let the edit wiring (contentEditable + click) attach
  // (1) motion: select the cover title via a real click, set 持续动效 = glow
  const motion = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide .cover__title');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: d.defaultView }));
    const sel = document.getElementById('hMotion');
    sel.value = 'glow';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const exported = window.__SM_EXPORT_HTML__();
    const carriers = Array.prototype.slice.call(d.querySelectorAll('#deck [data-motion="glow"]')).map((e) => e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || '').replace('sm-sel', '').trim());
    return {
      carriers,
      deckSlideCount: d.querySelectorAll('#deck .slide').length,
      aiTarget: document.getElementById('aiTarget').textContent,
      wired: !!d.querySelector('#deck .slide [contenteditable]'),
      selShown: document.getElementById('hSel').style.display !== 'none',
      selTag: document.getElementById('hSelTag').textContent,
      setOnElement: el.getAttribute('data-motion') === 'glow',
      exportHasAttr: /<[a-z][^>]*\sdata-motion="glow"/i.test(exported), // a TAG carrying it (not the CSS rule)
      exportHasKeyframe: exported.includes('@keyframes sm-m-glow'),
      optionCount: document.getElementById('hMotion').options.length,
    };
  });

  // (2) batch: write instructions for two pages via the hook, export all
  const batch = await page.evaluate(() => {
    window.__SM_SET_INSTR__('s2', '把这页改成一句话金句版。');
    window.__SM_SET_INSTR__('s5', '这页加一张趋势示意图。');
    const r = window.__SM_AI_REQUEST_ALL__();
    return r && { count: r.count, hasS2: r.content.includes('s2'), hasS5: r.content.includes('s5'),
      hasInstr1: r.content.includes('金句版'), hasInstr2: r.content.includes('趋势示意图'),
      isPrompt: r.content.includes('给 AI 的 prompt') && r.content.includes('输出要求'),
      tellsPatchFile: r.content.includes('.patch.html') && r.content.includes('slidesmith_apply_patch') };
  });

  // (3) apply a 2-page patch via the bridge channel (offline paste UI was removed) -> both replaced, others intact
  const apply = await page.evaluate(() => {
    const patch = '<section class="slide" data-id="s2"><h2 class="title">P2 已被AI替换</h2></section>\n'
      + '<section class="slide" data-id="s5"><h2 class="title">P5 已被AI替换</h2></section>';
    window.__SM_APPLY_PATCH__(patch);
    return true;
  });
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.textContent && d.textContent.includes('P2 已被AI替换') && d.textContent.includes('P5 已被AI替换'));
  }, { timeout: 8000 }).catch(() => {});
  const afterApply = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const slides = Array.prototype.slice.call(d.querySelectorAll('#deck .slide'));
    return {
      slideCount: slides.length,
      p2: slides[1] && slides[1].textContent.includes('P2 已被AI替换'),
      p5: slides[4] && slides[4].textContent.includes('P5 已被AI替换'),
      coverIntact: !!(d.querySelector('#deck .slide .cover__title') || {}).textContent?.includes('人机共生'),
    };
  });
  await page.screenshot({ path: resolve(root, 'dist/polish/inspector.png') });

  console.log(JSON.stringify({
    motion, batch, afterApply,
    pass: motion.setOnElement && motion.exportHasAttr && motion.exportHasKeyframe && motion.optionCount >= 6
      && batch.count === 2 && batch.hasS2 && batch.hasS5 && batch.hasInstr1 && batch.hasInstr2 && batch.isPrompt && batch.tellsPatchFile
      && afterApply.slideCount === 36 && afterApply.p2 && afterApply.p5 && afterApply.coverIntact,
    pageErrors: errs,
  }, null, 2));
} finally {
  await browser.close();
}
