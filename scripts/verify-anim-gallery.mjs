// verify-anim-gallery.mjs · 验证动画库画廊 + 生成 deck 的 FX 引擎
// 用法：node scripts/verify-anim-gallery.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKILL = path.join(ROOT, 'plugin/slidesmith/skills/editorial-slides');
const GALLERY = path.join(SKILL, 'gallery/animations.html');
const SHOTS = path.join(ROOT, 'docs/screenshots/anim');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

console.log('\n[1] 画廊渲染 + 效果触发');
await page.goto(pathToFileURL(GALLERY).href);
await page.waitForTimeout(600);

const cards = await page.$$eval('.card', els => els.length);
ok(cards >= 45, `卡片数 = ${cards}（≥45）`);
const cats = await page.$$eval('section.cat', els => els.map(e => e.id));
ok(cats.length === 10, `分类数 = ${cats.length}（应 10：${cats.join(',')}）`);
ok(errors.length === 0, `无 JS 错误${errors.length ? '：' + errors[0] : ''}`);

// 入场：重播后 demo-chip 处于已播状态（smfx-go 在台上）
const entracePlayed = await page.evaluate(() => {
  const stage = document.querySelector('.card .stage.smfx-arm');
  return !!stage && stage.classList.contains('smfx-go');
});
ok(entracePlayed, '入场台已加 smfx-go（动画已触发）');

// 分步揭示：点“下一步”→ 有 fragment 拿到 smfx-vis
const fragWorks = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.card'));
  const c = cards.find(x => x.querySelector('.fr-list'));
  if (!c) return false;
  const next = Array.from(c.querySelectorAll('button')).find(b => /下一步/.test(b.textContent));
  next.click(); next.click();
  return c.querySelectorAll('.fragment.smfx-vis').length > 0;
});
ok(fragWorks, '分步揭示：点击后 fragment 出现（smfx-vis）');

// 持续动效 + 神奇移动存在
ok(await page.$('[data-motion="glow"]'), 'D1 呼吸发光存在（data-motion=glow）');
ok(await page.$('.mm-stage'), 'F 神奇移动卡存在');
const vt = await page.evaluate(() => !!(window.SMFX && window.SMFX.hasViewTransitions));
console.log('  · 本浏览器 View Transitions：' + (vt ? '支持（原生神奇移动）' : '不支持（走 FLIP/CSS 兜底）'));

// 截图：顶部 + 全页
await page.screenshot({ path: path.join(SHOTS, '01-gallery-top.png') });
await page.screenshot({ path: path.join(SHOTS, '02-gallery-full.png'), fullPage: true });
// 定位到神奇移动一节单独截
const fEl = await page.$('#cat-F');
if (fEl) { await fEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, '03-magic-move.png') }); }

// J · Canvas 特效：滚到该节 → IntersectionObserver 应初始化 canvas
ok(await page.$('#cat-J'), 'J · Canvas 特效分类存在');
const jEl = await page.$('#cat-J');
if (jEl) { await jEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(900); }
const canvasInfo = await page.evaluate(() => ({
  hpx: !!(window.HPX && window.HPX['gradient-blob'] && window.HPX['knowledge-graph']),
  canvases: document.querySelectorAll('#cat-J canvas.sm-fx-canvas').length,
  jcards: document.querySelectorAll('#cat-J .card').length,
}));
ok(canvasInfo.hpx, 'window.HPX 已注册 canvas 特效（gradient-blob/knowledge-graph）');
ok(canvasInfo.jcards >= 12, `J 类卡片 = ${canvasInfo.jcards}（≥12）`);
ok(canvasInfo.canvases >= 6, `J 类已生成运行的 <canvas> = ${canvasInfo.canvases}（≥6，IntersectionObserver 启动）`);
if (jEl) await page.screenshot({ path: path.join(SHOTS, '05-canvas-fx.png') });
console.log('  · 截图 → docs/screenshots/anim/');

console.log('\n[2] 生成 deck 的 FX 引擎（present 态入场 + 分步）');
const testDeck = '/tmp/sm-fxdeck.html';
const slidesFile = '/tmp/sm-fxslides.txt';
execSync(`cat > ${slidesFile} <<'EOF'
<section data-seg="0" data-segname="段 0" class="slide cover"><h1 class="cover__title" data-anim="rise">第一页标题</h1></section>
<section data-seg="0" data-segname="段 0" class="slide"><h2 class="title">逐步</h2><ul><li class="fragment">A</li><li class="fragment">B</li><li class="fragment">C</li></ul></section>
EOF`);
execSync(`cd "${path.join(SKILL, 'assets')}" && python3 build.py editorial ${testDeck} --slides ${slidesFile}`);
await page.goto(pathToFileURL(testDeck).href);
await page.waitForTimeout(400);
ok(await page.evaluate(() => !!window.SMFX), 'deck 内 window.SMFX 已定义');
ok(await page.evaluate(() => !!window.deckAPI), 'deck 内 window.deckAPI 已定义');
// 进入放映态（present，按一次 p；键盘事件派发在 body 元素上，模拟真实焦点）
const deckEntrance = await page.evaluate(async () => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const a = document.querySelector('.slide.active');
  return { present: document.body.classList.contains('present'), go: !!(a && a.classList.contains('smfx-go')) };
});
ok(deckEntrance.present, 'deck 放映态已进入（body.present）');
ok(deckEntrance.go, 'deck 放映态：当前页加上了 smfx-go（入场触发）');
// 分步：present 下按 → 第二页应先点出 fragment 而非翻页
const deckFrag = await page.evaluate(async () => {
  window.deckAPI.setActive(1);
  await new Promise(r => setTimeout(r, 200));
  const before = window.deckAPI.idx;
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const visAfter = document.querySelectorAll('.slide.active .fragment.smfx-vis').length;
  return { sameSlide: window.deckAPI.idx === before, visAfter };
});
ok(deckFrag.sameSlide && deckFrag.visAfter > 0, `deck 分步：→ 先点出 fragment（停在本页，已显 ${deckFrag.visAfter} 条）`);

await browser.close();
console.log(`\n=== ${pass} 过 / ${fail} 败 ===`);
process.exit(fail ? 1 : 0);
