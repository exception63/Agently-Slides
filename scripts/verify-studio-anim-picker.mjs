// verify-studio-anim-picker.mjs · 验证「动画库子窗口选择器」接进 Studio
//  ① 画廊 picker 模式：渲染「应用到选中」按钮，点了会 postMessage({type:'smfx-pick',spec})
//  ② Studio：选中元素 → 收到 smfx-pick → 落属性/类 + 渲染「当前动画」chips + ✕ 移除 + 神奇移动配对
// 用法：node scripts/verify-studio-anim-picker.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STUDIO = path.join(ROOT, 'studio/slidesmith-studio.html');
const GALLERY = path.join(ROOT, 'plugin/slidesmith/skills/editorial-slides/gallery/animations.html');
const DECK = path.join(ROOT, 'docs/style-reference/keynote-target.html');
const SHOTS = path.join(ROOT, 'docs/screenshots/anim');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const browser = await chromium.launch({ headless: true });

console.log('\n[1] 画廊 picker 模式（应用按钮 + 回传）');
{
  const page = await browser.newPage({ viewport: { width: 980, height: 900 } });
  await page.goto(pathToFileURL(GALLERY).href + '#picker');
  await page.waitForTimeout(500);
  const picks = await page.evaluate(() => {
    window.__picks = [];
    window.addEventListener('message', (e) => { if (e.data && e.data.type === 'smfx-pick') window.__picks.push(e.data); });
    return { btns: document.querySelectorAll('.pick-btn').length, banner: !!document.querySelector('.picker-banner') };
  });
  ok(picks.btns >= 45, `picker 模式渲染「应用到选中」按钮 = ${picks.btns}（≥45）`);
  ok(picks.banner, '顶部出现选择模式横幅');
  // 点第一个入场卡（A1 淡入）的应用按钮 → 应回传 spec
  const got = await page.evaluate(async () => {
    const btn = document.querySelector('#cat-A .card .pick-btn');
    btn.click();
    await new Promise(r => setTimeout(r, 60));
    return window.__picks[0] || null;
  });
  ok(got && got.type === 'smfx-pick', '点「应用到选中」→ 回传 smfx-pick 消息');
  ok(got && got.spec && got.spec.mode === 'attr' && got.spec.attr === 'data-anim', `回传 spec 正确（${got ? JSON.stringify(got.spec) : '—'}）`);
  await page.close();
}

console.log('\n[2] Studio：选中元素 → 应用 → chips → 移除 → 神奇移动');
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  await page.goto(pathToFileURL(STUDIO).href, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((html) => window.__SM_IMPORT__('keynote.html', html), readFileSync(DECK, 'utf8'));
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelector('#deck .slide'));
  }, { timeout: 9000 });
  await page.waitForTimeout(900);

  ok(!!(await page.$('#hOpenGallery')), '动画效果 tab 有「🎬 打开动画库」按钮');
  ok(readFileSync(STUDIO, 'utf8').includes('smfx-pick'), 'Studio 已内嵌画廊（含 smfx-pick）');

  // 切到动画效果 tab + 选中一个文本元素
  const sel = await page.evaluate(() => {
    const ht = [...document.querySelectorAll('.htab')].find(b => /动画效果/.test(b.textContent)); if (ht) ht.click();
    const d = document.getElementById('preview').contentDocument;
    const slide = d.querySelector('#deck .slide.active') || d.querySelector('#deck .slide');
    const leaf = slide.querySelector('h1,h2,h3,.title,.cover__title,.eyebrow,p,.lead') || slide;
    leaf.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { tag: leaf.tagName.toLowerCase(), selected: !!d.querySelector('.sm-sel') };
  });
  ok(sel.selected, `选中了一个元素（${sel.tag}）`);

  // 模拟子窗口回传：应用入场 focus-in（A8）
  const applied = await page.evaluate(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'smfx-pick', code: 'A8', name: '聚焦显影', spec: { mode: 'attr', attr: 'data-anim', val: 'focus-in' } } }));
    await new Promise(r => setTimeout(r, 120));
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('.sm-sel');
    return { anim: el && el.getAttribute('data-anim'), chips: [...document.querySelectorAll('#hAnimChips .achip')].map(c => c.textContent) };
  });
  ok(applied.anim === 'focus-in', `应用入场 A8 → 元素 data-anim=focus-in（${applied.anim}）`);
  ok(applied.chips.some(c => /focus-in/.test(c)), `「当前动画」chips 显示已应用（${applied.chips.join(' / ')}）`);

  // 应用强调（class 走 attr data-emph）+ 一个点睛 class
  const applied2 = await page.evaluate(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'smfx-pick', name: '嗒哒', spec: { mode: 'attr', attr: 'data-emph', val: 'tada' } } }));
    await new Promise(r => setTimeout(r, 60));
    const d = document.getElementById('preview').contentDocument;
    const el = d.querySelector('.sm-sel');
    return { emph: el && el.getAttribute('data-emph'), chips: document.querySelectorAll('#hAnimChips .achip').length };
  });
  ok(applied2.emph === 'tada', `应用强调 → data-emph=tada（${applied2.emph}）`);
  ok(applied2.chips >= 2, `chips 累计 ${applied2.chips} 个`);

  // 点一个 chip 的 ✕ 移除
  const removed = await page.evaluate(async () => {
    const x = document.querySelector('#hAnimChips .achip button'); x.click();
    await new Promise(r => setTimeout(r, 80));
    return document.querySelectorAll('#hAnimChips .achip').length;
  });
  ok(removed < applied2.chips, `✕ 移除一个 → chips 减少到 ${removed}`);

  // 神奇移动配对：两次 morph pick → hint 从「起点」变「已配对」
  const morph = await page.evaluate(async () => {
    const d = document.getElementById('preview').contentDocument;
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'smfx-pick', name: '神奇移动', spec: { mode: 'morph' } } }));
    await new Promise(r => setTimeout(r, 60));
    const first = document.getElementById('hMorphHint').textContent;
    // 选另一个元素再配对
    const slide = d.querySelector('#deck .slide.active') || d.querySelector('#deck .slide');
    const leaves = slide.querySelectorAll('h1,h2,h3,.title,p,.lead,.eyebrow,span');
    const other = leaves[1] || leaves[0]; other.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'smfx-pick', name: '神奇移动', spec: { mode: 'morph' } } }));
    await new Promise(r => setTimeout(r, 60));
    const second = document.getElementById('hMorphHint').textContent;
    const morphed = d.querySelectorAll('[data-morph]').length;
    return { first, second, morphed };
  });
  ok(/起点/.test(morph.first), '神奇移动第 1 次 → 提示「起点」');
  ok(/配对/.test(morph.second) && morph.morphed >= 2, `神奇移动第 2 次 → 提示「已配对」，标记 ${morph.morphed} 个 data-morph`);

  ok(errs.length === 0, `Studio 无 JS 错误${errs.length ? '：' + errs[0] : ''}`);
  await page.screenshot({ path: path.join(SHOTS, '04-studio-picker.png') });
  console.log('  · 截图 → docs/screenshots/anim/04-studio-picker.png');
  await page.close();
}

await browser.close();
console.log(`\n=== ${pass} 过 / ${fail} 败 ===`);
process.exit(fail ? 1 : 0);
