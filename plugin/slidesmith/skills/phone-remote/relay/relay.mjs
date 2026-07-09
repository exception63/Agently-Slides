#!/usr/bin/env node
// slidesmith phone-remote · 云中转（relay）
// ---------------------------------------------------------------------------
// 只做两件事：
//   ① 给手机提供遥控页（GET /r/<room>）
//   ② 在同一 room 里把「手机 → 放映端」的指令来回转发（WS）；也转发 WebRTC 信令(留给 Phase 2)
//
// 放映端(deck 里烘进的 pair-client)和手机(遥控页)各自用 WS 连到本服务、带上 room + role。
// room 是随机长串 = 配对密钥；relay 不存内容、不认身份，只按 room 转发。
//
// 本地测试：`node relay.mjs --port 8787`（用 Node 的 ws 库）。
// 上云：这段逻辑很小，之后照搬到 Cloudflare Workers / Deno Deploy（WebSocket 标准 API）。
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = (() => { const i = process.argv.indexOf('--port'); return i > 0 ? parseInt(process.argv[i + 1], 10) : 8787; })();
const REMOTE_HTML = readFileSync(join(HERE, 'remote.html'), 'utf8');

// room → { deck:Set<ws>, remote:Set<ws> }
const rooms = new Map();
function room(id) { if (!rooms.has(id)) rooms.set(id, { deck: new Set(), remote: new Set() }); return rooms.get(id); }
function peersOf(r, role) { return role === 'deck' ? r.remote : r.deck; }
function counts(r) { return { deck: r.deck.size, remote: r.remote.size }; }

function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* noop */ } }
function forward(r, fromRole, obj) { for (const ws of peersOf(r, fromRole)) send(ws, obj); }

// ---- QR（本地有 qrencode 就用；云端换成 JS 生成，见 baked/pair-client 的说明）----
function qrSvg(url) {
  try {
    const rr = spawnSync('qrencode', ['-t', 'SVG', '-m', '1', '-o', '-', url], { encoding: 'utf8' });
    if (rr.status === 0 && rr.stdout && rr.stdout.includes('<svg')) return rr.stdout;
  } catch { /* noop */ }
  return null;
}

const http = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const cors = { 'Access-Control-Allow-Origin': '*' };

  if (p === '/health' || p === '/') { res.writeHead(200, { 'Content-Type': 'text/plain', ...cors }); return res.end('ok'); }

  // 给「局域网/离线」模式用：告诉 deck 端本机的局域网 IP（浏览器自己拿不到），好生成手机可扫的地址
  if (p === '/whoami') {
    const ips = [];
    const ifs = networkInterfaces();
    for (const name of Object.keys(ifs)) for (const ni of ifs[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        let score = /^172\.20\.10\./.test(ni.address) ? 100 : /^192\.168\./.test(ni.address) ? 60 : /^10\./.test(ni.address) ? 50 : /^169\.254\./.test(ni.address) ? 5 : 20;
        ips.push({ ip: ni.address, score });
      }
    }
    ips.sort((a, b) => b.score - a.score);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    return res.end(JSON.stringify({ ips: ips.map((x) => x.ip), port: PORT }));
  }

  // 手机遥控页： /r/<room>
  const m = p.match(/^\/r\/([A-Za-z0-9_-]{4,64})$/);
  if (m) {
    const html = REMOTE_HTML.replace('__ROOM__', JSON.stringify(m[1]));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...cors });
    return res.end(html);
  }

  if (p === '/qr.svg') {
    const svg = qrSvg(u.searchParams.get('u') || '');
    if (svg) { res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', ...cors }); return res.end(svg); }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', ...cors });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#eee"/><text x="80" y="84" font-size="12" text-anchor="middle" fill="#888">扫码</text></svg>');
  }

  res.writeHead(404, cors); res.end('not found');
});

const wss = new WebSocketServer({ noServer: true });
http.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/ws') { socket.destroy(); return; }
  const id = u.searchParams.get('room');
  const role = u.searchParams.get('role');
  if (!id || (role !== 'deck' && role !== 'remote')) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, id, role));
});

wss.on('connection', (ws, id, role) => {
  const r = room(id);
  r[role].add(ws);
  // 告诉本端当前对端数量；告诉对端「有人来了」
  send(ws, { type: 'joined', role, peers: counts(r) });
  forward(r, role, { type: 'peer', role, event: 'join', peers: counts(r) });

  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(String(data)); } catch { return; }
    // 原样转发给同房间的对端（cmd / signal / status 都走这里）
    forward(r, role, msg);
  });
  ws.on('close', () => {
    r[role].delete(ws);
    forward(r, role, { type: 'peer', role, event: 'leave', peers: counts(r) });
    if (!r.deck.size && !r.remote.size) rooms.delete(id);
  });
  ws.on('error', () => { try { ws.close(); } catch { /* noop */ } });
});

http.listen(PORT, '0.0.0.0', () => {
  console.log(`relay listening on http://0.0.0.0:${PORT}  (WS /ws?room=&role=deck|remote · 手机页 /r/<room>)`);
});
