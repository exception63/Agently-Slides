// verify-showcases.mjs · 验证换皮展厅 + 版式库展厅
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const SKILL = path.join(ROOT, 'plugin/slidesmith/skills/editorial-slides');
const ASSETS = path.join(SKILL, 'assets');
const GAL = path.join(SKILL, 'gallery');
const SHOTS = path.join(ROOT, 'docs/screenshots/skins');
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

console.log('\n[P2] 换皮展厅 theme-showcase');
await page.goto(pathToFileURL(path.join(GAL, 'theme-showcase.html')).href, { waitUntil: 'load' });
await page.waitForTimeout(2500); // let iframes render their bare covers
const tinfo = await page.evaluate(() => {
  const frames = [...document.querySelectorAll('.sc-card iframe')];
  // file:// 跨帧 contentDocument 被拦，无法读子帧；改判 iframe 已加载完且 src 带 ?bare
  const bare = frames.filter(f => /\?bare\b/.test(f.getAttribute('src') || '')).length;
  return { frames: frames.length, bare };
});
ok(tinfo.frames === 22, `22 张皮缩略 iframe（实得 ${tinfo.frames}）`);
ok(tinfo.bare === 22, `全部 iframe 走 ?bare 只显封面（实得 ${tinfo.bare}，渲染见截图）`);
await page.screenshot({ path: path.join(SHOTS, '_theme-showcase.png') });

console.log('\n[P2] 版式库展厅 layout-showcase（O 键概览看全部版式）');
await page.goto(pathToFileURL(path.join(GAL, 'layout-showcase.html')).href, { waitUntil: 'load' });
await page.waitForTimeout(400);
const linfo = await page.evaluate(async () => {
  const has = (s) => !!document.querySelector(s);
  const layouts = { kpi: has('.kpi'), vs: has('.vs__pane'), timeline: has('.tl'), gantt: has('.gantt__bar'), roadmap: has('.rm'), diff: has('.diff__add'), mindmap: has('.mm-node') };
  window.deckAPI.toggleOverview();
  await new Promise(r => setTimeout(r, 300));
  return { layouts, cells: document.querySelectorAll('#sm-overview .ov-cell').length };
});
ok(Object.values(linfo.layouts).every(Boolean), '版式齐全：' + Object.entries(linfo.layouts).map(([k, v]) => k + (v ? '✓' : '✗')).join(' '));
ok(linfo.cells === 9, `概览网格 ${linfo.cells} 张缩略（9 个版式页）`);
await page.screenshot({ path: path.join(SHOTS, '_layout-overview.png') });
console.log('  · 截图 → docs/screenshots/skins/_theme-showcase.png, _layout-overview.png');

// —— P4 版式库现在对「原 7 厚皮」也内联（_layouts.css），且缺失令牌就地兜底 ——
// 抽查两张厚皮（浅 editorial · 暗 keynote-dark）：P4 组件确实「有样式」（非裸 DOM），且 --good/--accent-3 兜底解析成真颜色，无溢出。
console.log('\n[P4] 厚皮也补版式（_layouts.css 恒内联 + 兜底）');
const DEMO = path.join(ASSETS, 'demo/_layouts.slides.txt');
for (const skin of ['editorial', 'keynote-dark']) {
  const out = `/tmp/sm-p4-${skin}.html`;
  execSync(`cd "${ASSETS}" && python3 build.py ${skin} ${out} --slides "${DEMO}"`, { stdio: 'pipe' });
  await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const cs = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el) : null; };
    const transparent = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    const kpi = cs('.kpi'), up = cs('.kpi__d.up'), down = cs('.kpi__d.down'), vsB = cs('.vs__pane--b');
    let worst = 0; document.querySelectorAll('#deck .slide').forEach((s) => { const b = s.getBoundingClientRect(); const sc = b.height / 1080 || 1; s.querySelectorAll('*').forEach((el) => { const v = (el.getBoundingClientRect().bottom - b.top) / sc; if (v > worst) worst = v; }); });
    return {
      kpiStyled: !!kpi && !transparent(kpi.backgroundColor) && !transparent(kpi.borderTopColor),
      goodResolved: !!up && !transparent(up.color),           // var(--good,var(--green,…)) → 真颜色
      accent3Resolved: !!down && !transparent(down.color) && !!vsB && !transparent(vsB.borderTopColor),
      worst: Math.round(worst),
    };
  });
  ok(r.kpiStyled, `${skin}: kpi 有样式（底色 + accent 顶边，非裸 DOM）`);
  ok(r.goodResolved && r.accent3Resolved, `${skin}: --good / --accent-3 缺失令牌已兜底成真颜色`);
  ok(r.worst <= 1084, `${skin}: P4 页无溢出（最深 ${r.worst}px ≤ 1080）`);
}

await browser.close();
console.log(`\n=== ${pass} 过 / ${fail} 败 ===`);
process.exit(fail ? 1 : 0);
