// slidesmith phone-remote + live Q&A · Cloudflare Worker 版云中转
// 与本地 relay.mjs 同一套转发协议；用 Durable Object(每个 room 一个实例) 承载 WebSocket。
// 免费额度可用（SQLite-backed Durable Object + WebSocket Hibernation）。
//
// 两条互不相干的业务共用同一个 Room：
//   ① 手机遥控   role=deck ↔ role=remote     （原样保留，一个房间只留一个 deck）
//   ② 现场问答   role=ask  → role=wall/host  （多对多，谁都不顶掉谁）
// 之所以问答不复用 deck 角色：deck 会「新的顶掉旧的」，而 slides 是公开分享的 ——
// 台下任何人打开一次公开链接，就会把讲台那份从房间里踢出去。问答端必须是"多实例共存"。
import REMOTE_HTML from './remote.html';
import ASK_HTML from './ask.html';

const CORS = { 'Access-Control-Allow-Origin': '*' };
const ROLES = ['deck', 'remote', 'ask', 'wall', 'host'];
// 注：deck 为「先到先得」，要顶替需 ?takeover=1

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

    // 学生扫码落地的提问页
    const q = p.match(/^\/q\/([A-Za-z0-9_-]{4,64})$/);
    if (q) {
      const html = ASK_HTML.replace('__ROOM__', JSON.stringify(q[1]))
        .replace('__TITLE__', JSON.stringify(url.searchParams.get('t') || ''));
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } });
    }

    if (p === '/ws') {
      const room = url.searchParams.get('room');
      const role = url.searchParams.get('role');
      if (!room || ROLES.indexOf(role) < 0) return new Response('bad request', { status: 400, headers: CORS });
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(req);
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};

const MAX_LEN = 200;     // 单条问题字数上限
const MAX_KEEP = 300;    // 房间最多留存多少条
const MIN_GAP = 4000;    // 同一台设备两次提交的最小间隔（毫秒）

// 一个 room 一个实例：转发 + 问答留存
export class Room {
  constructor(state) {
    this.state = state;
    this.lastPost = new Map();   // ws → 上次提交时间（休眠会丢，属可接受）
  }

  counts() {
    return { deck: this.state.getWebSockets('deck').length, remote: this.state.getWebSockets('remote').length };
  }
  roleOf(ws) { const t = this.state.getTags(ws); return t && t[0]; }
  sendTo(role, obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets(role)) { try { ws.send(s); } catch (e) { /* noop */ } }
  }
  sendMany(roles, obj) { for (const r of roles) this.sendTo(r, obj); }

  async qa() {
    const qs = (await this.state.storage.get('qa_list')) || [];
    const closed = (await this.state.storage.get('qa_closed')) || false;
    return { qs, closed };
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const role = new URL(req.url).searchParams.get('role');
    // 一个房间只留一个放映端，新的顶掉旧的。房间号是烘进 deck 文件的（保证二维码
    // 永不变），代价是任何拷贝/备份都带同一个房间号；两份同开时，遥控端一次点击会
    // 被转发给两份，讲稿屏还会被陈旧那份反复覆盖页码。判据取「新的赢」——你刚打开
    // 的才是要讲的那份。
    // ⚠️ 只对 deck 生效。wall/host/ask 是多实例共存的（见文件头注释）。
    // 放映端**先到先得**（不是「新的顶掉旧的」）：slides 是公开分享的，
    // 台下谁点一下「手机遥控」都不该把讲台那份踢下线。讲者换机器时带 takeover=1。
    const takeover = new URL(req.url).searchParams.get('takeover') === '1';
    if (role === 'deck' && this.state.getWebSockets('deck').length) {
      if (!takeover) {
        const pair0 = new WebSocketPair();
        this.state.acceptWebSocket(pair0[1], ['deck-rejected']);
        try {
          pair0[1].send(JSON.stringify({ type: 'deck-busy', hint: '本房间已有放映端在线。若这台才是要讲的那台，请选择「接管」。' }));
          pair0[1].close(1000, 'busy');
        } catch (e) { /* noop */ }
        return new Response(null, { status: 101, webSocket: pair0[0] });
      }
      for (const old of this.state.getWebSockets('deck')) {
        try { old.send(JSON.stringify({ type: 'evicted', reason: 'another-deck' })); } catch (e) { /* noop */ }
        try { old.close(1000, 'superseded'); } catch (e) { /* noop */ }
      }
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server, [role]);           // 带 tag=role，休眠也保留
    const peers = this.counts();
    server.send(JSON.stringify({ type: 'joined', role, peers }));
    // 问答端一连上就要拿到全量 —— 否则讲到问答页才打开的那块屏永远是空的
    if (role === 'wall' || role === 'host') {
      const { qs, closed } = await this.qa();
      try { server.send(JSON.stringify({ type: 'qa-init', questions: qs, closed })); } catch (e) { /* noop */ }
    } else if (role === 'ask') {
      const { closed, qs } = await this.qa();
      try { server.send(JSON.stringify({ type: 'qa-state', closed, total: qs.length })); } catch (e) { /* noop */ }
    }
    if (role === 'deck' || role === 'remote') {
      this.sendTo(role === 'deck' ? 'remote' : 'deck', { type: 'peer', role, event: 'join', peers });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const role = this.roleOf(ws);

    // ——— 问答 ———
    if (role === 'ask' || role === 'host' || role === 'wall') {
      let d = null;
      try { d = JSON.parse(String(message)); } catch (e) { return; }
      if (!d || typeof d.type !== 'string') return;

      if (role === 'ask' && d.type === 'qa-add') {
        const { qs, closed } = await this.qa();
        if (closed) { try { ws.send(JSON.stringify({ type: 'qa-ack', ok: false, why: 'closed' })); } catch (e) {} return; }
        // 频率阀门：不是内容审核，是防连点/防灌水的技术闸
        const now = Date.now(), last = this.lastPost.get(ws) || 0;
        if (now - last < MIN_GAP) { try { ws.send(JSON.stringify({ type: 'qa-ack', ok: false, why: 'too-fast', wait: Math.ceil((MIN_GAP - (now - last)) / 1000) })); } catch (e) {} return; }
        const text = String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
        if (!text) { try { ws.send(JSON.stringify({ type: 'qa-ack', ok: false, why: 'empty' })); } catch (e) {} return; }
        this.lastPost.set(ws, now);
        const item = { id: 'q' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36), t: text, ts: now };
        qs.push(item);
        while (qs.length > MAX_KEEP) qs.shift();
        await this.state.storage.put('qa_list', qs);
        this.sendMany(['wall', 'host'], { type: 'qa-new', q: item, total: qs.length });
        try { ws.send(JSON.stringify({ type: 'qa-ack', ok: true, total: qs.length })); } catch (e) { /* noop */ }
        return;
      }

      // 控制键只认 host / wall（讲者的 iPad 和放映端），学生端发过来一律不理
      if (role === 'ask') return;

      if (d.type === 'qa-clear') {
        await this.state.storage.put('qa_list', []);
        this.sendMany(['wall', 'host'], { type: 'qa-cleared' });
        return;
      }
      if (d.type === 'qa-hide' && d.id) {
        const { qs } = await this.qa();
        const next = qs.filter((x) => x.id !== d.id);
        await this.state.storage.put('qa_list', next);
        this.sendMany(['wall', 'host'], { type: 'qa-hidden', id: d.id, total: next.length });
        return;
      }
      if (d.type === 'qa-scroll') {
        // 纯瞬时指令，不落盘：讲者在 iPad 上翻大屏的问题墙
        this.sendTo('wall', { type: 'qa-scroll', dir: d.dir || 1 });
        return;
      }
      if (d.type === 'qa-close' || d.type === 'qa-open') {
        const closed = d.type === 'qa-close';
        await this.state.storage.put('qa_closed', closed);
        this.sendMany(['wall', 'host', 'ask'], { type: 'qa-state', closed });
        return;
      }
      return;
    }

    // ——— 手机遥控：一端的消息原样转发给另一端（cmd / signal / status）———
    const to = role === 'deck' ? 'remote' : 'deck';
    for (const peer of this.state.getWebSockets(to)) { try { peer.send(message); } catch (e) { /* noop */ } }
  }

  async webSocketClose(ws) {
    const role = this.roleOf(ws);
    this.lastPost.delete(ws);
    if (role === 'deck' || role === 'remote') {
      this.sendTo(role === 'deck' ? 'remote' : 'deck', { type: 'peer', role, event: 'leave', peers: this.counts() });
    }
  }
  async webSocketError() { /* noop */ }
}
