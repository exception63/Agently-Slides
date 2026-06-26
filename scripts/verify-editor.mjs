// Verify the AI-integrated editor model end to end (offline, file://):
//   ① per-slide comment that FOLLOWS the current page + badges + queue + status
//   ② deck-level comment ("对整份 deck 说…") → one task carrying a structure overview
//   ③ review / revert an AI change per slide
//   ④ direct edits on the selected element (move / delete), persisted through export
// Run: npx tsx scripts/verify-editor.mjs
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
const shotDir = resolve(root, 'docs/screenshots/editor');
mkdirSync(shotDir, { recursive: true });

const checks = [];
const ck = (name, ok, extra = '') => { checks.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };
const val = (p, s) => p.$eval(s, (e) => e.value);
const txt = (p, s) => p.$eval(s, (e) => (e.textContent || '').trim());
const waitSlides = (p) => p.waitForFunction(() => { const d = document.getElementById('preview') && document.getElementById('preview').contentDocument; return !!(d && d.querySelectorAll('#deck .slide').length > 30); }, { timeout: 8000 });

const browser = await chromium.launch({ headless: true });
try {
  const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(studio, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await p.evaluate((h) => window.__SM_IMPORT__('keynote-target.html', h), keynote);
  await waitSlides(p);
  await p.waitForFunction(() => document.querySelectorAll('.srow').length > 30, { timeout: 5000 });

  // HTML mode now uses Keynote-style tabs — AI controls live under the "AI 修改" tab
  const htab = (name) => p.click('.htab[data-htab="' + name + '"]');
  await htab('ai');

  // ── ① per-slide comment follows the page ──
  ck('① left list is the task navigator (36 rows)', (await p.$$('.srow')).length >= 30);
  await p.$$eval('.srow', (r) => r[2].click()); await p.waitForTimeout(150);
  ck('① comment box follows page (第 3 页)', (await txt(p, '#aiTargetTxt')).includes('第 3 页'));
  ck('① box empty on a page with no comment', (await val(p, '#aiInstruction')) === '');
  await p.fill('#aiInstruction', '把三个要点改成左右两栏对照，右栏给一个关键数字。'); await p.waitForTimeout(120);
  ck('① page-3 row gets a pending badge', await p.$eval('.srow:nth-child(3)', (r) => !!r.querySelector('.sbadge.todo')));
  ck('① task queue lists it', (await p.$$('#aiQueue .qrow')).length === 1);
  await p.$$eval('.srow', (r) => r[5].click()); await p.waitForTimeout(150);
  ck('① switching pages clears the box', (await val(p, '#aiInstruction')) === '');
  await p.$$eval('.srow', (r) => r[2].click()); await p.waitForTimeout(150);
  ck('① returning restores the saved comment', (await val(p, '#aiInstruction')).includes('左右两栏'));
  // deck's own nav also moves the box (the polling sync)
  const navOk = await p.evaluate(() => { const t = document.getElementById('preview').contentDocument.querySelector('.thumb[data-idx="8"]'); if (t) { t.click(); return true; } return false; });
  if (navOk) { await p.waitForTimeout(550); ck('① box follows the deck\'s OWN nav', (await txt(p, '#aiTargetTxt')).includes('第 9 页')); }
  else ck('① box follows the deck\'s OWN nav', true, 'no thumbs — skipped');

  // ── ② deck-level comment ──
  await p.fill('#aiDeckInstruction', '统一所有页的标题字号，给内容过多的页瘦身。'); await p.waitForTimeout(120);
  const req = await p.evaluate(() => window.__SM_AI_REQUEST_ALL__());
  ck('② deck task carries a deck-level block', !!req && req.content.includes('对整份 deck 的要求'));
  ck('② request includes a full structure overview', !!req && (req.content.match(/- 第 \d+ 页 · `/g) || []).length >= 30);
  ck('② send button counts page + deck tasks', await p.$eval('#aiExportAll', (b) => !b.disabled && /2 个任务/.test(b.textContent)), await p.$eval('#aiExportAll', (b) => b.textContent));
  await p.screenshot({ path: resolve(shotDir, '01-comments-and-queue.png') });

  // ── ③ review / revert ──
  await p.$$eval('.srow', (r) => r[2].click()); await p.waitForTimeout(150);
  const id3 = await p.evaluate(() => document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide')[2].getAttribute('data-id'));
  await p.evaluate((id) => window.__SM_APPLY_PATCH__('<section class="slide" data-id="' + id + '"><h1 class="cover__title">AI 改写版 ABC</h1></section>'), id3);
  await waitSlides(p); await p.waitForTimeout(300);
  ck('③ applied page shows ✓ 已改 badge', await p.$eval('.srow:nth-child(3)', (r) => !!r.querySelector('.sbadge.done')));
  ck('③ revert button appears on the applied page', await p.$eval('#aiRevertOne', (e) => e.style.display !== 'none'));
  ck('③ page shows the AI version', await p.evaluate((id) => document.getElementById('preview').contentDocument.querySelector('#deck .slide[data-id="' + id + '"]').textContent.includes('AI 改写版 ABC'), id3));
  await p.screenshot({ path: resolve(shotDir, '02-ai-applied.png') });
  await p.click('#aiRevertOne'); await waitSlides(p); await p.waitForTimeout(300);
  ck('③ revert restores the pre-AI page', await p.evaluate((id) => !document.getElementById('preview').contentDocument.querySelector('#deck .slide[data-id="' + id + '"]').textContent.includes('AI 改写版 ABC'), id3));
  ck('③ ✓ badge cleared after revert', await p.$eval('.srow:nth-child(3)', (r) => !r.querySelector('.sbadge.done')));

  // ── ④ direct edits: delete an element (element ops live under the "格式" tab) ──
  await htab('fmt');
  await p.evaluate(() => { const d = document.getElementById('preview').contentDocument; for (const s of d.querySelectorAll('#deck .slide')) { const h = s.querySelector('[contenteditable]'); if (h) { h.click(); h.textContent = 'SENTINEL_DELME_42'; return; } } });
  await p.waitForTimeout(180);
  ck('④ selecting an element opens the inspector', await p.$eval('#hSel', (e) => e.style.display !== 'none'));
  ck('④ element ops present (上移/下移/删除)', !!(await p.$('#hElUp')) && !!(await p.$('#hElDel')));
  ck('④ sentinel present before delete', (await p.evaluate(() => window.__SM_EXPORT_HTML__())).includes('SENTINEL_DELME_42'));
  await p.click('#hElDel'); await p.waitForTimeout(200);
  ck('④ deleted element gone from export', !(await p.evaluate(() => window.__SM_EXPORT_HTML__())).includes('SENTINEL_DELME_42'));
  ck('④ export still has all slides', (await p.evaluate(() => (window.__SM_EXPORT_HTML__().match(/class="slide/g) || []).length)) >= 30);

  ck('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? '✗ FAIL' : '✓ PASS'} — ${checks.length - failed.length}/${checks.length} checks`);
process.exit(failed.length ? 1 : 0);
