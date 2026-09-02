#!/usr/bin/env node
/**
 * inject-live.mjs —— 把「现场互动块」装进一份已经做好的 deck。
 *
 *   node inject-live.mjs <deck.html> --room qygl2026 [--blocks qa] [--relay https://live.zhouliying.com]
 *
 * 做四件事：
 *   ① 在 deck 容器末尾插入互动块的那一页（<section class="slide qa-slide">）
 *   ② 在最后一个 </body> 之前插入：房间配置 + 二维码库 + 手机遥控客户端 + 块的 CSS/JS
 *   ③ 已经装过就先整段拆掉再装（幂等，可以反复跑；改房间号直接重跑）
 *   ④ 打印三个网址，照着贴给学生 / 打开 iPad
 *
 * 反装：--remove（只拆不装）。不改原文件：--out <路径>。不要那一页：--no-slide。
 * 不要手机遥控客户端（只要问答墙）：--no-remote。
 *
 * ⚠️ 只认**最后一个** </body>。pair-client.js 自己的 JS 字符串里也有一个（它要拼一份
 *    演讲者窗口的 HTML）；用 replace 会把注入塞进那段字符串里，整个脚本语法错误、
 *    手机遥控按钮直接不出现。这一条踩过，别再用 replace。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(HERE, '..');                       // skills/live
const PHONE = resolve(SKILL, '..', 'phone-remote');      // 兄弟 skill，二维码库和遥控客户端在它那儿
const DEFAULT_RELAY = 'https://live.zhouliying.com';
const ROOM_RE = /^[A-Za-z0-9_-]{4,64}$/;
const DEFAULT_SEGNAME = { qa: '段 · 现场答疑' };

const B = '<!-- ══ SM-LIVE:BEGIN ══ 由 /slidesmith:live 注入，整段可重复覆盖 -->';
const E = '<!-- ══ SM-LIVE:END ══ -->';
const sB = (k) => `<!-- ══ SM-LIVE:SLIDE:${k}:BEGIN ══ -->`;
const sE = (k) => `<!-- ══ SM-LIVE:SLIDE:${k}:END ══ -->`;

// ── 参数 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] ?? d); };
const has = (n) => argv.includes('--' + n);
const file = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const room = flag('room', '');
const relay = String(flag('relay', DEFAULT_RELAY)).replace(/\/$/, '');
const blocks = String(flag('blocks', 'qa')).split(',').map((s) => s.trim()).filter(Boolean);
const out = flag('out', file);
const die = (m) => { console.error('✗ ' + m); process.exit(1); };

if (!file) die('用法：node inject-live.mjs <deck.html> --room <房间号> [--blocks qa]');
if (!existsSync(file)) die('找不到 deck：' + file);
if (!has('remove')) {
  if (!room) die('必须给 --room（一门课一个房间号，烘一次就别改，二维码才永不变）');
  if (!ROOM_RE.test(room)) die('房间号只能是 4–64 位字母数字和 - _，收到的是：' + room);
}

let html = readFileSync(file, 'utf8');
const before = html;

// ── 先拆掉上一次装的（幂等）────────────────────────────────────────
function cutBetween(s, begin, end) {
  let n = 0;
  for (;;) {
    const i = s.indexOf(begin);
    if (i < 0) break;
    const j = s.indexOf(end, i);
    if (j < 0) break;
    // 精确反转插入：插的时候在 END 后面补了一个换行，拆的时候就把那一个吃掉。
    // （别用「把两边空白都吃掉」那种写法 —— 它会连原文件自己的空行一起吃，
    //   于是「装一次」和「装两次」产出的文件不一样，就不叫幂等了。）
    let k = j + end.length;
    if (s[k] === '\n') k++;
    s = s.slice(0, i) + s.slice(k);
    n++;
    if (n > 50) break;                       // 兜底，别死循环
  }
  return [s, n];
}
let cut = 0;
for (const k of ['qa', 'poll', 'quiz', 'cloud', 'buzz', 'rate']) {
  const [s, n] = cutBetween(html, sB(k), sE(k)); html = s; cut += n;
}
{ const [s, n] = cutBetween(html, B, E); html = s; cut += n; }
// 注释标记不一定还在：Studio 导入后按 <section> 收割、导出时只重发 section 本体，
// 夹在 section 之间的标记注释就没了。所以互动页自己还带一个 data-sm-live 属性，
// 拆的时候按属性找、按 <section> 层级配平（页里还有 <section class="qa-wall">，不能用非贪婪正则）。
function cutLiveSections(s) {
  let n = 0;
  for (;;) {
    const m = /<section\b[^>]*\bdata-sm-live=/i.exec(s);
    if (!m) break;
    const re = /<section\b|<\/section\s*>/gi;
    re.lastIndex = m.index + 1;
    let depth = 1, end = -1, t;
    while ((t = re.exec(s))) { depth += t[0][1] === '/' ? -1 : 1; if (depth === 0) { end = t.index + t[0].length; break; } }
    if (end < 0) break;
    if (s[end] === '\n') end++;
    s = s.slice(0, m.index) + s.slice(end);
    n++;
    if (n > 20) break;
  }
  return [s, n];
}
{ const [s, n] = cutLiveSections(html); html = s; cut += n; }
if (cut) console.log(`· 拆掉上一次装的 ${cut} 段`);

if (has('remove')) {
  writeFileSync(out, html, 'utf8');
  console.log(`✓ 已卸干净 → ${out}`);
  process.exit(0);
}

// ── 找 deck 容器的收尾 </div> ───────────────────────────────────────
// 数 div 层级。注释里也可能有 <div，先把注释内容抹成等长空格（保住所有下标）。
function deckCloseIndex(s) {
  const masked = s.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  const open = masked.search(/<div[^>]*\bid=["']deck["']/i);
  if (open < 0) return -1;
  let i = masked.indexOf('>', open);
  if (i < 0) return -1;
  i++;
  let depth = 1;
  const re = /<div\b|<\/div\s*>/gi;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(masked))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

// ── 装 ──────────────────────────────────────────────────────────────
const read = (p) => readFileSync(p, 'utf8');
const S = '<scr' + 'ipt>', Z = '</scr' + 'ipt>';
const parts = [];
const slidesAdded = [];

for (const k of blocks) {
  const dir = join(SKILL, 'assets', 'blocks', k);
  if (!existsSync(join(dir, 'block.html'))) die(`没有 ${k} 这个互动块（有的：看 assets/blocks/）`);
  if (!has('no-slide') && existsSync(join(dir, 'slide.html'))) {
    const at = deckCloseIndex(html);
    if (at < 0) die('这份 HTML 里找不到 <div id="deck">，不像是 Slidesmith 的 deck；要么用 --no-slide 只装运行时');
    // data-seg 必须是**数字** —— 引擎的 segOf() 是 parseInt，非数字会算出 NaN：
    // 锚点变成 sNaN-1，段导航里 [data-seg-thumbs="NaN"] 这个容器根本不存在，缩略图也没了。
    // 默认新开一段（最大段号 + 1），互动页在段导航里自成一格。
    const segs = [...html.matchAll(/data-seg=["'](\d+)["']/g)].map((m) => +m[1]);
    const seg = flag('seg', String(segs.length ? Math.max(...segs) + 1 : 1));
    const segname = flag('segname', DEFAULT_SEGNAME[k] || '互动');
    html = html.slice(0, at) + sB(k) + '\n'
      + read(join(dir, 'slide.html')).trimEnd().replaceAll('__SEG__', seg).replaceAll('__SEGNAME__', segname)
      + '\n' + sE(k) + '\n' + html.slice(at);
    slidesAdded.push(k);
  }
  parts.push(read(join(dir, 'block.html')).trimEnd());
}

// 房间配置：遥控和问答**用同一个房间号**——角色不同（deck/remote vs ask/wall/host），
// 同一个房间各走各的。只有一个号要记，换房间也只换一处。
const boot = S + `window.__SM_CLOUD_RELAY__=${JSON.stringify(relay)};`
  + `window.__SM_ROOM__=${JSON.stringify(room)};`
  + `window.__SM_QA_ROOM__=${JSON.stringify(room)};` + Z;

const libs = [];
if (!/QR Code Generator for JavaScript/.test(html)) libs.push(S + read(join(PHONE, 'baked', 'vendor-qrcode.js')) + Z);
else console.log('· 二维码库已在，跳过');
if (!has('no-remote')) {
  // 遥控**公开版也要烘**。讲者的实际用法是：公用电脑打开公开链接放映 + 自己的 iPad 遥控；
  // 公开版没有遥控等于这套流程直接废掉。「学生点一下把讲台顶下线」在中转那层解决了
  // （deck 先到先得，新的一律回 deck-busy，只有显式 takeover=1 才顶替）。
  if (!/pair-client\.js/.test(html)) libs.push(S + read(join(PHONE, 'baked', 'pair-client.js')) + Z);
  else console.log('· 手机遥控客户端已在（Studio 烘过？），跳过');
}

const tail = [B, boot, ...libs, ...parts, E].join('\n');
const i = html.lastIndexOf('</body>');          // ⚠️ 只认最后一个，见文件头
if (i < 0) die('这份 HTML 没有 </body>');
html = html.slice(0, i) + tail + '\n' + html.slice(i);

writeFileSync(out, html, 'utf8');

// ── 交代清楚 ────────────────────────────────────────────────────────
console.log(`✓ ${blocks.join(' + ')} 已装进 ${out}${out === file ? '（就地改写）' : ''}`);
if (slidesAdded.length) console.log(`  新增了 ${slidesAdded.length} 页：${slidesAdded.join('、')}（在 deck 最后；要挪位置就剪贴那段 section）`);
console.log(`  房间号     ${room}`);
console.log(`  学生扫码   ${relay}/q/${room}`);
console.log(`  你的 iPad  ${relay}/r/${room}      ←（不用带参数，问答面板默认就在）`);
console.log(`  管理台     ${relay}/                ←（要密码，和 MySpace 同一个）`);
if (html === before) console.log('  （内容没变化）');
