// Verify the selection-box fixes (user-reported, 2026-06-27):
//   ① clicking empty space / the slide background clears the selection (sm-sel + gizmo)
//   ② the move/resize gizmo stays glued to the element while the iframe scrolls
//      (it is position:fixed, so before the fix it detached and floated on screen)
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

  // ── ① select → gizmo on, then click the slide background → deselect ──────────
  const sel1 = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]');
    el.click();
    return { gizmo: window.__SM_GIZMO_ON__(), hasSel: !!d.querySelector('.sm-sel') };
  });
  ok('selecting an element shows the gizmo', sel1.gizmo && sel1.hasSel);

  const desel = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const slide = d.querySelector('.sm-sel').closest('#deck .slide');
    slide.click(); // click the slide background itself → empty-area click
    return { gizmo: window.__SM_GIZMO_ON__(), hasSel: !!d.querySelector('.sm-sel'), domGizmo: !!d.querySelector('.sm-gizmo') };
  });
  ok('clicking the slide background clears sm-sel', !desel.hasSel);
  ok('clicking the slide background hides the gizmo', !desel.gizmo && !desel.domGizmo);

  // ── ② re-select, then scroll the iframe → the gizmo must follow the element ──
  const beforeScroll = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]');
    el.click();
    const g = d.querySelector('.sm-gizmo').getBoundingClientRect();
    const e = el.getBoundingClientRect();
    return { gizmoTop: g.top, elTop: e.top };
  });
  ok('gizmo aligns with the element before scroll', Math.abs(beforeScroll.gizmoTop - beforeScroll.elTop) < 2,
    `gizmoTop=${beforeScroll.gizmoTop} elTop=${beforeScroll.elTop}`);

  const afterScroll = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument; const w = d.defaultView;
    w.scrollTo(0, w.scrollY + 260);
    await new Promise((r) => setTimeout(r, 120)); // let the scroll handler reposition
    const sel = d.querySelector('.sm-sel');
    const g = d.querySelector('.sm-gizmo').getBoundingClientRect();
    const e = sel.getBoundingClientRect();
    return { gizmoTop: g.top, elTop: e.top, scrollY: w.scrollY };
  });
  ok('iframe actually scrolled', afterScroll.scrollY >= 200, `scrollY=${afterScroll.scrollY}`);
  ok('gizmo still glued to the element after scroll', Math.abs(afterScroll.gizmoTop - afterScroll.elTop) < 2,
    `gizmoTop=${afterScroll.gizmoTop} elTop=${afterScroll.elTop}`);
  // the element moved up with the scroll → the gizmo moved with it (proves it is no longer detached/fixed-in-place)
  ok('gizmo moved together with the scrolled element', Math.abs(afterScroll.gizmoTop - beforeScroll.gizmoTop) > 100,
    `before=${beforeScroll.gizmoTop} after=${afterScroll.gizmoTop}`);

  // ── ③ Escape still deselects ─────────────────────────────────────────────────
  const escDesel = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { gizmo: window.__SM_GIZMO_ON__(), hasSel: !!d.querySelector('.sm-sel') };
  });
  ok('Escape clears the selection', !escDesel.gizmo && !escDesel.hasSel);

  ok('no page/console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  const pass = checks.filter((c) => c.pass).length;
  for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.name}${c.extra ? '  — ' + c.extra : ''}`);
  console.log(`\n${pass}/${checks.length} checks passed`);
  if (pass !== checks.length) process.exit(1);
} finally {
  await browser.close();
}
