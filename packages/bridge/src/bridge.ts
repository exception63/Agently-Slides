// Slidesmith Bridge — the local middleman that lets the *browser* Studio and
// *desktop* Claude Code reach each other.
//
//   Studio  ──WebSocket──▶  Bridge  ◀──MCP──  Claude Code
//
// The Studio is sandboxed in a browser tab; Claude Code lives on the desktop.
// Neither can call the other directly. The bridge is the one process both can
// reach: the Studio connects to it over a same-origin WebSocket, Claude Code
// drives it over MCP. User edit-requests flow UP (Studio→bridge→Claude); AI
// patches flow DOWN (Claude→bridge→Studio). All state lives in memory.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const DEFAULT_STUDIO = resolve(REPO_ROOT, 'studio', 'slidesmith-studio.html');

export const DEFAULT_PORT = 8765;

// ---- wire protocol (JSON over WebSocket) ----
//   bridge → Studio : { type:'hello', hasDeck } | { type:'import', name, html } | { type:'patch', text }
//   Studio → bridge : { type:'ready' } | { type:'requests', request } | { type:'exported', name, html }
export interface BridgeRequest {
  id: string;
  ts: number;
  /** the prompt file the Studio built for the AI (markdown) */
  name: string;
  content: string;
  /** how many slides the user asked to change */
  count: number;
}

export interface BridgeStatus {
  url: string;
  port: number;
  connected: number;
  hasDeck: boolean;
  deckName: string | null;
  pendingRequests: number;
}

export interface BridgeOptions {
  port?: number;
  host?: string;
  /** path to the built Studio html (defaults to <repo>/studio/slidesmith-studio.html) */
  studioPath?: string;
}

export interface BridgeHandle extends EventEmitter {
  url: string;
  port: number;
  /** load a deck file into memory and push it to every connected Studio */
  open(deckPath: string, openBrowser?: boolean): { url: string; name: string; bytes: number };
  /** load a deck from an html string (used by tests / inline callers) */
  openHtml(name: string, html: string): { url: string; name: string; bytes: number };
  /** the edit-requests the user has submitted from the Studio (drains the queue by default) */
  getRequests(drain?: boolean): BridgeRequest[];
  /** push an AI patch (one or more <section data-id>) down to the connected Studio(s) */
  applyPatch(text: string): { clients: number; queued: boolean };
  status(): BridgeStatus;
  /** resolve once at least one Studio is connected (or reject on timeout) */
  waitForStudio(timeoutMs?: number): Promise<void>;
  /** open the Studio URL in the user's default browser */
  openBrowser(): void;
  close(): Promise<void>;
  /** emitted when the user submits edit-requests from the Studio */
  on(event: 'request', listener: (r: BridgeRequest) => void): this;
  on(event: 'studio-connected', listener: () => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

let reqSeq = 0;

function loadStudioHtml(studioPath: string): string {
  if (!existsSync(studioPath)) {
    throw new Error(
      `Studio not found at ${studioPath}. Run \`npm run build:studio\` first.`,
    );
  }
  return readFileSync(studioPath, 'utf8');
}

// open a url in the user's default browser, cross-platform, best-effort.
function launchBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* noop */ }
}

export function startBridge(opts: BridgeOptions = {}): Promise<BridgeHandle> {
  const host = opts.host || '127.0.0.1';
  const port = opts.port ?? DEFAULT_PORT;
  const studioPath = opts.studioPath || DEFAULT_STUDIO;
  let studioHtml = loadStudioHtml(studioPath); // startup copy (also the fallback)
  // Re-read the built Studio fresh on each page load so a `npm run build:studio` shows
  // up on a simple browser refresh — no bridge restart needed. Falls back to the
  // startup copy if the file is briefly unreadable (e.g. mid-rebuild).
  function currentStudioHtml(): string {
    try { studioHtml = readFileSync(studioPath, 'utf8'); } catch { /* keep last good copy */ }
    return studioHtml;
  }

  const emitter = new EventEmitter();
  const sockets = new Set<WebSocket>();
  let deck: { name: string; html: string } | null = null;
  const pending: BridgeRequest[] = [];
  // patches that arrived while no Studio was connected — flushed on next connect
  const queuedPatches: string[] = [];

  // permissive CORS so the offline (file://) Studio can probe the bridge and hand
  // its deck over before jumping to the connected version. Localhost dev tool only.
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } as const;

  const httpServer: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    if (url === '/' || url === '/studio' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...CORS });
      res.end(currentStudioHtml());
      return;
    }
    if (url === '/healthz' || url === '/status' || url === '/api/status') {
      sendJson(res, statusObj());
      return;
    }
    // POST /api/open  body: a contract HTML deck → load it (used by the offline Studio's
    // "连接 Claude" hand-off, so the connected version opens with the same deck)
    if (url === '/api/open' && req.method === 'POST') {
      readBody(req).then((body) => {
        const name = decodeURIComponent((/[?&]name=([^&]+)/.exec(req.url || '') || [])[1] || 'deck.html');
        if (body.trim()) handle.openHtml(name, body);
        sendJson(res, { ok: !!body.trim(), name });
      }).catch((e) => sendJson(res, { ok: false, error: String(e) }, 400));
      return;
    }
    // ---- control API: drive a running bridge without MCP (curl / scripts / dogfood) ----
    // GET /api/requests → the user's submitted edit-requests (drains by default; ?drain=0 to peek)
    if (url === '/api/requests' && (req.method === 'GET' || req.method === 'POST')) {
      const drain = !/[?&]drain=0\b/.test(req.url || '');
      const reqs = handle.getRequests(drain);
      sendJson(res, { ok: true, count: reqs.length, requests: reqs });
      return;
    }
    // POST /api/patch  body: raw <section data-id> html (or {"sections": "..."}) → applied to Studio
    if (url === '/api/patch' && req.method === 'POST') {
      readBody(req).then((body) => {
        let text = body;
        try { const j = JSON.parse(body); if (j && typeof j.sections === 'string') text = j.sections; } catch { /* raw html body */ }
        const r = handle.applyPatch(text);
        sendJson(res, { ok: true, ...r, status: statusObj() });
      }).catch((e) => sendJson(res, { ok: false, error: String(e) }, 400));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  function sendJson(res: ServerResponse, obj: unknown, code = 200): void {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS });
    res.end(JSON.stringify(obj));
  }
  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((res, rej) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => res(d)); req.on('error', rej); });
  }

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  function send(ws: WebSocket, msg: unknown): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* noop */ }
  }
  function broadcast(msg: unknown): number {
    let n = 0;
    for (const ws of sockets) { if (ws.readyState === ws.OPEN) { send(ws, msg); n++; } }
    return n;
  }

  wss.on('connection', (ws: WebSocket) => {
    sockets.add(ws);
    send(ws, { type: 'hello', hasDeck: !!deck });
    if (deck) send(ws, { type: 'import', name: deck.name, html: deck.html });
    // flush any patches that were waiting for a Studio to show up
    while (queuedPatches.length) send(ws, { type: 'patch', text: queuedPatches.shift() });
    emitter.emit('studio-connected');

    ws.on('message', (data) => {
      let m: { type?: string; request?: { name?: string; content?: string; count?: number }; name?: string; html?: string };
      try { m = JSON.parse(String(data)); } catch { return; }
      if (m.type === 'requests' && m.request && typeof m.request.content === 'string') {
        const r: BridgeRequest = {
          id: 'req-' + (++reqSeq),
          ts: Date.now(),
          name: m.request.name || 'request.md',
          content: m.request.content,
          count: m.request.count || 1,
        };
        pending.push(r);
        emitter.emit('request', r);
      } else if (m.type === 'exported' && typeof m.html === 'string') {
        // the Studio's current full deck html (e.g. after edits) — keep latest
        if (deck) deck.html = m.html;
        emitter.emit('exported', { name: m.name || (deck && deck.name), html: m.html });
      }
    });
    ws.on('close', () => sockets.delete(ws));
    ws.on('error', () => sockets.delete(ws));
  });

  function statusObj(): BridgeStatus {
    return {
      url: handle.url,
      port: handle.port,
      connected: [...sockets].filter((s) => s.readyState === s.OPEN).length,
      hasDeck: !!deck,
      deckName: deck ? deck.name : null,
      pendingRequests: pending.length,
    };
  }

  const handle = emitter as BridgeHandle;
  handle.port = port;
  handle.url = `http://localhost:${port}/`;

  handle.openHtml = (name, html) => {
    deck = { name, html };
    broadcast({ type: 'import', name, html });
    return { url: handle.url, name, bytes: Buffer.byteLength(html) };
  };
  handle.open = (deckPath, openBrowser = false) => {
    const html = readFileSync(deckPath, 'utf8');
    const name = basename(deckPath);
    const r = handle.openHtml(name, html);
    if (openBrowser) launchBrowser(handle.url);
    return r;
  };
  handle.getRequests = (drain = true) => {
    const out = pending.slice();
    if (drain) pending.length = 0;
    return out;
  };
  handle.applyPatch = (text) => {
    const clients = broadcast({ type: 'patch', text });
    if (clients === 0) { queuedPatches.push(text); return { clients: 0, queued: true }; }
    return { clients, queued: false };
  };
  handle.status = statusObj;
  handle.openBrowser = () => launchBrowser(handle.url);
  handle.waitForStudio = (timeoutMs = 15000) =>
    new Promise<void>((res, rej) => {
      if ([...sockets].some((s) => s.readyState === s.OPEN)) return res();
      const t = setTimeout(() => { emitter.off('studio-connected', ok); rej(new Error('timed out waiting for Studio to connect')); }, timeoutMs);
      const ok = () => { clearTimeout(t); res(); };
      emitter.once('studio-connected', ok);
    });
  handle.close = () =>
    new Promise<void>((res) => {
      for (const ws of sockets) { try { ws.close(); } catch { /* noop */ } }
      sockets.clear();
      wss.close(() => httpServer.close(() => res()));
    });

  return new Promise<BridgeHandle>((res, rej) => {
    let settled = false;
    const onListening = () => {
      if (settled) return; settled = true;
      httpServer.removeListener('error', onError);
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') { handle.port = addr.port; handle.url = `http://localhost:${addr.port}/`; }
      res(handle);
    };
    const onError = (e: NodeJS.ErrnoException) => {
      // port busy (e.g. another bridge / a leftover `serve` already on it) → take
      // any free port instead of dying, so the plugin's MCP server always comes up.
      if (e.code === 'EADDRINUSE' && port !== 0) { try { httpServer.listen(0, host); return; } catch { /* fall through */ } }
      if (!settled) { settled = true; rej(e); }
    };
    httpServer.on('listening', onListening);
    httpServer.on('error', onError);
    httpServer.listen(port, host);
  });
}
