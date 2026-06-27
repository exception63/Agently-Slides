// verify-studio-skins.mjs · Studio 换皮下拉（21 张 editorial-slides 皮）端到端
//  下拉有 21+保持原样 · 选一套 → 预览叠加注入 bundle 重新着皮（令牌真变）· 导出烘焙 sm-skin
//  · 再导入识别并去重 · 切回「保持原样」移除。用法：node scripts/verify-studio-skins.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = process.cwd();
const studio = pathToFileURL(resolve(root, 'studio/slidesmith-studio.html')).href;
// 一张厚皮样板做换皮目标（cartesian 极简灰 → 换成 vaporwave 暗紫粉，令牌差异明显）
const deck = readFileSync(resolve(root, 'plugin/slidesmith/skills/editorial-slides/gallery/skins/cartesian.html'), 'utf8');

const checks = [];
const ok = (name, cond, extra = '') => { checks.push({ name, pass: !!cond, extra }); };

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');

  await page.evaluate((html) => window.__SM_IMPORT__('cartesian.html', html), deck);
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelector('#deck .slide'));
  }, { timeout: 8000 });
  await page.waitForTimeout(500);

  const dropdown = await page.evaluate(() => {
    const sel = document.getElementById('hSkin');
    return { present: !!sel, options: sel ? sel.options.length : 0, hasDefault: sel && sel.options[0] && sel.options[0].value === '' };
  });
  ok('换皮下拉存在', dropdown.present);
  ok('21 皮 + 保持原样 = 22 项', dropdown.options === 22, String(dropdown.options));
  ok('首项为「保持原样」（空值）', dropdown.hasDefault);

  // switch to vaporwave → tokens change live
  const after = await page.evaluate(async () => {
    const sel = document.getElementById('hSkin');
    sel.value = 'vaporwave'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const d = document.getElementById('preview').contentDocument;
    const slide = d.querySelector('#deck .slide'); const cs = getComputedStyle(slide);
    return {
      styleInjected: !!d.getElementById('sm-skin'),
      skinAttr: d.getElementById('sm-skin') && d.getElementById('sm-skin').getAttribute('data-skin'),
      fontInjected: !!d.getElementById('sm-skin-font'),
      accent: cs.getPropertyValue('--accent').trim(),
      paper: cs.getPropertyValue('--paper').trim(),
    };
  });
  ok('选皮后注入 <style id=sm-skin data-skin=vaporwave>', after.styleInjected && after.skinAttr === 'vaporwave');
  ok('选皮后注入该皮 web 字体 link', after.fontInjected);
  ok('令牌真被重写（accent=vaporwave #ff6ec7）', after.accent.toLowerCase() === '#ff6ec7', after.accent);
  ok('令牌真被重写（paper=vaporwave #1a0938）', after.paper.toLowerCase() === '#1a0938', after.paper);

  // export bakes the skin, re-import recovers + de-dupes
  const trip = await page.evaluate(async () => {
    const exp = window.__SM_EXPORT_HTML__();
    const baked = /<style id="sm-skin" data-skin="vaporwave">/.test(exp) && /id="sm-skin-font"/.test(exp);
    window.__SM_IMPORT__('reimport.html', exp);
    await new Promise((r) => setTimeout(r, 700));
    const d = document.getElementById('preview').contentDocument;
    return {
      baked,
      dropdownValue: document.getElementById('hSkin').value,
      styleCount: d.querySelectorAll('style#sm-skin').length,
      accent: getComputedStyle(d.querySelector('#deck .slide')).getPropertyValue('--accent').trim(),
    };
  });
  ok('导出烘焙 sm-skin + 字体', trip.baked);
  ok('再导入还原下拉选中（vaporwave）', trip.dropdownValue === 'vaporwave', trip.dropdownValue);
  ok('再导入不重复叠加（恰好 1 个 sm-skin）', trip.styleCount === 1, String(trip.styleCount));
  ok('再导入仍是 vaporwave 令牌', trip.accent.toLowerCase() === '#ff6ec7', trip.accent);

  // back to 保持原样 → skin removed, original tokens restored
  const none = await page.evaluate(async () => {
    const sel = document.getElementById('hSkin');
    sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const d = document.getElementById('preview').contentDocument;
    return { removed: !d.getElementById('sm-skin'), accent: getComputedStyle(d.querySelector('#deck .slide')).getPropertyValue('--accent').trim() };
  });
  ok('切回保持原样 → 移除 sm-skin', none.removed);
  ok('切回保持原样 → 还原 deck 自身令牌（非 vaporwave）', none.accent.toLowerCase() !== '#ff6ec7', none.accent);

  ok('全程无 JS / console 错误', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

let pass = 0;
for (const c of checks) { console.log((c.pass ? '✓' : '✗') + ' ' + c.name + (c.extra ? '  — ' + c.extra : '')); if (c.pass) pass++; }
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
