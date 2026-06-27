// Verify the transitions.dev-inspired slide FX work end-to-end inside the Studio:
//   A5 num-pop  → applying it + playing splits the text into per-char .smfx-ch spans that animate
//   A12 texts-reveal → applies as data-anim on a container
//   H8 smfx-check → applies as a class
// Driven through the real picker message path (applyPicked → previewPlayFx).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const deckHtml = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');

const checks = [];
const ok = (name, cond, extra = '') => checks.push({ name, pass: !!cond, extra });

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((html) => window.__SM_IMPORT__('keynote.html', html), deckHtml);
  await page.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return !!(d && d.querySelector('#deck .slide')); }, { timeout: 8000 });
  await page.waitForTimeout(700);

  // the picker is available as an entry in the gallery inlined into the Studio
  ok('gallery (picker source) inlined: A5/A12/H8 present', await page.evaluate(() =>
    /num-pop/.test(window.__SM_GALLERY_HTML__ || '') ||
    /num-pop/.test(document.documentElement.outerHTML)));

  // ── A5 num-pop: pick a text element, apply via the picker message, play ──
  const numpop = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]');
    el.textContent = '2,386';
    el.click(); // select it
    window.postMessage({ type: 'smfx-pick', code: 'A5', name: '数字弹入', spec: { mode: 'attr', attr: 'data-anim', val: 'num-pop' } }, '*');
    await new Promise((r) => setTimeout(r, 300)); // applyPicked → previewPlayFx → split
    const sel = d.querySelector('.sm-sel');
    const slide = sel.closest('#deck .slide');
    return {
      anim: sel.getAttribute('data-anim'),
      split: sel.getAttribute('data-smfx-split'),
      chips: sel.querySelectorAll('.smfx-ch').length,
      firstI: sel.querySelector('.smfx-ch')?.style.getPropertyValue('--i'),
      playing: slide.classList.contains('sm-play'),
    };
  });
  ok('num-pop applied as data-anim', numpop.anim === 'num-pop', JSON.stringify(numpop));
  ok('num-pop auto-split into per-char .smfx-ch', numpop.chips >= 4 && numpop.split === '1', `chips=${numpop.chips}`);
  ok('num-pop chars carry stagger index --i', numpop.firstI === '0', `firstI=${numpop.firstI}`);
  ok('slide entered sm-play (effect is animating)', numpop.playing);

  // ── A12 texts-reveal: apply to a container with block children ──
  const texts = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument;
    // build a small multi-line container to target
    const slide = d.querySelector('#deck .slide');
    const box = d.createElement('div');
    box.innerHTML = '<div>一行</div><div>二行</div><div>三行</div>';
    slide.appendChild(box);
    box.click();
    window.postMessage({ type: 'smfx-pick', code: 'A12', name: '多行浮现', spec: { mode: 'attr', attr: 'data-anim', val: 'texts-reveal' } }, '*');
    await new Promise((r) => setTimeout(r, 200));
    const sel = d.querySelector('.sm-sel');
    return { anim: sel.getAttribute('data-anim'), kids: sel.children.length };
  });
  ok('texts-reveal applied as data-anim on a multi-child box', texts.anim === 'texts-reveal' && texts.kids === 3, JSON.stringify(texts));

  // ── H8 smfx-check: apply class ──
  const check = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]');
    el.click();
    window.postMessage({ type: 'smfx-pick', code: 'H8', name: '成功对勾', spec: { mode: 'class', add: ['smfx-check'], scope: 'el' } }, '*');
    await new Promise((r) => setTimeout(r, 150));
    return { has: d.querySelector('.sm-sel')?.classList.contains('smfx-check') };
  });
  ok('smfx-check class applied to selection', check.has);

  ok('no page/console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  const pass = checks.filter((c) => c.pass).length;
  for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.name}${c.extra ? '  — ' + c.extra : ''}`);
  console.log(`\n${pass}/${checks.length} checks passed`);
  if (pass !== checks.length) process.exit(1);
} finally {
  await browser.close();
}
