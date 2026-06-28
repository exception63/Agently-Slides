// Unified AI pane verification — the refactor to "one 待办清单 + one 一键发送".
// Covers, headless end-to-end across Studio + bridge:
//   • layout order: 对整份 deck (top) → 本页(改字 + 配图 矢量/照片) → 待办清单 → 图片库 → 自检
//   • 配图 is one typed flow (矢量 SVG / 照片 codex); 待办 mixes 改字 / 配图·矢量 / 配图·照片 / 导入图
//   • ONE buildAllRequest: deck-ask + SVG rules + codex rules + tray preamble + per-page directives,
//     base64-free, images[] carries the tray pixels
//   • ONE submitAll → bridge gets a single .ai-tasks.md, __TRAY_DIR__ substituted, files on disk;
//     genQueue cleared, deck ask cleared, 改字 → 已发送
//   • backfill: an AI patch with <img data-img-id> + inline <svg> applies
//   • 图片库 panel: lists a seeded image, re-insert lands on its slide, delete works
//
// Test-only deck name __verify-aipane__ → touches only ~/.slidesmith/library/__verify-aipane__/.
// Run: npx tsx scripts/verify-ai-pane.mjs   (or plain node — self re-execs)
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
if (!process.env.SM_TSX) {
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SM_TSX: '1' } });
  process.exit(r.status ?? 1);
}
const { startBridge } = await import('../packages/bridge/src/index.ts');

const root = process.cwd();
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
const shotDir = resolve(root, 'docs/screenshots/aipane');
mkdirSync(shotDir, { recursive: true });
const DECK = '__verify-aipane__';
const libDir = join(homedir(), '.slidesmith', 'library', DECK);

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };
const pageOf = (content, needle) => { for (const b of content.split(/^### /m)) if (b.includes(needle)) { const m = b.match(/data-id: `([^`]+)`/); return m ? m[1] : null; } return null; };

const bridge = await startBridge({ port: 0 });
console.log(`bridge at ${bridge.url}`);
bridge.openHtml(`${DECK}.html`, keynote);

const browser = await chromium.launch({ headless: true });
try {
  if (existsSync(libDir)) rmSync(libDir, { recursive: true, force: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(bridge.url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_ALL_REQUEST__ === 'function', { timeout: 8000 });
  await page.waitForFunction(() => window.__SM_BRIDGE__().connected === true, { timeout: 8000 });
  await page.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return d && d.querySelectorAll('#deck .slide').length > 6; }, { timeout: 10000 });
  await page.click('.htab[data-htab="ai"]');
  check('Studio connected + deck imported (html mode)', true);

  const ids = await page.evaluate(() => Array.from(document.querySelector('#preview').contentDocument.querySelectorAll('#deck .slide')).map((s) => s.getAttribute('data-id')));
  const pA = ids[2], pB = ids[4], pC = ids[1], pD = ids[3], pE = ids[5];

  // --- layout: deck-ask top, then 本页, todo, library ---
  const ui = await page.evaluate(() => ['aiDeckInstruction', 'illSeg', 'illHint', 'illAdd', 'aiTodo', 'aiSendAll', 'genOpenLib'].every((id) => !!document.getElementById(id)) && document.querySelectorAll('#illSeg .segbtn').length === 3);
  check('unified UI present (deck-ask · 配图 segmented 3类 · 待办 · 一键发送 · 图片库)', ui);
  const order = await page.evaluate(() => {
    const seq = ['aiDeckInstruction', 'aiInstruction', 'illSeg', 'aiTodo', 'aiSendAll', 'genOpenLib'].map((id) => document.getElementById(id));
    for (let i = 1; i < seq.length; i++) if (!(seq[i - 1].compareDocumentPosition(seq[i]) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    return true;
  });
  check('order: 对整份 deck → 本页 → 配图 → 待办 → 一键发送 → 图片库', order);

  // clean UI: explanations live in ⓘ popovers, not inline paragraphs
  const helpN = await page.evaluate(() => document.querySelectorAll('.hpane[data-hpane="ai"] .ihelp').length);
  await page.click('.hpane[data-hpane="ai"] .ihelp >> nth=3');
  const popOpen = await page.evaluate(() => { const p = document.getElementById('helpPop'); return !!p && p.classList.contains('show') && p.textContent.length > 5; });
  await page.click('#aiDeckInstruction'); // click away closes it
  const popClosed = await page.evaluate(() => !document.getElementById('helpPop').classList.contains('show'));
  check('ⓘ help popovers (≥6 icons, open with text, click-away closes)', helpN >= 6 && popOpen && popClosed, `${helpN} icons`);

  // segmented control toggles illType (矢量 / 图表 / 照片) + 图表 swaps the hint placeholder to a data prompt
  await page.click('#illSeg .segbtn[data-illtype="photo"]');
  const segPhoto = await page.evaluate(() => document.querySelector('#illSeg .segbtn[data-illtype="photo"]').classList.contains('on'));
  await page.click('#illSeg .segbtn[data-illtype="chart"]');
  const segChart = await page.evaluate(() => document.querySelector('#illSeg .segbtn[data-illtype="chart"]').classList.contains('on') && /数据|描述/.test(document.getElementById('illHint').placeholder));
  await page.click('#illSeg .segbtn[data-illtype="vector"]');
  const segCount = await page.evaluate(() => document.querySelectorAll('#illSeg .segbtn').length);
  check('配图 type segmented toggles (矢量/图表/照片) + 图表 prompts for data', segCount === 3 && segPhoto && segChart && await page.evaluate(() => document.querySelector('#illSeg .segbtn[data-illtype="vector"]').classList.contains('on')));

  // --- build the unified to-do: deck ask + 改字 + 配图矢量 + 配图照片 + 导入图 ---
  await page.evaluate(() => { const t = document.getElementById('aiDeckInstruction'); t.value = '统一所有标题字号'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate((sid) => window.__SM_SET_INSTR__(sid, '标题改大、加副标题'), pC);
  await page.evaluate((sid) => window.__SM_GEN_MARK__(sid, 'vector', '一张上扬的增长曲线'), pA);
  await page.evaluate((sid) => window.__SM_GEN_MARK__(sid, 'chart', '方法A 78、方法B 88、方法C 91，分组柱状图'), pE);
  await page.evaluate((sid) => window.__SM_GEN_MARK__(sid, 'photo', '团队协作的真实照片'), pB);
  const redPng = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const x = c.getContext('2d'); x.fillStyle = '#c0392b'; x.fillRect(0, 0, 120, 80); return c.toDataURL('image/png'); });
  await page.evaluate((u) => window.__SM_TRAY_ADD__('hero.png', u), redPng);
  await page.waitForFunction(() => window.__SM_TRAY_LIST__().length === 1, { timeout: 5000 });
  const tid = (await page.evaluate(() => window.__SM_TRAY_LIST__()))[0].id;
  await page.evaluate(([id, sid]) => window.__SM_TRAY_SET_PAGE__(id, sid), [tid, pD]);

  const todo = await page.evaluate(() => window.__SM_TODO__());
  const has = (cls) => todo.some((t) => t.cls === cls);
  check('待办清单 mixes all kinds (整份/改字/配图矢量/配图图表/配图照片/导入图)', has('deck') && has('edit') && has('vec') && has('chart') && has('photo') && has('tray'), todo.map((t) => t.cls).join(','));
  const sendBtn = await page.evaluate(() => { const b = document.getElementById('aiSendAll'); return { on: !!b && !b.disabled, txt: b.textContent, note: document.getElementById('aiSendNote').style.display !== 'none' }; });
  check('一键发送 enabled + counts items + codex cost note shown', sendBtn.on && /\d 项/.test(sendBtn.txt) && sendBtn.note, sendBtn.txt);
  await page.screenshot({ path: resolve(shotDir, '01-unified-todo.png') });

  // --- ONE request carries everything ---
  const req = await page.evaluate(() => window.__SM_ALL_REQUEST__());
  const c = req.content;
  check('request: .ai-tasks.md, single request', /ai-tasks\.md$/.test(req.name) && req.images.length === 1, req.name);
  check('request: deck ask + SVG rules + codex rules + tray preamble all present', c.includes('统一所有标题字号') && c.includes('矢量配图规则') && c.includes('照片配图规则') && c.includes('图片素材'));
  check('request: per-page directives (改字 / 矢量 / 照片 / 插入图)', c.includes('标题改大') && c.includes('配图（矢量') && c.includes('配图（照片') && c.includes('__TRAY_DIR__'));
  check('request: vector page = pA, photo page = pB', pageOf(c, '矢量 SVG · 你直接画') === pA && pageOf(c, '照片级 · 用 codex') === pB);
  check('request: 图表规则(A默认+C逃生舱) + chart directive + chart page = pE', c.includes('图表规则') && /A 默认|默认 = draw|直接画.*svg.*图表|直接画一张干净的内联/.test(c) && c.includes('matplotlib') && c.includes('图表（按数据') && pageOf(c, '图表（按数据') === pE, pageOf(c, '图表（按数据'));
  check('request: base64-free (token-light)', !/data:image\/[a-z.+-]+;base64/i.test(c));

  // --- ONE send → bridge ---
  await page.evaluate(() => window.__SM_SEND_ALL__());
  const got = await bridge.waitForRequests(8000);
  const r1 = got.length === 1 ? got[0] : null;
  check('bridge got ONE .ai-tasks.md request', !!r1 && /ai-tasks\.md$/.test(r1.name));
  let fileOk = false;
  if (r1) { const m = r1.content.match(/本地文件：([^\s（]+\.png)/); if (m) fileOk = !r1.content.includes('__TRAY_DIR__') && existsSync(m[1]); }
  check('bridge substituted __TRAY_DIR__ + wrote tray pixels to disk', fileOk);
  const afterSend = await page.evaluate(() => ({ todo: window.__SM_TODO__(), gen: window.__SM_GEN_LIST__().length, deck: document.getElementById('aiDeckInstruction').value }));
  check('after send: 配图 cleared, deck ask cleared, 改字 → 已发送', afterSend.gen === 0 && afterSend.deck === '' && afterSend.todo.some((t) => t.label.includes('已发送')), `gen=${afterSend.gen}`);

  // --- backfill: tray img + inline svg patch applies ---
  const patch = '```html\n'
    + `<section class="slide" data-id="${pD}"><div class="fill"><h1>D</h1><img data-img-id="${tid}" alt="" style="max-width:30%"></div></section>\n`
    + `<section class="slide" data-id="${pA}"><div class="fill"><h1>A</h1><svg viewBox="0 0 100 60" class="sm-illus"><path d="M5 55 L50 20 L95 8" stroke="var(--accent)" fill="none"/></svg></div></section>\n`
    + `<section class="slide" data-id="${pE}"><div class="fill"><h1>E</h1><svg viewBox="0 0 120 80" class="sm-chart" aria-label="grouped bar"><line x1="14" y1="70" x2="116" y2="70" stroke="var(--ink)"/><rect x="24" y="34" width="16" height="36" fill="var(--accent)"/><rect x="52" y="22" width="16" height="48" fill="var(--accent-2)"/><rect x="80" y="14" width="16" height="56" fill="var(--accent-3)"/></svg></div></section>\n`
    + '```';
  bridge.applyPatch(patch);
  await page.waitForFunction(([d, a, e]) => { const doc = document.querySelector('#preview').contentDocument; return !!doc.querySelector(`#deck .slide[data-id="${d}"] img[data-img-id]`) && !!doc.querySelector(`#deck .slide[data-id="${a}"] svg.sm-illus`) && !!doc.querySelector(`#deck .slide[data-id="${e}"] svg.sm-chart`); }, [pD, pA, pE], { timeout: 8000 });
  const back = await page.evaluate(([d]) => { const im = document.querySelector('#preview').contentDocument.querySelector(`#deck .slide[data-id="${d}"] img[data-img-id]`); return (im.getAttribute('src') || '').startsWith('data:image/'); }, [pD]);
  check('patch applied: tray img backfilled (base64) + inline svg landed', back);
  const chartBack = await page.evaluate(([e]) => { const sv = document.querySelector('#preview').contentDocument.querySelector(`#deck .slide[data-id="${e}"] svg.sm-chart`); return !!sv && sv.querySelectorAll('rect').length === 3 && /var\(--accent/.test(sv.innerHTML); }, [pE]);
  check('chart round-trip: token-colored <svg> chart landed on its page', chartBack);

  // --- 图片库 panel: seed + list + reinsert + delete ---
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 140; c.height = 90; const x = c.getContext('2d'); x.fillStyle = '#1f8a5b'; x.fillRect(0, 0, 140, 90); return c.toDataURL('image/png'); });
  const b64 = png.split(',')[1]; const file = `${pB}__team__beadfeed.png`;
  mkdirSync(libDir, { recursive: true });
  writeFileSync(join(libDir, file), Buffer.from(b64, 'base64'));
  writeFileSync(join(libDir, 'index.json'), JSON.stringify({ deck: DECK, images: [{ id: 'g1', slideId: pB, prompt: 'team photo', file, model: 'codex-imagegen' }] }, null, 2));
  await page.evaluate(() => window.__SM_OPEN_LIBRARY__());
  await page.waitForFunction(() => document.querySelectorAll('#libGrid .lib-cell').length === 1, { timeout: 6000 });
  check('图片库 panel lists the seeded image', true);
  await page.screenshot({ path: resolve(shotDir, '02-library.png') });
  await page.evaluate(() => document.querySelector('#libGrid .lib-cell .lib-ins').click());
  await page.waitForFunction((sid) => { const im = document.querySelector('#preview').contentDocument.querySelector(`#deck .slide[data-id="${sid}"] img`); return !!im && (im.getAttribute('src') || '').startsWith('data:image/'); }, pB, { timeout: 8000 });
  check('重新插入 lands the library image on its page', true);
  const del = await page.evaluate(([base, f]) => fetch(`${base.replace(/\/$/, '')}/api/library/remove?deck=__verify-aipane__&file=${encodeURIComponent(f)}`, { method: 'POST' }).then((r) => r.json()), [bridge.url, file]);
  check('图片库 删除 removes file + index entry', del.ok && !existsSync(join(libDir, file)));

  check('no page errors', errs.length === 0, errs[0] || '');
} finally {
  await browser.close();
  bridge.close && bridge.close();
  if (existsSync(libDir)) rmSync(libDir, { recursive: true, force: true });
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
