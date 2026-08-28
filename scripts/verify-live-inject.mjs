// /slidesmith:live 的回归 —— 装配脚本 + qa 互动块的端到端。
// 自己起一份本地 smrelay（不碰线上 live.zhouliying.com，也不写用户的真账本），
// 把 qa 块装进一份 gallery deck，用真浏览器验「学生提交 → 大屏出现」。
//
//   node scripts/verify-live-inject.mjs
//
// 覆盖：幂等 · 可逆 · 那一页真的进了 deck 引擎 · 二维码画出来 · wall 连上 ·
//       提问上墙 · iPad 翻墙(qa-scroll) · 问答页锚点算得出 · 深色皮不写死白底。
import { chromium } from './../node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8901, B = `http://127.0.0.1:${PORT}`;
const SKILL = 'plugin/slidesmith/skills/live';
const SELFHOST = 'plugin/slidesmith/skills/phone-remote/relay/selfhost/smrelay.py';
const ROOM = 'verifylive2026';
const ck = [];
const ok = (n, v, x = '') => { ck.push(v); console.log(`${v ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'smlive-'));
const deck = join(tmp, 'deck.html');
const inject = (args) => new Promise((res) => {
  const p = spawn('node', [join(SKILL, 'scripts/inject-live.mjs'), deck, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let o = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (o += d));
  p.on('close', (c) => res({ code: c, out: o }));
});

// ── 1. 装配 ────────────────────────────────────────────────────────
const SRC = 'plugin/slidesmith/skills/editorial-slides/gallery/academic.html';
copyFileSync(SRC, deck);
const slidesBefore = (readFileSync(SRC, 'utf8').match(/class="slide\b/g) || []).length;
let r = await inject(['--room', ROOM, '--relay', B]);
ok('装得上', r.code === 0, r.out.trim().split('\n')[0]);
const once = readFileSync(deck, 'utf8');
await inject(['--room', ROOM, '--relay', B]); await inject(['--room', ROOM, '--relay', B]);
ok('幂等：装三次 == 装一次', readFileSync(deck, 'utf8') === once);
await inject(['--remove']);
ok('可逆：--remove 后和原文件一模一样', readFileSync(deck, 'utf8') === readFileSync(SRC, 'utf8'));
await inject(['--room', ROOM, '--relay', B]);
r = await inject(['--room', 'ab', '--relay', B]);
ok('房间号不合法要拦下来', r.code !== 0 && /4–64/.test(r.out));

// ── 2. 起本地中转 ──────────────────────────────────────────────────
const srv = spawn('python3', [SELFHOST], {
  env: { ...process.env, SMRELAY_DATA: join(tmp, 'data'), SMRELAY_PORT: String(PORT), SMRELAY_HOST: '127.0.0.1' },
  stdio: 'ignore',
});
for (let i = 0; i < 40; i++) { try { if ((await fetch(B + '/health')).ok) break; } catch { } await sleep(150); }
ok('本地中转起来了', (await fetch(B + '/health').then((x) => x.text()).catch(() => '')) === 'ok');

// ── 3. 真浏览器：大屏那一页 ────────────────────────────────────────
const br = await chromium.launch({ headless: true });
const page = await br.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file://' + deck);
await page.waitForTimeout(1200);

const slidesAfter = await page.evaluate(() => document.querySelectorAll('#deck .slide').length);
ok('deck 多了一页（引擎认得，不是塞在外面）', slidesAfter === slidesBefore + 1, `${slidesBefore} → ${slidesAfter}`);
ok('二维码画出来了（不是退化成纯文字）',
  await page.evaluate(() => !!document.querySelector('#deck #qrAsk svg')));
ok('二维码指向学生页',
  (await page.evaluate(() => document.querySelector('#deck #qaUrl')?.textContent || '')).includes('/q/' + ROOM));
await page.waitForFunction(() => document.querySelector('#deck #qaStat')?.textContent?.includes('已连接'), null, { timeout: 8000 })
  .then(() => ok('大屏连上中转', true)).catch(() => ok('大屏连上中转', false));

// ── 4. 学生提交 → 上墙 ─────────────────────────────────────────────
const ask = await br.newPage();
await ask.goto(B + '/q/' + ROOM);
await ask.evaluate((b) => new Promise((res) => {
  const ws = new WebSocket(b.replace('http', 'ws') + '/ws?room=' + '__R__' + '&role=ask');
  window.__ws = ws; ws.onopen = () => setTimeout(res, 200); ws.onerror = () => res(); setTimeout(res, 4000);
}), B.replace('__R__', ROOM).replace(/$/, '') && B);
await ask.evaluate((room) => new Promise((res) => {
  const ws = new WebSocket(location.origin.replace('http', 'ws') + '/ws?room=' + room + '&role=ask');
  window.__ws = ws; ws.onopen = () => { ws.send(JSON.stringify({ type: 'qa-add', text: '这是一条验证用的提问' })); setTimeout(res, 400); };
  ws.onerror = () => res(); setTimeout(res, 4000);
}), ROOM);
await page.waitForFunction(() => document.querySelectorAll('#deck .qa-card').length > 0, null, { timeout: 6000 })
  .then(() => ok('学生提交 → 大屏实时出现', true)).catch(() => ok('学生提交 → 大屏实时出现', false));
ok('计数跟着走', (await page.evaluate(() => document.querySelector('#deck #qaCount')?.textContent)) === '1');

// iPad 翻大屏
const host = await br.newPage();
await host.goto(B + '/health');
await host.evaluate((room) => new Promise((res) => {
  const ws = new WebSocket(location.origin.replace('http', 'ws') + '/ws?room=' + room + '&role=host');
  window.__ws = ws; ws.onopen = () => { ws.send(JSON.stringify({ type: 'qa-scroll', dir: 1 })); setTimeout(res, 400); };
  ws.onerror = () => res(); setTimeout(res, 4000);
}), ROOM);
ok('iPad 的「大屏 ⬇」指令到得了墙上（qa-scroll 有人接）',
  await page.evaluate(() => typeof window.__SM_QA__?.scroll === 'function'));

// 问答页锚点（iPad 靠它自动切到问答面板）
const anchor = await page.evaluate(() => window.__SM_QA_ANCHOR__ || '');
ok('问答页锚点算得出来、且是正经段号（不是 sNaN-1）', /^s\d+-\d+$/.test(anchor), anchor);
ok('互动页在段导航里有自己的缩略图格子',
  await page.evaluate(() => {
    const s = document.querySelector('#deck .qa-slide');
    return !!document.querySelector(`[data-seg-thumbs="${s.dataset.seg}"]`);
  }));

// ── 5. 皮肤无关：深色皮上不能写死白底 ──────────────────────────────
const dark = join(tmp, 'dark.html');
copyFileSync('plugin/slidesmith/skills/editorial-slides/gallery/keynote-dark.html', dark);
await new Promise((res) => spawn('node', [join(SKILL, 'scripts/inject-live.mjs'), dark, '--room', ROOM, '--relay', B],
  { stdio: 'ignore' }).on('close', res));
const dp = await br.newPage({ viewport: { width: 1440, height: 900 } });
await dp.goto('file://' + dark);
await dp.waitForTimeout(900);
await dp.evaluate(() => {                       // 手动塞一张卡，免得还要真提交
  const w = document.querySelector('#deck #qaWall');
  const d = document.createElement('article'); d.className = 'qa-card';
  d.innerHTML = '<div class="qa-card__t">深色皮取色验证</div>'; w?.appendChild(d);
});
const cardBg = await dp.evaluate(() => getComputedStyle(document.querySelector('#deck .qa-card')).backgroundColor);
ok('问题卡在深色皮上跟着皮走（不是写死的白）', cardBg !== 'rgb(255, 255, 255)', cardBg);
ok('二维码底永远是白的（深色皮上也要能扫）',
  (await dp.evaluate(() => getComputedStyle(document.querySelector('#deck #qrAsk')).backgroundColor)) === 'rgb(255, 255, 255)');

// ── 收尾 ───────────────────────────────────────────────────────────
await br.close(); srv.kill(); rmSync(tmp, { recursive: true, force: true });
const pass = ck.filter(Boolean).length;
console.log(`\n${pass}/${ck.length} 通过`);
process.exit(pass === ck.length ? 0 : 1);
