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
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve, basename, join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const DEFAULT_STUDIO = resolve(REPO_ROOT, 'studio', 'slidesmith-studio.html');

export const DEFAULT_PORT = 8765;

// Persist staged tray images to a temp dir and return it. Each image is a data URL
// (data:image/png;base64,…); we decode and write <id>.<ext> (ext matched to the
// Studio's manifest naming) so a Claude Code session can Read the actual pixels.
function saveTrayImages(reqId: string, images: { id?: string; name?: string; dataUrl?: string }[]): string {
  const dir = join(tmpdir(), 'slidesmith-tray', reqId);
  mkdirSync(dir, { recursive: true });
  for (const im of images) {
    if (!im || !im.dataUrl || !im.id) continue;
    const m = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/is.exec(im.dataUrl);
    if (!m) continue;
    const sub = m[1].toLowerCase();
    const ext = sub === 'jpeg' ? 'jpg' : sub === 'svg+xml' ? 'svg' : sub;
    writeFileSync(join(dir, `${im.id}.${ext}`), Buffer.from(m[2], 'base64'));
  }
  return dir;
}

// ---- generated-image library: ~/.slidesmith/library/<deck>/ (persistent, per-deck) ----
// Files are written by the Claude Code session during codex generation (per AGENTS.md
// §4e naming convention); the bridge only READS the index/files to serve the Studio's
// 图片库 panel, and removes on request. index.json is the manageable "database".
const LIB_ROOT = join(homedir(), '.slidesmith', 'library');
const safeSeg = (s: string): string => (s || '').replace(/[^\w.\-一-鿿]+/g, '_').replace(/\.\.+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'deck';
const libraryDir = (deck: string): string => join(LIB_ROOT, safeSeg(deck));
interface LibImage { id?: string; slideId?: string; slideTitle?: string; prompt?: string; style?: string; model?: string; file: string; w?: number; h?: number; bytes?: number; createdAt?: string; usedInDeck?: boolean }
function readLibraryIndex(deck: string): { deck: string; images: LibImage[] } {
  const f = join(libraryDir(deck), 'index.json');
  if (existsSync(f)) { try { const j = JSON.parse(readFileSync(f, 'utf8')); if (j && Array.isArray(j.images)) return { deck, images: j.images }; } catch { /* corrupt → empty */ } }
  return { deck, images: [] };
}
function writeLibraryIndex(deck: string, images: LibImage[]): void {
  const dir = libraryDir(deck); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ deck, updatedAt: new Date().toISOString(), images }, null, 2));
}
const IMG_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const mimeForFile = (f: string): string => IMG_MIME[(f.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

// ---- stock photo search: Pexels (free key) + Openverse (key-free, CC / public-domain) ----
// Lets the Studio search real photos and drop the picked one straight into the 暂存盘 (tray),
// which base64-inlines it into the deck → the exported single-file HTML stays offline.
// Pexels key resolves from PEXELS_API_KEY env or ~/.slidesmith/config.json {"pexelsApiKey":"…"}.
function readSlidesmithConfig(): Record<string, unknown> {
  const f = join(homedir(), '.slidesmith', 'config.json');
  if (existsSync(f)) { try { return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>; } catch { /* corrupt → ignore */ } }
  return {};
}
function pexelsKey(): string {
  return (process.env['PEXELS_API_KEY'] || (readSlidesmithConfig()['pexelsApiKey'] as string) || '').trim();
}
interface StockImage { id: string; thumb: string; full: string; w: number; h: number; author: string; authorUrl: string; license: string; pageUrl: string; source: string; alt: string }
async function searchPexels(query: string, page: number): Promise<StockImage[]> {
  const key = pexelsKey(); if (!key) throw new Error('no-pexels-key');
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=24&page=${page}`, { headers: { Authorization: key } });
  if (!r.ok) throw new Error('pexels ' + r.status);
  const j = await r.json() as { photos?: Array<Record<string, unknown>> };
  return (j.photos || []).map((p) => { const src = (p['src'] || {}) as Record<string, string>; return {
    id: 'px-' + String(p['id']), thumb: src['medium'] || src['small'] || '', full: src['large2x'] || src['large'] || src['original'] || '',
    w: Number(p['width']) || 0, h: Number(p['height']) || 0, author: String(p['photographer'] || ''), authorUrl: String(p['photographer_url'] || ''),
    license: 'Pexels（免费可商用·无需署名）', pageUrl: String(p['url'] || ''), source: 'pexels', alt: String(p['alt'] || ''),
  }; });
}
async function searchOpenverse(query: string, page: number): Promise<StockImage[]> {
  // page_size ≤ 20 for anonymous callers (21+ → 401); license_type=commercial,modification keeps
  // results safe for slides you present (commercially usable + croppable, attribution only).
  const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=20&page=${page}&mature=false&license_type=commercial,modification`, { headers: { 'User-Agent': 'Slidesmith/1.0 (+studio image search)' } });
  if (!r.ok) throw new Error('openverse ' + r.status);
  const j = await r.json() as { results?: Array<Record<string, unknown>> };
  return (j.results || []).map((p) => ({
    // thumb from the source CDN (p.url), NOT the api.openverse.org /thumb/ proxy — the proxy is
    // rate-limited to 5/hr for anonymous callers, so a 20-image grid mostly 401s → blank cells.
    id: 'ov-' + String(p['id']), thumb: String(p['url'] || p['thumbnail'] || ''), full: String(p['url'] || ''),
    w: Number(p['width']) || 0, h: Number(p['height']) || 0, author: String(p['creator'] || ''), authorUrl: String(p['creator_url'] || ''),
    license: (String(p['license'] || '') + ' ' + String(p['license_version'] || '')).toUpperCase().trim() || 'CC', pageUrl: String(p['foreign_landing_url'] || ''), source: 'openverse', alt: String(p['title'] || ''),
  }));
}
// Google Images via the Custom Search JSON API — searches the whole web (largest pool).
// Needs a Google API key + a Programmable Search Engine id (cx, "search entire web" + image on).
// Results are arbitrary web images (licensing not filtered) → for internal / no-copyright-issue use.
function googleKey(): string { return (process.env['GOOGLE_API_KEY'] || (readSlidesmithConfig()['googleApiKey'] as string) || '').trim(); }
function googleCx(): string { return (process.env['GOOGLE_SEARCH_CX'] || (readSlidesmithConfig()['googleSearchCx'] as string) || '').trim(); }
async function searchGoogle(query: string, page: number): Promise<StockImage[]> {
  const key = googleKey(), cx = googleCx();
  if (!key || !cx) throw new Error('no-google-config');
  const start = (page - 1) * 10 + 1; // CSE: 10/page, 1-based start, max start=91 (100 results)
  if (start > 91) return [];
  const params = new URLSearchParams({ key, cx, q: query, searchType: 'image', num: '10', start: String(start), safe: 'active' });
  const r = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('google ' + r.status + (t ? ' ' + t.slice(0, 200) : '')); }
  const j = await r.json() as { items?: Array<Record<string, unknown>> };
  return (j.items || []).map((it) => { const img = (it['image'] || {}) as Record<string, unknown>; return {
    id: 'gg-' + String(it['link'] || ''), thumb: String(img['thumbnailLink'] || it['link'] || ''), full: String(it['link'] || ''),
    w: Number(img['width']) || 0, h: Number(img['height']) || 0, author: String(it['displayLink'] || ''), authorUrl: String(img['contextLink'] || ''),
    license: 'Google · 网络来源（自行确认版权）', pageUrl: String(img['contextLink'] || ''), source: 'google', alt: String(it['title'] || ''),
  }; });
}
// ---- 中文图源（免密）：百度图片（全网最广）+ 维基共享（文化/史地·稳定官方）----
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
function stripTags(s: string): string { return (s || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }
// 百度：无官方关键词图搜 API → 用网页版内部 acjson。必须先访问首页拿到真 BAIDUID cookie（假的不认），
// 再带 cookie 调 acjson。缩略图在 img*.baidu.com CDN（下载需带 Referer，见 fetchImageDataUrl）。非官方，可能变。
async function searchBaidu(query: string, page: number): Promise<StockImage[]> {
  const boot = await fetch('https://image.baidu.com/', { headers: { 'User-Agent': BROWSER_UA } });
  const cookie = ((boot.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const params = new URLSearchParams({ tn: 'resultjson_com', ipn: 'rj', ct: '201326592', word: query, pn: String((page - 1) * 30), rn: '30', gsm: '1e', ie: 'utf-8' });
  const r = await fetch('https://image.baidu.com/search/acjson?' + params.toString(), { headers: { 'User-Agent': BROWSER_UA, 'Referer': 'https://image.baidu.com/', ...(cookie ? { Cookie: cookie } : {}) } });
  if (!r.ok) throw new Error('baidu ' + r.status);
  const text = await r.text();
  let j: { data?: Array<Record<string, unknown>> };
  try { j = JSON.parse(text); } catch { try { j = JSON.parse(text.replace(/\\'/g, "'").replace(/[\u0000-\u001f]+/g, " ")); } catch { throw new Error('baidu parse failed'); } }
  return (j.data || []).filter((x) => x && (x['thumbURL'] || x['middleURL'])).map((x) => ({
    id: 'bd-' + String(x['thumbURL'] || x['middleURL'] || ''), thumb: String(x['thumbURL'] || x['middleURL'] || ''), full: String(x['middleURL'] || x['hoverURL'] || x['thumbURL'] || ''),
    w: Number(x['width']) || 0, h: Number(x['height']) || 0, author: String(x['fromURLHost'] || ''), authorUrl: x['fromURLHost'] ? 'https://' + String(x['fromURLHost']) : '',
    license: '百度图片 · 网络来源（自行确认版权）', pageUrl: x['fromURLHost'] ? 'https://' + String(x['fromURLHost']) : '', source: 'baidu', alt: stripTags(String(x['fromPageTitleEnc'] || '')),
  }));
}
async function searchWikimedia(query: string, page: number): Promise<StockImage[]> {
  const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '20', gsroffset: String((page - 1) * 20), prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '480' });
  const r = await fetch('https://commons.wikimedia.org/w/api.php?' + params.toString(), { headers: { 'User-Agent': 'Slidesmith/1.0 (+studio image search)' } });
  if (!r.ok) throw new Error('wikimedia ' + r.status);
  const j = await r.json() as { query?: { pages?: Record<string, Record<string, unknown>> } };
  const pages = (j.query && j.query.pages) ? Object.values(j.query.pages) : [];
  pages.sort((a, b) => (Number(a['index']) || 0) - (Number(b['index']) || 0));
  return pages.filter((p) => Array.isArray(p['imageinfo'])).map((p) => {
    const ii = (p['imageinfo'] as Array<Record<string, unknown>>)[0]; const em = (ii['extmetadata'] || {}) as Record<string, { value?: string }>;
    return {
      id: 'wm-' + String(p['pageid'] || p['title'] || ''), thumb: String(ii['thumburl'] || ii['url'] || ''), full: String(ii['url'] || ''),
      w: Number(ii['width']) || 0, h: Number(ii['height']) || 0, author: stripTags(String(em['Artist']?.value || '')), authorUrl: String(ii['descriptionurl'] || ''),
      license: stripTags(String(em['LicenseShortName']?.value || 'Wikimedia')), pageUrl: String(ii['descriptionurl'] || ''), source: 'wikimedia', alt: stripTags(String(p['title'] || '')).replace(/^File:/, ''),
    };
  });
}
// download the picked image server-side (avoids CORS + canvas tainting) → data URL for the tray.
async function fetchImageDataUrl(rawUrl: string): Promise<{ dataUrl: string; bytes: number }> {
  let u: URL; try { u = new URL(rawUrl); } catch { throw new Error('bad url'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
  const host = u.hostname.toLowerCase(); // SSRF guard: no loopback / private ranges
  if (host === 'localhost' || host.endsWith('.local') || /^(0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error('blocked host');
  const dlHeaders: Record<string, string> = { 'User-Agent': BROWSER_UA };
  if (host.endsWith('baidu.com')) dlHeaders['Referer'] = 'https://image.baidu.com/'; // Baidu CDN needs a Referer
  const r = await fetch(rawUrl, { headers: dlHeaders });
  if (!r.ok) throw new Error('fetch ' + r.status);
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('image/')) throw new Error('not an image');
  const ab = await r.arrayBuffer();
  if (ab.byteLength > 20 * 1024 * 1024) throw new Error('image too large (>20MB)');
  return { dataUrl: `data:${ct.split(';')[0]};base64,${Buffer.from(ab).toString('base64')}`, bytes: ab.byteLength };
}

// ---- wire protocol (JSON over WebSocket) ----
//   bridge → Studio : { type:'hello', hasDeck, owner, port } | { type:'import', name, html } | { type:'patch', text, preview }
//   Studio → bridge : { type:'ready' } | { type:'requests', request, images? } | { type:'exported', name, html }
//
// An image-layout request carries images:[{id,name,dataUrl}]. The bridge writes each
// to a temp dir and substitutes the __TRAY_DIR__ token in the request text with that
// dir, so the Claude Code session can Read the actual pixels before deciding layout
// (the request text itself stays base64-free / token-light).
export interface BridgeRequest {
  id: string;
  ts: number;
  /** the prompt file the Studio built for the AI (markdown) */
  name: string;
  content: string;
  /** how many slides the user asked to change */
  count: number;
  /** user wants to review the AI's change before it's final (Studio's 改前先问我 switch) */
  confirm?: boolean;
}

/** who owns this bridge — the Claude Code session that ran `/slidesmith`. The
 * handshake binds a session label to this bridge+deck so a Studio knows exactly
 * which session is on the other end, and a request can't land in the wrong one. */
export interface BridgeOwner {
  label: string;
  since: number;
}

export interface BridgeStatus {
  url: string;
  port: number;
  connected: number;
  hasDeck: boolean;
  deckName: string | null;
  pendingRequests: number;
  /** the session that handshook this bridge (null until `/slidesmith` connects) */
  owner: BridgeOwner | null;
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
  /** long-poll: resolve as soon as the user submits a request (drains), or after
   *  timeoutMs with an empty list. This is what turns the pull model into a
   *  handshake loop — a caller blocks here instead of busy-polling. */
  waitForRequests(timeoutMs?: number): Promise<BridgeRequest[]>;
  /** push an AI patch (one or more <section data-id>) down to the connected Studio(s).
   *  preview=true marks it as a *proposal* so the Studio shows it behind a 保留/还原
   *  banner instead of committing silently (the 改前先问我 permission mode). */
  applyPatch(text: string, opts?: { preview?: boolean }): { clients: number; queued: boolean };
  status(): BridgeStatus;
  /** bind a Claude Code session label to this bridge (the handshake). Re-broadcasts
   *  hello so every connected Studio shows which session it's talking to. */
  handshake(label: string): BridgeOwner;
  /** the current owner, or null before any handshake */
  owner(): BridgeOwner | null;
  /** resolve once at least one Studio is connected (or reject on timeout) */
  waitForStudio(timeoutMs?: number): Promise<void>;
  /** open the Studio URL in the user's default browser */
  openBrowser(): void;
  close(): Promise<void>;
  /** emitted when the user submits edit-requests from the Studio */
  on(event: 'request', listener: (r: BridgeRequest) => void): this;
  on(event: 'studio-connected', listener: () => void): this;
  on(event: 'handshake', listener: (o: BridgeOwner) => void): this;
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

// Find a Chromium-family browser binary so we can open Studio in "app mode"
// (`--app=URL`): a standalone window with no tab strip, no address bar, no
// bookmarks — just our page. Returns the executable path, or null if none found.
// Any Chromium browser (Chrome / Edge / Brave / Chromium) supports --app.
function findChromiumBinary(): string | null {
  const candidates = process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : process.platform === 'win32'
    ? [
        join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
      ];
  for (const p of candidates) { if (p && existsSync(p)) return p; }
  return null;
}

// open Studio for the user, best-effort. Prefer Chrome "app mode" (chromeless
// standalone window — feels like a native app). Fall back to the default
// browser (`open` / `start` / `xdg-open`) if no Chromium browser is installed.
function launchBrowser(url: string): void {
  const chromium = findChromiumBinary();
  if (chromium) {
    // Calling the binary directly (vs `open -a`) reliably honours --app even
    // when the browser is already running; it attaches to the existing profile
    // and spawns a dedicated app window.
    try { spawn(chromium, [`--app=${url}`], { stdio: 'ignore', detached: true }).unref(); return; } catch { /* fall through */ }
  }
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* noop */ }
}

// Open a finished file (e.g. the exported PDF) in the OS default app, best-effort.
function openFile(path: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', path] : [path];
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
  // absolute path of the deck file when opened from disk (via handle.open / MCP
  // slidesmith_open) — lets PDF export save the file right next to the deck. Null
  // for in-memory decks (openHtml / file:// hand-off), which fall back to ~/.slidesmith.
  let deckAbsPath: string | null = null;
  let owner: BridgeOwner | null = null; // set by the handshake (which session owns this bridge)
  const pending: BridgeRequest[] = [];
  // long-poll waiters: callers blocked in waitForRequests / GET /api/wait. Resolved
  // the instant a request arrives (push-like), or by their own timeout.
  const waiters = new Set<(reqs: BridgeRequest[]) => void>();
  // patches that arrived while no Studio was connected — flushed on next connect
  const queuedPatches: Array<{ text: string; preview: boolean }> = [];

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
    // POST /api/handshake?label=…  → bind this session to the bridge (the handshake).
    // Lets a curl-driven loop claim ownership without MCP; re-broadcasts hello.
    if (url === '/api/handshake' && req.method === 'POST') {
      const label = decodeURIComponent((/[?&]label=([^&]+)/.exec(req.url || '') || [])[1] || '').trim();
      readBody(req).then((body) => {
        let lbl = label;
        if (!lbl) { try { const j = JSON.parse(body); if (j && typeof j.label === 'string') lbl = j.label.trim(); } catch { /* raw */ } }
        const o = handle.handshake(lbl || 'Claude');
        sendJson(res, { ok: true, owner: o, status: statusObj() });
      }).catch((e) => sendJson(res, { ok: false, error: String(e) }, 400));
      return;
    }
    // GET|POST /api/wait?timeout=N → long-poll: hold the connection until the user
    // submits an edit-request, then return it (drained). Times out empty after N ms.
    // This is the heartbeat of the auto loop: a background `curl` blocks here and
    // exits the moment work arrives, waking the session. Cap at 290s (< 5-min idle).
    if (url === '/api/wait' && (req.method === 'GET' || req.method === 'POST')) {
      const raw = parseInt((/[?&]timeout=(\d+)/.exec(req.url || '') || [])[1] || '25000', 10);
      const timeoutMs = Math.min(Math.max(isFinite(raw) ? raw : 25000, 1000), 290000);
      handle.waitForRequests(timeoutMs).then((reqs) => {
        sendJson(res, { ok: true, count: reqs.length, requests: reqs, timedOut: reqs.length === 0 });
      }).catch((e) => sendJson(res, { ok: false, error: String(e) }, 400));
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
    // POST /api/patch  body: raw <section data-id> html (or {"sections":"…","preview":bool}) → applied to Studio.
    // ?preview=1 (or JSON preview:true) marks it a proposal → Studio stages it behind 保留/还原.
    if (url === '/api/patch' && req.method === 'POST') {
      let preview = /[?&]preview=1\b/.test(req.url || '');
      readBody(req).then((body) => {
        let text = body;
        try { const j = JSON.parse(body); if (j && typeof j.sections === 'string') { text = j.sections; if (typeof j.preview === 'boolean') preview = j.preview; } } catch { /* raw html body */ }
        const r = handle.applyPatch(text, { preview });
        sendJson(res, { ok: true, ...r, preview, status: statusObj() });
      }).catch((e) => sendJson(res, { ok: false, error: String(e) }, 400));
      return;
    }
    // POST /api/export-pdf?name=<base>  body: the print-ready deck HTML → render it
    // headlessly with preferCSSPageSize and save a full-bleed 16:9 PDF beside the deck.
    // ?open=1 (default) also opens the finished PDF in the OS default viewer.
    if (url === '/api/export-pdf' && req.method === 'POST') {
      const nm = decodeURIComponent((/[?&]name=([^&]+)/.exec(req.url || '') || [])[1] || '') || (deck ? deck.name : 'deck');
      const wantOpen = !/[?&]open=0\b/.test(req.url || '');
      readBody(req).then(async (body) => {
        if (!body.trim()) { sendJson(res, { ok: false, error: 'empty html' }, 400); return; }
        const r = await renderDeckPdf(body, nm);
        if (r.ok && wantOpen) openFile(r.path);
        sendJson(res, r, r.ok ? 200 : 500);
      }).catch((e) => sendJson(res, { ok: false, error: String(e) }, 400));
      return;
    }
    // ---- generated-image library (serves the Studio 图片库 panel) ----
    const q = (name: string): string => decodeURIComponent((new RegExp('[?&]' + name + '=([^&]+)').exec(req.url || '') || [])[1] || '');
    // GET /api/library?deck=<base> → the index (metadata only; no pixels)
    if (url === '/api/library' && req.method === 'GET') {
      const deck = q('deck') || (currentDeckBase());
      sendJson(res, { ok: true, ...readLibraryIndex(deck) });
      return;
    }
    // GET /api/library/file?deck=&file=  → raw image bytes (for <img src>); ?as=dataurl → {dataUrl}
    if (url === '/api/library/file' && req.method === 'GET') {
      const deck = q('deck') || currentDeckBase(); const file = safeSeg(q('file'));
      const p = join(libraryDir(deck), file);
      if (!file || !existsSync(p)) { sendJson(res, { ok: false, error: 'not found' }, 404); return; }
      const buf = readFileSync(p); const mime = mimeForFile(file);
      if (q('as') === 'dataurl') { sendJson(res, { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }); return; }
      res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store', ...CORS }); res.end(buf);
      return;
    }
    // POST /api/library/remove?deck=&file=  → delete the file + its index entry
    if (url === '/api/library/remove' && req.method === 'POST') {
      const deck = q('deck') || currentDeckBase(); const file = safeSeg(q('file'));
      try {
        const p = join(libraryDir(deck), file); if (existsSync(p)) unlinkSync(p);
        const idx = readLibraryIndex(deck); writeLibraryIndex(deck, idx.images.filter((im) => im.file !== file));
        sendJson(res, { ok: true, deck, file });
      } catch (e) { sendJson(res, { ok: false, error: String(e) }, 400); }
      return;
    }
    // GET /api/image-search?q=&source=pexels|openverse&page=N → stock photo search.
    // Default source = pexels if a key is configured, else openverse (key-free). Never leaks the key.
    if (url === '/api/image-search' && req.method === 'GET') {
      const query = q('q').trim();
      const page = Math.max(1, parseInt(q('page') || '1', 10) || 1);
      const hasKey = !!pexelsKey(); const hasGoogle = !!(googleKey() && googleCx());
      let source = q('source'); if (!['pexels', 'openverse', 'google', 'baidu', 'wikimedia'].includes(source)) source = hasKey ? 'pexels' : 'openverse';
      const meta = { hasPexels: hasKey, hasGoogle };
      if (!query) { sendJson(res, { ok: false, error: 'empty query', ...meta }, 400); return; }
      void (async () => {
        try {
          const images = source === 'pexels' ? await searchPexels(query, page)
            : source === 'google' ? await searchGoogle(query, page)
              : source === 'baidu' ? await searchBaidu(query, page)
                : source === 'wikimedia' ? await searchWikimedia(query, page)
                  : await searchOpenverse(query, page);
          sendJson(res, { ok: true, source, ...meta, images });
        } catch (e) {
          const msg = String((e as Error).message || e);
          // Pexels failed for any reason (no key / bad-or-placeholder key / rate limit / network)
          // → fall back to the key-free Openverse so search still works. The response's `source`
          // field tells the UI it fell back, so the user sees they're on Openverse not Pexels.
          // Google is opt-in: surface its error (esp. no-google-config) so the user sets it up.
          if (source === 'pexels') {
            try { const images = await searchOpenverse(query, page); sendJson(res, { ok: true, source: 'openverse', ...meta, fellBack: true, images }); return; } catch { /* fall through */ }
          }
          sendJson(res, { ok: false, error: msg, ...meta }, 502);
        }
      })();
      return;
    }
    // GET /api/image-fetch?url=<encoded> → download the picked image server-side → { dataUrl }
    if (url === '/api/image-fetch' && req.method === 'GET') {
      const raw = q('url');
      if (!raw) { sendJson(res, { ok: false, error: 'no url' }, 400); return; }
      void (async () => {
        try { const { dataUrl, bytes } = await fetchImageDataUrl(raw); sendJson(res, { ok: true, dataUrl, bytes }); }
        catch (e) { sendJson(res, { ok: false, error: String((e as Error).message || e) }, 502); }
      })();
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

  // ---- PDF export: render the print-ready deck HTML headlessly with preferCSSPageSize
  // so the browser HONORS `@page{size:1920px 1080px;margin:0}` → every slide fills a
  // pixel-exact 16:9 PDF page. This is the one switch the interactive Save-as-PDF dialog
  // can't be made to flip from CSS, which is why the dialog leaves white margins; doing it
  // here makes export one-click and deterministic (no paper-size / margins / scale fiddling).
  async function renderDeckPdf(html: string, base: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    let chromium: { launch(opts?: unknown): Promise<{ newPage(): Promise<unknown>; close(): Promise<void> }> };
    try {
      ({ chromium } = (await import('playwright-core')) as unknown as { chromium: typeof chromium });
    } catch {
      return { ok: false, error: 'playwright-core 未安装：在仓库根 `npm i` 后重启 bridge' };
    }
    // save beside the deck if we know its real path, else into ~/.slidesmith/exports
    const safeBase = safeSeg(base.replace(/\.[^.]+$/, '')) || 'deck';
    const outDir = deckAbsPath ? dirname(deckAbsPath) : join(homedir(), '.slidesmith', 'exports');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, safeBase + '.pdf');
    let browser: { newPage(): Promise<unknown>; close(): Promise<void> } | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = (await browser.newPage()) as {
        setContent(html: string, opts?: unknown): Promise<void>;
        waitForTimeout(ms: number): Promise<void>;
        pdf(opts?: unknown): Promise<Buffer>;
        evaluate(fn: unknown): Promise<unknown>;
      };
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      // give embedded fonts / data-URI images a beat to settle so text metrics are final
      try { await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready); } catch { /* no fonts API */ }
      await page.waitForTimeout(350);
      const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      writeFileSync(outPath, buf);
      return { ok: true, path: outPath };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e) };
    } finally {
      try { await browser?.close(); } catch { /* noop */ }
    }
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

  // the hello a Studio gets on connect (and again after a handshake) — carries the
  // owning session + port so the Studio's top bar can show who it's talking to.
  function helloMsg(): { type: 'hello'; hasDeck: boolean; owner: BridgeOwner | null; port: number } {
    return { type: 'hello', hasDeck: !!deck, owner, port: handle.port };
  }
  // the current deck's base name (no extension) — the image library's per-deck folder key
  function currentDeckBase(): string { return deck ? basename(deck.name).replace(/\.[^.]+$/, '') : 'deck'; }
  // hand the freshly-queued requests to ONE blocked long-poll waiter (FIFO). Normal
  // operation has a single waiter (the owner session's loop); delivering to just one
  // keeps queue semantics if two ever overlap (no double-processing).
  function wakeWaiters(): void {
    if (!waiters.size || !pending.length) return;
    const first = waiters.values().next().value as ((r: BridgeRequest[]) => void) | undefined;
    if (!first) return;
    waiters.delete(first);
    const reqs = pending.slice(); pending.length = 0;
    try { first(reqs); } catch { /* noop */ }
  }

  wss.on('connection', (ws: WebSocket) => {
    sockets.add(ws);
    send(ws, helloMsg());
    if (deck) send(ws, { type: 'import', name: deck.name, html: deck.html });
    // flush any patches that were waiting for a Studio to show up
    while (queuedPatches.length) { const p = queuedPatches.shift()!; send(ws, { type: 'patch', text: p.text, preview: p.preview }); }
    emitter.emit('studio-connected');

    ws.on('message', (data) => {
      let m: { type?: string; request?: { name?: string; content?: string; count?: number; confirm?: boolean }; images?: { id?: string; name?: string; dataUrl?: string }[]; name?: string; html?: string };
      try { m = JSON.parse(String(data)); } catch { return; }
      if (m.type === 'requests' && m.request && typeof m.request.content === 'string') {
        const id = 'req-' + (++reqSeq);
        let content = m.request.content;
        // image-layout request: persist the staged pixels to a temp dir so the AI can
        // Read them, and point the __TRAY_DIR__ token in the prompt at that real dir.
        if (Array.isArray(m.images) && m.images.length) {
          try { content = content.replace(/__TRAY_DIR__/g, saveTrayImages(id, m.images)); }
          catch (e) { emitter.emit('error', e); }
        }
        const r: BridgeRequest = {
          id,
          ts: Date.now(),
          name: m.request.name || 'request.md',
          content,
          count: m.request.count || 1,
          confirm: !!m.request.confirm,
        };
        pending.push(r);
        emitter.emit('request', r);
        wakeWaiters(); // a long-poller blocked in /api/wait gets it instantly
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
      owner,
    };
  }

  const handle = emitter as BridgeHandle;
  handle.port = port;
  handle.url = `http://localhost:${port}/`;

  handle.openHtml = (name, html) => {
    deck = { name, html };
    deckAbsPath = null; // in-memory deck: no on-disk source (handle.open re-sets it after)
    broadcast({ type: 'import', name, html });
    return { url: handle.url, name, bytes: Buffer.byteLength(html) };
  };
  handle.open = (deckPath, openBrowser = false) => {
    const html = readFileSync(deckPath, 'utf8');
    const name = basename(deckPath);
    const r = handle.openHtml(name, html);
    deckAbsPath = resolve(deckPath); // remember real location for PDF export beside the deck
    if (openBrowser) launchBrowser(handle.url);
    return r;
  };
  handle.getRequests = (drain = true) => {
    const out = pending.slice();
    if (drain) pending.length = 0;
    return out;
  };
  handle.waitForRequests = (timeoutMs = 25000) =>
    new Promise<BridgeRequest[]>((res) => {
      // already-queued work returns immediately — never make a caller wait for
      // something that's already here.
      if (pending.length) { const out = pending.slice(); pending.length = 0; return res(out); }
      const settle = (reqs: BridgeRequest[]) => { clearTimeout(t); waiters.delete(settle); res(reqs); };
      const t = setTimeout(() => settle([]), timeoutMs);
      waiters.add(settle);
    });
  handle.applyPatch = (text, opts = {}) => {
    const preview = !!opts.preview;
    const clients = broadcast({ type: 'patch', text, preview });
    if (clients === 0) { queuedPatches.push({ text, preview }); return { clients: 0, queued: true }; }
    return { clients, queued: false };
  };
  handle.handshake = (label) => {
    owner = { label: label || 'Claude', since: Date.now() };
    broadcast(helloMsg()); // every Studio re-renders its "已连接会话 X" badge
    emitter.emit('handshake', owner);
    return owner;
  };
  handle.owner = () => owner;
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
      // release any long-poll waiters so their HTTP response/curl doesn't hang
      for (const w of [...waiters]) { try { w([]); } catch { /* noop */ } }
      waiters.clear();
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
