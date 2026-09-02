// 批次一的两项「省钱」回归：
//   ① AI 请求里页面已有的 base64 图换成 sm-img:// 占位符（发出去的 .ai-tasks.md 不含 data:image），
//      AI 回写带占位符的页时 Studio 按表还原成真图；AI 手误写了不存在的占位符 → 不留坏链接。
//   ② 嵌入字体：只请求预览里真正用到的字重（拦下 Google Fonts 请求看 URL），
//      同一份 @font-face 出现两遍时去重；「嵌入字体」默认勾上且记住用户的选择。
// 不碰网络：fonts.googleapis.com / fonts.gstatic.com 都用 Playwright route 假装。
// Run: node scripts/verify-ai-slim.mjs
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (!process.env.SM_TSX) {
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SM_TSX: '1' } });
  process.exit(r.status ?? 1);
}
const { startBridge } = await import('../packages/bridge/src/index.ts');

const ck = [];
const ok = (n, v, x = '') => { ck.push(v); console.log(`${v ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };

// 一张 1×1 PNG 的 data URL，重复几千遍撑成「大图」——占位符该管的就是这种东西
const PX = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(40);
const deck = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Inter:wght@400;700&display=swap">
<style>:root{--paper:#fff;--ink:#111;--accent:#c33;--t-body:28px;--pad-x:80px;--font-sans:"Noto Sans SC",sans-serif;--font-display:"Inter",sans-serif}
.slide{width:1920px;height:1080px;font-family:var(--font-sans)} .title{font-family:var(--font-display);font-weight:700} .body{font-weight:400}
.bg{background-image:url(${PX})}</style></head><body><div class="deck" id="deck">
<section class="slide" data-id="s1" data-seg="0" data-segname="段 0" data-title="有图的一页"><h1 class="title">标题</h1><p class="body">正文</p><img src="${PX}" alt="示意"><div class="bg" style="background-image:url(${PX})">底图</div></section>
<section class="slide" data-id="s2" data-seg="0" data-segname="段 0" data-title="第二页"><h1 class="title">二</h1><p class="body">正文二</p></section>
</div></body></html>`;

const bridge = await startBridge({ port: 0 });
bridge.openHtml('__verify-slim__.html', deck);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const fontReqs = [];
  await page.route('https://fonts.googleapis.com/**', (route) => {
    fontReqs.push(route.request().url());
    route.fulfill({ contentType: 'text/css', body: `@font-face{font-family:'Fake';src:url(https://fonts.gstatic.com/s/fake.woff2) format('woff2')}` });
  });
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ contentType: 'font/woff2', body: Buffer.from('wOF2fake') }));
  await page.goto(bridge.url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_ALL_REQUEST__ === 'function' && window.__SM_BRIDGE__().connected === true, { timeout: 8000 });
  await page.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return d && d.querySelectorAll('#deck .slide').length === 2; }, { timeout: 8000 });

  // ── ① 占位符 ──
  await page.click('.htab[data-htab="ai"]');
  await page.evaluate(() => { const t = document.getElementById('aiInstruction'); t.value = '把标题改短'; t.dispatchEvent(new Event('input')); });
  const req = await page.evaluate(() => window.__SM_ALL_REQUEST__());
  ok('请求里没有 data:image', req && !/data:image\//.test(req.content));
  ok('已有的 <img> 换成了 sm-img:// 占位符', /<img[^>]+src="sm-img:\/\/\d+"/.test(req.content));
  ok('CSS url(data:image) 也换了', /url\(sm-img:\/\/\d+\)/.test(req.content));
  ok('请求里带了占位符规则给 AI', /占位符/.test(req.content));
  const before = deck.length;
  ok('请求比原页小得多', req.content.length < before * 0.5, `${req.content.length} vs 原 deck ${before} 字节`);

  // AI 回写：带占位符 + 一个 AI 手误的占位符
  const idOf = (req.content.match(/src="(sm-img:\/\/\d+)"/) || [])[1];
  const patch = `<section class="slide" data-id="s1" data-title="有图的一页"><h1 class="title">短标题</h1><img src="${idOf}" alt="示意" style="width:400px"><img src="sm-img://999" alt="不存在"></section>`;
  await page.evaluate((p) => window.__SM_APPLY_PATCH__ ? window.__SM_APPLY_PATCH__(p) : null, patch);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => { const d = document.getElementById('preview').contentDocument; const s = d.querySelector('#deck [data-id="s1"]'); return { html: s.outerHTML, imgs: Array.from(s.querySelectorAll('img')).map((i) => i.getAttribute('src') || '') }; });
  ok('回写后占位符还原成真图', after.imgs[0].startsWith('data:image/png') && after.imgs[0].length > 1000);
  ok('回写保留了 AI 加的 style', /width:400px/.test(after.html));
  ok('不存在的占位符没留成坏链接', after.imgs.length === 2 && after.imgs[1] === '');

  // ── ② 字体 ──
  ok('「嵌入字体」默认勾上', await page.evaluate(() => document.getElementById('embedFonts').checked));
  console.log('  预览里用到的字族/字重：', JSON.stringify(await page.evaluate(() => window.__SM_USED_FONTS__())));
  const html = await page.evaluate(async () => window.__SM_BUILD_EXPORT__ ? await window.__SM_BUILD_EXPORT__() : null);
  ok('导出走了字体嵌入（拦到了 Google Fonts 请求）', fontReqs.length >= 1, `${fontReqs.length} 次`);
  // 预览 iframe 自己也会去拉一次原始链接；导出发的那条带 &text=（子集），拿它看字重
  const u = decodeURIComponent(fontReqs.find((x) => /[?&]text=/.test(x)) || '');
  ok('Noto Sans SC 只要用到的字重（400 正文，不再要 500/900）', /Noto\+Sans\+SC:wght@400(&|$)/.test(u), u.replace(/&text=.*$/, ''));
  ok('Inter 保留 700（标题用到了）', /Inter:wght@[^&]*700/.test(u));
  ok('导出里外链字体没了、有内嵌 @font-face', html && !/fonts\.googleapis/.test(html) && /@font-face/.test(html));
  const dupIn = html.replace('</head>', '<style>@font-face{font-family:\'Fake\';src:url(data:font/woff2;base64,QQ==)}@font-face{font-family:\'Fake\';src:url(data:font/woff2;base64,QQ==)}</style></head>');
  const deduped = await page.evaluate((h) => window.__SM_DEDUPE_FONTS__ ? window.__SM_DEDUPE_FONTS__(h) : h, dupIn);
  const nBefore = (dupIn.match(/font-family:'Fake'/g) || []).length, nAfter = (deduped.match(/font-family:'Fake'/g) || []).length;
  ok('重复的 @font-face 只留一份', nBefore === 3 && nAfter === 2, `${nBefore} → ${nAfter} 处`);
  // 记住选择
  await page.evaluate(() => { const c = document.getElementById('embedFonts'); c.checked = false; c.dispatchEvent(new Event('change')); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_ALL_REQUEST__ === 'function', { timeout: 8000 });
  ok('用户关掉后刷新仍是关的（记住了选择）', !(await page.evaluate(() => document.getElementById('embedFonts').checked)));
  await page.evaluate(() => localStorage.removeItem('sm-embed-fonts'));
} finally {
  await browser.close(); await bridge.close();
}
const pass = ck.filter(Boolean).length;
console.log(`\n${pass}/${ck.length} 通过`);
process.exit(pass === ck.length ? 0 : 1);
