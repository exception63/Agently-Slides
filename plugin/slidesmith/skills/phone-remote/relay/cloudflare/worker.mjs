// slidesmith phone-remote · Cloudflare Worker 版云中转
// 与本地 relay.mjs 同一套转发协议；用 Durable Object(每个 room 一个实例) 承载 WebSocket 配对。
// 免费额度可用（SQLite-backed Durable Object + WebSocket Hibernation）。
import REMOTE_HTML from './remote.html';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/health' || p === '/') return new Response('ok', { headers: CORS });

    const m = p.match(/^\/r\/([A-Za-z0-9_-]{4,64})$/);
    if (m) {
      const html = REMOTE_HTML.replace('__ROOM__', JSON.stringify(m[1]));
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } });
    }

    if (p === '/ws') {
      const room = url.searchParams.get('room');
      const role = url.searchParams.get('role');
      if (!room || (role !== 'deck' && role !== 'remote')) return new Response('bad request', { status: 400, headers: CORS });
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(req);
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};

// 一个 room 一个实例：只做「把一端的消息转发给另一端」+ 上下线通知
export class Room {
  constructor(state) { this.state = state; }

  counts() {
    return { deck: this.state.getWebSockets('deck').length, remote: this.state.getWebSockets('remote').length };
  }
  roleOf(ws) { const t = this.state.getTags(ws); return t && t[0]; }
  sendTo(role, obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets(role)) { try { ws.send(s); } catch (e) { /* noop */ } }
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const role = new URL(req.url).searchParams.get('role');
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server, [role]);           // 带 tag=role，休眠也保留
    const peers = this.counts();
    server.send(JSON.stringify({ type: 'joined', role, peers }));
    this.sendTo(role === 'deck' ? 'remote' : 'deck', { type: 'peer', role, event: 'join', peers });
    return new Response(null, { status: 101, webSocket: client });
  }

  // 收到一端的消息 → 原样转发给另一端（cmd / signal / status）
  async webSocketMessage(ws, message) {
    const to = this.roleOf(ws) === 'deck' ? 'remote' : 'deck';
    for (const peer of this.state.getWebSockets(to)) { try { peer.send(message); } catch (e) { /* noop */ } }
  }
  async webSocketClose(ws) {
    const role = this.roleOf(ws);
    this.sendTo(role === 'deck' ? 'remote' : 'deck', { type: 'peer', role, event: 'leave', peers: this.counts() });
  }
  async webSocketError() { /* noop */ }
}
