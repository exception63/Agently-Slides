// 回归：播放（present）态的幻灯片必须**正好铺在视口里**，不许把文档撑出滚动条。
//
// 2026-08-21 用户报的：「全屏播放点下一页，出现很大一片灰色区域，得手动把页面拉回来，
// 翻下一页又偏」。真因在 deck 模板：`body.present .slide` 用 transform 缩放，
// **但 transform 不改布局尺寸** —— 盒子在布局上仍是 1920×1080。屏幕只要比 1920×1080 小
// （＝所有笔记本），.deck 就被撑出滚动条；flex 居中的溢出两边对称，右边能滚到、
// 左边那截滚都滚不回来。修法：负 margin 把布局盒子收回视觉尺寸。
//
// 这个 bug **和屏幕尺寸绑死**，1920 宽以上完全看不出来 —— 所以这里按几个真实笔记本
// 尺寸各测一遍，并且先证明「把修复规则摘掉就会挂」，免得测了个寂寞。
//
// 跑：node scripts/verify-present-fit.mjs
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const deckSrc = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
const outDir = resolve(root, 'dist/present');
mkdirSync(outDir, { recursive: true });

const checks = [];
const ok = (name, cond, extra = '') => { checks.push({ name, pass: !!cond, extra }); console.log((cond ? '✓ ' : '✗ ') + name + (extra ? `  — ${extra}` : '')); };

/** 进播放态、翻几页，量每一页有没有溢出 / 有没有居中。 */
async function measure(page, label) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const api = window.deckAPI;
    api.setActive(2); await sleep(250);
    const btn = [...document.querySelectorAll('button')].find((b) => /全屏播放|播放/.test(b.textContent || ''));
    if (btn) btn.click(); else { document.body.classList.add('present'); api.setActive(api.idx); }
    await sleep(450);
    const frames = [];
    for (let k = 0; k < 4; k++) {
      const a = document.querySelector('#deck .slide.active');
      const r = a.getBoundingClientRect();
      const se = document.scrollingElement;
      frames.push({
        idx: api.idx,
        overflowX: se.scrollWidth - se.clientWidth,
        overflowY: se.scrollHeight - se.clientHeight,
        // 居中：左右留白之差、上下留白之差（四舍五入后应为 0/1）
        offCenterX: Math.abs(Math.round(r.left - (innerWidth - r.width) / 2)),
        offCenterY: Math.abs(Math.round(r.top - (innerHeight - r.height) / 2)),
        fits: r.width <= innerWidth + 1 && r.height <= innerHeight + 1,
      });
      api.next(); await sleep(320);
    }
    return frames;
  });
}

const browser = await chromium.launch({ headless: true });
try {
  // ---------- 1) Studio 导出的成品，在几个真实笔记本尺寸上播放 ----------
  const mk = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await mk.goto(studio, { waitUntil: 'load' });
  await mk.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await mk.evaluate((html) => window.__SM_IMPORT__('keynote.html', html), deckSrc);
  await mk.waitForFunction(() => {
    const d = document.getElementById('preview')?.contentDocument;
    return !!(d && d.querySelector('#deck .slide'));
  }, { timeout: 8000 });
  await mk.waitForTimeout(700);
  const exported = await mk.evaluate(() => window.__SM_EXPORT_HTML__());
  await mk.close();

  ok('导出带上了播放态修复样式', exported.includes('id="sm-present-fix"'));
  ok('导出里没有烤死的运行时 --sc',
    (exported.match(/style="[^"]*--sc[^"]*"/g) || []).length === 0,
    String((exported.match(/style="[^"]*--sc[^"]*"/g) || []).length) + ' 处');

  const file = resolve(outDir, 'exported.html');
  writeFileSync(file, exported);
  // 对照组：把修复规则摘掉，证明这个脚本真能逮到 bug
  const broken = resolve(outDir, 'exported-nofix.html');
  writeFileSync(broken, exported
    .replace(/<style id="sm-present-fix">[\s\S]*?<\/style>/, '')
    .replace(/margin:calc\(\(1080px \* var\(--sc,1\) - 1080px\) \/ 2\) calc\(\(1920px \* var\(--sc,1\) - 1920px\) \/ 2\);?/g, ''));

  for (const vp of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1728, height: 1080 }]) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto('file://' + file, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const frames = await measure(page, `${vp.width}×${vp.height}`);
    const tag = `${vp.width}×${vp.height}`;
    ok(`[${tag}] 播放态不溢出（翻 4 页都不溢出）`,
      frames.every((f) => f.overflowX === 0 && f.overflowY === 0),
      frames.map((f) => `p${f.idx}:${f.overflowX}/${f.overflowY}`).join(' '));
    ok(`[${tag}] 幻灯片居中`,
      frames.every((f) => f.offCenterX <= 1 && f.offCenterY <= 1),
      frames.map((f) => `p${f.idx}:${f.offCenterX},${f.offCenterY}`).join(' '));
    ok(`[${tag}] 幻灯片装得进视口`, frames.every((f) => f.fits));
    await page.close();
  }

  // ---------- 2) 对照组：摘掉修复 → 必须挂 ----------
  const bp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await bp.goto('file://' + broken, { waitUntil: 'domcontentloaded' });
  await bp.waitForTimeout(500);
  const badFrames = await measure(bp, 'nofix');
  ok('对照组（摘掉修复）确实会溢出 —— 说明这个脚本测到了东西',
    badFrames.some((f) => f.overflowX > 0 || f.overflowY > 0),
    badFrames.map((f) => `p${f.idx}:${f.overflowX}/${f.overflowY}`).join(' '));
  await bp.close();
} finally {
  await browser.close();
}

const bad = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - bad.length}/${checks.length} 通过`);
process.exit(bad.length ? 1 : 0);
