// Verify roadmap step 1 — never-lose-work + reversible + images:
//   ① dirty flag + localStorage autosave draft + restore offer on reload
//   ② undo / redo (buttons + state) reverts a style/structure edit
//   ③ insert image (HTML mode) inlines a base64 <img> that survives export
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const deckHtml = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
mkdirSync(resolve(root, 'dist/resilience'), { recursive: true });

const checks = [];
const ok = (name, cond, extra = '') => checks.push({ name, pass: !!cond, extra });
const MARK = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQ'; // unique signature of our 1x1 test PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

  ok('starts clean (no dirty, empty history)', await page.evaluate(() => { const s = window.__SM_STATE__(); return !s.dirty && s.undo === 0 && !s.draft; }));

  // ① make an edit → dirty flips, undo grows, draft autosaves
  await page.evaluate(() => {
    const el = document.getElementById('preview').contentDocument.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]');
    el.click();
    const f = document.getElementById('hFs'); f.value = '120'; f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  ok('edit flips dirty + records undo', await page.evaluate(() => { const s = window.__SM_STATE__(); return s.dirty && s.undo >= 1; }));
  ok('未保存 badge visible', await page.$eval('#dirtyDot', (e) => e.style.display !== 'none'));
  await page.waitForTimeout(1500); // autosave debounce (1200ms)
  ok('autosave wrote a localStorage draft', await page.evaluate(() => window.__SM_STATE__().draft));

  // ② undo reverts the font-size; redo re-applies
  const beforeSize = await page.evaluate(() => document.getElementById('preview').contentDocument.querySelector('.sm-sel')?.style.fontSize || '');
  await page.evaluate(() => window.__SM_UNDO__());
  await page.waitForTimeout(500);
  const afterUndo = await page.evaluate(() => { const d = document.getElementById('preview').contentDocument; const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]'); return el?.style.fontSize || ''; });
  ok('undo reverts the edit', beforeSize === '120px' && afterUndo !== '120px', `before=${beforeSize} afterUndo=${afterUndo}`);
  ok('redo stack populated after undo', await page.evaluate(() => window.__SM_STATE__().redo >= 1));
  await page.evaluate(() => window.__SM_REDO__());
  await page.waitForTimeout(500);
  ok('redo re-applies the edit', await page.evaluate(() => { const el = document.getElementById('preview').contentDocument.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]'); return el?.style.fontSize === '120px'; }));

  // ③ insert image → present in export, removable by undo
  const undoBefore = await page.evaluate(() => window.__SM_STATE__().undo);
  await page.evaluate((u) => window.__SM_PLACE_IMAGE__(u), PNG);
  await page.waitForTimeout(200);
  ok('inserted image present in export (base64 inlined)', (await page.evaluate(() => window.__SM_EXPORT_HTML__())).includes(MARK));
  ok('image insert recorded an undo step', await page.evaluate((n) => window.__SM_STATE__().undo > n, undoBefore));
  await page.evaluate(() => window.__SM_UNDO__());
  // wait for the undo re-render to settle (export re-harvests the live iframe DOM)
  await page.waitForFunction((m) => { const d = document.getElementById('preview')?.contentDocument; return !!(d && d.querySelector('#deck .slide') && d.documentElement.outerHTML.indexOf(m) < 0); }, MARK, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(150);
  ok('undo removes the inserted image', !(await page.evaluate(() => window.__SM_EXPORT_HTML__())).includes(MARK));

  // ④ move + resize the selected element (gizmo + commit hooks)
  const box = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]');
    el.click();
    const gizmo = window.__SM_GIZMO_ON__();
    window.__SM_MOVE_SEL__(40, 24);
    window.__SM_RESIZE_SEL__(600);
    const sel = d.querySelector('.sm-sel');
    return { gizmo, transform: sel.style.transform, width: sel.style.width };
  });
  ok('selecting shows the move/resize gizmo', box.gizmo);
  ok('move writes transform translate', /translate\(40px,\s*24px\)/.test(box.transform), box.transform);
  ok('resize writes width', box.width === '600px', box.width);
  ok('move + resize survive export', await page.evaluate(() => { const h = window.__SM_EXPORT_HTML__(); return /translate\(40px/.test(h) && /width:\s*600px/.test(h); }));
  // real drag: mousedown the move grip → mousemove → mouseup actually repositions
  const dragged = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const sel = d.querySelector('.sm-sel'); const before = sel.style.transform;
    const grip = d.querySelector('.sm-gizmo .mv'); if (!grip) return { ok: false };
    const r = grip.getBoundingClientRect();
    const fire = (type, x, y, tgt) => tgt.dispatchEvent(new d.defaultView.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
    fire('mousedown', r.left + 5, r.top + 5, grip);
    fire('mousemove', r.left + 85, r.top + 65, d);
    fire('mouseup', r.left + 85, r.top + 65, d);
    return { ok: true, before, after: d.querySelector('.sm-sel').style.transform };
  });
  ok('dragging the grip repositions the element', dragged.ok && dragged.before !== dragged.after, JSON.stringify(dragged));
  // undo reverts the box change
  await page.evaluate(() => window.__SM_UNDO__());
  await page.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return !!(d && d.querySelector('#deck .slide')); }, { timeout: 6000 });
  await page.waitForTimeout(200);
  ok('undo reverts resize', !(await page.evaluate(() => window.__SM_EXPORT_HTML__())).includes('width: 600px'));

  // ① restore: reload the SAME context (localStorage persists) → restore bar offers the draft
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_STATE__ === 'function');
  await page.waitForTimeout(400);
  ok('restore bar offered after reload', await page.$eval('#restoreBar', (e) => e.style.display !== 'none').catch(() => false));
  await page.click('#restoreGo');
  await page.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return !!(d && d.querySelector('#deck .slide')); }, { timeout: 8000 });
  ok('restored deck has slides', await page.evaluate(() => document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide').length > 30));

  // ⑤ keyboard shortcuts: arrow nudges selection, Esc deselects; dark mode toggles + persists
  const kb = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('#deck .slide h1, #deck .slide h2, #deck .slide [class]'); el.click();
    const before = d.querySelector('.sm-sel').style.transform;
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const afterNudge = (d.querySelector('.sm-sel') || el).style.transform;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    return { before, afterNudge, deselected: !d.querySelector('.sm-sel') && !window.__SM_GIZMO_ON__() };
  });
  ok('arrow key nudges the selected element', kb.before !== kb.afterNudge, `${kb.before} → ${kb.afterNudge}`);
  ok('Esc deselects (gizmo gone)', kb.deselected);
  const theme = await page.evaluate(() => {
    document.getElementById('themeTog').click();
    const on = document.body.classList.contains('dark');
    const saved = localStorage.getItem('sm-studio-theme');
    document.getElementById('themeTog').click();
    return { on, saved, off: !document.body.classList.contains('dark') };
  });
  ok('dark mode toggles on + persists', theme.on && theme.saved === 'dark');
  ok('dark mode toggles back off', theme.off);

  ok('no page/console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally { await browser.close(); }

let pass = 0;
for (const c of checks) { console.log((c.pass ? '✓' : '✗') + ' ' + c.name + (c.extra ? '  — ' + c.extra : '')); if (c.pass) pass++; }
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
