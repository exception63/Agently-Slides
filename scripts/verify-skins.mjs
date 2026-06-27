// verify-skins.mjs · 构建并验证新「薄皮」（令牌 + 共享组件 _components.css）
// 用法：node scripts/verify-skins.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKILL = path.join(ROOT, 'plugin/slidesmith/skills/editorial-slides');
const ASSETS = path.join(SKILL, 'assets');
const DEMO = path.join(ASSETS, 'demo/_showcase.slides.txt');
const SHOTS = path.join(ROOT, 'docs/screenshots/skins');
mkdirSync(SHOTS, { recursive: true });

const SKINS = ['dracula', 'nord', 'tokyo-night', 'catppuccin-mocha', 'catppuccin-latte', 'vaporwave',
  'swiss-grid', 'bauhaus', 'cyberpunk-neon', 'glassmorphism', 'y2k-chrome', 'neo-brutalism', 'terminal-green', 'rose-pine'];
const SHOOT = ['dracula', 'vaporwave', 'swiss-grid', 'bauhaus', 'neo-brutalism', 'glassmorphism', 'terminal-green', 'tokyo-night'];

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

console.log('\n[P1] 14 张薄皮：构建 + 渲染 + 截图');
for (const skin of SKINS) {
  const out = `/tmp/sm-skin-${skin}.html`;
  execSync(`cd "${ASSETS}" && python3 build.py ${skin} ${out} --slides "${DEMO}"`, { stdio: 'pipe' });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const info = await page.evaluate(() => {
    const base = !!document.querySelector('.kpi__v') || true; // base components present in CSS
    const slide = document.querySelector('#deck .slide');
    const bg = slide ? getComputedStyle(slide).backgroundColor : '';
    const hasCover = !!document.querySelector('.cover__title');
    const hasKpi = !!document.querySelector('.kpi');
    const hasVs = !!document.querySelector('.vs__pane');
    const hasTl = !!document.querySelector('.tl');
    // —— 令牌兜底 canary：_components.css :root 默认令牌必须解析（曾因注释内嵌 */ 提前闭合而整块被吞）——
    const padY = getComputedStyle(document.documentElement).getPropertyValue('--pad-y').trim();
    const padCss = slide ? getComputedStyle(slide).paddingTop : '0px';
    // —— 溢出检测：deck 态量每页内容是否越过 1080 画布底（薄皮无 padding 时 .fill 会顶到边）——
    let worstOverflow = 0, worstSeg = '';
    document.querySelectorAll('#deck .slide').forEach(s => {
      const r = s.getBoundingClientRect(); const sc = r.height / 1080 || 1;
      let maxB = 0;
      s.querySelectorAll('*').forEach(el => { const b = (el.getBoundingClientRect().bottom - r.top) / sc; if (b > maxB) maxB = b; });
      if (maxB > worstOverflow) { worstOverflow = maxB; worstSeg = s.getAttribute('data-segname') || ''; }
    });
    return { bg, hasCover, hasKpi, hasVs, hasTl, slides: document.querySelectorAll('#deck .slide').length,
      padY, padCss, worstOverflow: Math.round(worstOverflow), worstSeg };
  });
  ok(info.hasCover && info.hasKpi && info.hasVs && info.hasTl && info.slides === 6,
    `${skin}: 6 页 + cover/kpi/vs/timeline 组件齐全 · bg=${info.bg}`);
  ok(info.padY !== '' && info.padCss !== '0px',
    `${skin}: 共享令牌兜底生效（--pad-y=${info.padY || '空!'} · slide pad=${info.padCss}）`);
  ok(info.worstOverflow <= 1084,
    `${skin}: 无页面溢出（最深内容底 ${info.worstOverflow}px ≤ 1080 画布${info.worstOverflow > 1084 ? ' · 越界于「' + info.worstSeg + '」' : ''}）`);
  if (SHOOT.includes(skin)) {
    // deck-view 元素截图（干净、无放映态重影、padding 如实）：截 KPI 页（idx 2）的 slide-wrap
    const wrap = page.locator('#deck .slide-wrap').nth(2);
    await wrap.screenshot({ path: path.join(SHOTS, skin + '.png') });
  }
}
console.log('  · 截图 → docs/screenshots/skins/');

// overview (P3) smoke on one skin
console.log('\n[P3] 概览网格 O 键');
await page.goto(pathToFileURL(`/tmp/sm-skin-dracula.html`).href, { waitUntil: 'load' });
await page.waitForTimeout(200);
const ov = await page.evaluate(async () => {
  window.deckAPI.toggleOverview();
  await new Promise(r => setTimeout(r, 200));
  const open = document.querySelector('#sm-overview.open');
  const cells = document.querySelectorAll('#sm-overview .ov-cell').length;
  return { open: !!open, cells };
});
ok(ov.open && ov.cells === 6, `概览打开 + ${ov.cells} 张缩略图（点击可跳页）`);

await browser.close();
console.log(`\n=== ${pass} 过 / ${fail} 败 ===`);
process.exit(fail ? 1 : 0);
