// 把一份契约 HTML deck 逐页按放映态截图，并检查每页是否越出 1920×1080 版心。
//   node scripts/shoot-deck.mjs <deck.html> <输出目录>
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
const [deckPath, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const html = readFileSync(deckPath, 'utf8');
const srv = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto(`http://127.0.0.1:${srv.address().port}/slides.html`, { waitUntil: 'load' }); await p.waitForTimeout(1200);
const total = await p.evaluate(() => window.deckAPI?.total || document.querySelectorAll('#deck > .slide').length);
await p.evaluate(() => document.body.classList.add('present'));
const over = [];
for (let i = 0; i < total; i++) {
  await p.evaluate((i) => window.deckAPI?.setActive(i), i); await p.waitForTimeout(450);
  const o = await p.evaluate((i) => {
    const s = document.querySelectorAll('.deck > .slide-wrap > .slide, #deck > .slide')[i]; if (!s) return null;
    const r = s.getBoundingClientRect(); const bad = [];
    for (const el of s.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.right > r.right + 2 || b.bottom > r.bottom + 2 || b.left < r.left - 2 || b.top < r.top - 2) bad.push(el.tagName + '.' + String(el.className).split(' ')[0]); }
    return { scroll: s.scrollHeight > s.clientHeight + 2, bad: [...new Set(bad)].slice(0, 6) };
  }, i);
  if (!o || o.scroll || o.bad.length) over.push({ page: i + 1, o });
  await p.screenshot({ path: `${outDir}/${String(i + 1).padStart(2, '0')}.png` });
}
console.log(`${total} 页已截图 → ${outDir}`);
console.log('溢出检查：', over.length ? JSON.stringify(over) : '全部在版心内');
console.log('页面错误：', errs.length ? errs.join(' | ') : '无');
await b.close(); srv.close();
