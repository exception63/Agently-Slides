#!/usr/bin/env node
// slidesmith phone-remote · 零依赖迷你放映服务器
// ---------------------------------------------------------------------------
// 一条链路：
//   手机 /remote ──POST /cmd──▶ 本服务器 ──SSE /events──▶ /present(注入接收脚本的 deck)
//   接收脚本把命令合成成键盘事件(ArrowRight/ArrowLeft/f/Home/End...) → deck 本就监听 → 翻页
//
// 只用 Node 内置模块(http/os/fs/crypto/child_process)。二维码可选走系统 `qrencode`。
// 绑 0.0.0.0，房间码 gate /cmd 与 /events，仅局域网可用。
//
// 用法：
//   node server.mjs --deck <deck.html> [--port 8766] [--open]
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { randomInt } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- args --------------------------------------------------------------
function parseArgs(argv) {
  const a = { deck: null, port: 8766, open: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--deck') a.deck = argv[++i];
    else if (t === '--port') a.port = parseInt(argv[++i], 10) || 8766;
    else if (t === '--open') a.open = true;
    else if (!a.deck && !t.startsWith('--')) a.deck = t; // bare path
  }
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));

if (!ARGS.deck) {
  console.error('用法: node server.mjs --deck <deck.html> [--port 8766] [--open]');
  process.exit(2);
}
const DECK_PATH = resolve(process.cwd(), ARGS.deck);
if (!existsSync(DECK_PATH)) {
  console.error('找不到 deck 文件: ' + DECK_PATH);
  process.exit(2);
}
const DECK_NAME = basename(DECK_PATH);

// ---- room code (4 位数字，随机) ----------------------------------------
const CODE = String(randomInt(1000, 10000));

// ---- 读取静态资源 ------------------------------------------------------
function asset(name) {
  return readFileSync(join(HERE, 'assets', name), 'utf8');
}
const REMOTE_HTML = asset('remote.html');
const LANDING_HTML = asset('landing.html');

// ---- 把接收脚本注入 deck（每请求重读 deck + receiver，改了刷新即见）----
function buildPresentHtml() {
  let html = readFileSync(DECK_PATH, 'utf8');
  const inject = '<script>\n(function(){var __CODE__=' + JSON.stringify(CODE) + ';\n' +
    asset('receiver.js') + '\n})();\n</script>';
  const lower = html.toLowerCase();
  const idx = lower.lastIndexOf('</body>');
  if (idx >= 0) html = html.slice(0, idx) + inject + '\n' + html.slice(idx);
  else html += inject;
  return html;
}

// ---- SSE：连着的放映端(deck) ------------------------------------------
const decks = new Set(); // Set<ServerResponse>
function pushToDecks(obj) {
  const line = 'data: ' + JSON.stringify(obj) + '\n\n';
  let n = 0;
  for (const res of decks) { try { res.write(line); n++; } catch { /* noop */ } }
  return n;
}
// 心跳，防中间设备掐断 SSE
setInterval(() => { for (const res of decks) { try { res.write(': ping\n\n'); } catch { /* noop */ } } }, 15000).unref();

// ---- 网络地址枚举（挑局域网候选，热点网段优先靠前）--------------------
function lanCandidates() {
  const out = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      const ip = ni.address;
      // 打分：iPhone 热点 172.20.10.x 最高 → 常见家用 192.168.x → 10.x → 其它
      let score = 0;
      if (/^172\.20\.10\./.test(ip)) score = 100;
      else if (/^192\.168\./.test(ip)) score = 60;
      else if (/^10\./.test(ip)) score = 50;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score = 40;
      else if (/^169\.254\./.test(ip)) score = 5; // link-local，基本没用
      else score = 20;
      out.push({ ip, iface: name, score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
const CANDS = lanCandidates();
const BEST_IP = CANDS.length ? CANDS[0].ip : '127.0.0.1';

function remoteUrl(ip) { return `http://${ip}:${ARGS.port}/remote?code=${CODE}`; }
function landingUrl(ip) { return `http://${ip}:${ARGS.port}/`; }

// ---- 二维码（可选，走系统 qrencode；无则降级）-------------------------
let QR_SVG_CACHE = new Map();
function qrSvg(url) {
  if (QR_SVG_CACHE.has(url)) return QR_SVG_CACHE.get(url);
  let svg = null;
  try {
    const r = spawnSync('qrencode', ['-t', 'SVG', '-m', '1', '-o', '-', url], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout && r.stdout.includes('<svg')) svg = r.stdout;
  } catch { /* qrencode 缺失 */ }
  QR_SVG_CACHE.set(url, svg);
  return svg;
}
const HAS_QR = qrSvg(remoteUrl(BEST_IP)) != null;

// ---- HTTP --------------------------------------------------------------
function readBody(req) {
  return new Promise((res) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => res(d));
    req.on('error', () => res(''));
  });
}
function send(res, code, type, body, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra || {}));
  res.end(body);
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const path = u.pathname;

  // 落地页（电脑上打开：二维码 + 房间码 + 「开始放映」）
  if (path === '/' && req.method === 'GET') {
    const data = {
      code: CODE,
      deck: DECK_NAME,
      port: ARGS.port,
      hasQr: HAS_QR,
      candidates: CANDS.map((c) => ({ ip: c.ip, iface: c.iface, remote: remoteUrl(c.ip) })),
      best: BEST_IP,
    };
    const html = LANDING_HTML.replace('/*__DATA__*/null/*__END__*/', JSON.stringify(data));
    return send(res, 200, 'text/html; charset=utf-8', html);
  }

  // 二维码 SVG（?u=<url>）
  if (path === '/qr.svg' && req.method === 'GET') {
    const target = u.searchParams.get('u') || remoteUrl(BEST_IP);
    const svg = qrSvg(target);
    if (svg) return send(res, 200, 'image/svg+xml; charset=utf-8', svg);
    // 降级：一个提示 SVG
    const fb = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#eee"/><text x="90" y="90" font-size="12" text-anchor="middle" fill="#888">手输网址</text></svg>`;
    return send(res, 200, 'image/svg+xml; charset=utf-8', fb);
  }

  // 放映端：注入接收脚本的 deck
  if (path === '/present' && req.method === 'GET') {
    return send(res, 200, 'text/html; charset=utf-8', buildPresentHtml());
  }

  // 手机遥控页
  if (path === '/remote' && req.method === 'GET') {
    return send(res, 200, 'text/html; charset=utf-8', REMOTE_HTML);
  }

  // 手机 → 服务器：命令
  if (path === '/cmd' && req.method === 'POST') {
    const body = await readBody(req);
    let m;
    try { m = JSON.parse(body || '{}'); } catch { m = {}; }
    if (String(m.code) !== CODE) return send(res, 403, 'application/json', JSON.stringify({ ok: false, err: 'bad code' }));
    if (m.action === 'ping') return send(res, 200, 'application/json', JSON.stringify({ ok: true, decks: decks.size }));
    const ALLOWED = new Set(['next', 'prev', 'first', 'last', 'fullscreen', 'present', 'black']);
    if (!ALLOWED.has(m.action)) return send(res, 400, 'application/json', JSON.stringify({ ok: false, err: 'bad action' }));
    const n = pushToDecks({ action: m.action });
    return send(res, 200, 'application/json', JSON.stringify({ ok: true, decks: n }));
  }

  // 放映端 SSE 订阅
  if (path === '/events' && req.method === 'GET') {
    if (u.searchParams.get('code') !== CODE) return send(res, 403, 'text/plain', 'bad code');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    res.write('data: ' + JSON.stringify({ action: 'hello' }) + '\n\n');
    decks.add(res);
    req.on('close', () => { decks.delete(res); });
    return;
  }

  send(res, 404, 'text/plain', 'not found');
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error(`端口 ${ARGS.port} 被占用，换一个：node server.mjs --deck ... --port ${ARGS.port + 1}`);
    process.exit(3);
  }
  console.error('服务器错误:', e && e.message);
  process.exit(1);
});

server.listen(ARGS.port, '0.0.0.0', () => {
  const bar = '─'.repeat(52);
  console.log(bar);
  console.log('📱 Slidesmith 手机遥控已启动');
  console.log('   deck : ' + DECK_NAME);
  console.log('   房间码: ' + CODE + '   (二维码已含，无需手输)');
  console.log(bar);
  console.log('① 电脑上打开放映控制台（含二维码 + 开始放映按钮）:');
  for (const c of CANDS) console.log('     ' + landingUrl(c.ip) + '   [' + c.iface + ']');
  console.log('     http://localhost:' + ARGS.port + '/   [本机]');
  console.log('② 手机同 Wi-Fi → 扫码，或直接打开:');
  console.log('     ' + remoteUrl(BEST_IP));
  console.log(bar);
  if (!CANDS.length) {
    console.log('⚠️  没检测到局域网地址。手机连不上时用兜底：');
  } else {
    console.log('💡 手机连不上（会场 Wi-Fi 隔离设备）时的兜底：');
  }
  console.log('   iPhone 开「个人热点」→ 电脑连这个热点 → 重跑本命令（IP 会变 172.20.10.x）。');
  if (!HAS_QR) console.log('ℹ️  未装 qrencode，二维码降级为手输网址（brew install qrencode 可开二维码）。');
  console.log(bar);

  if (ARGS.open) {
    const opener = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'start' : 'xdg-open');
    try { spawn(opener, ['http://localhost:' + ARGS.port + '/'], { stdio: 'ignore', detached: true }).unref(); } catch { /* noop */ }
  }
});
