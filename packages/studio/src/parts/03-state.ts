// ---- font library: pick a typeface for the selected element. System fonts are
// fully offline; the rest are Google Fonts loaded by <link> (online) or inlined
// as subset @font-face on export (the "嵌入字体" option → offline-portable). ----
interface FontDef { id: string; label: string; family: string; stack: string; google?: string; cat: 'sys' | 'en' | 'cjk' }
const FONTS: FontDef[] = [
  { id: '', label: '默认（主题字体）', family: '', stack: '', cat: 'sys' },
  { id: 'sys-sans', label: '系统无衬线', family: '', stack: 'system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif', cat: 'sys' },
  { id: 'sys-serif', label: '系统衬线', family: '', stack: 'Georgia,"Times New Roman","Songti SC",STSong,SimSun,serif', cat: 'sys' },
  { id: 'sys-mono', label: '系统等宽', family: '', stack: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', cat: 'sys' },
  { id: 'inter', label: 'Inter · 现代英文', family: 'Inter', stack: '"Inter",sans-serif', google: 'Inter:wght@400;500;600;700', cat: 'en' },
  { id: 'space-grotesk', label: 'Space Grotesk · 几何英文', family: 'Space Grotesk', stack: '"Space Grotesk",sans-serif', google: 'Space+Grotesk:wght@400;500;700', cat: 'en' },
  { id: 'montserrat', label: 'Montserrat · 标题英文', family: 'Montserrat', stack: '"Montserrat",sans-serif', google: 'Montserrat:wght@400;600;800', cat: 'en' },
  { id: 'playfair', label: 'Playfair Display · 衬线英文', family: 'Playfair Display', stack: '"Playfair Display",serif', google: 'Playfair+Display:wght@400;700;900', cat: 'en' },
  { id: 'jetbrains', label: 'JetBrains Mono · 等宽代码', family: 'JetBrains Mono', stack: '"JetBrains Mono",ui-monospace,monospace', google: 'JetBrains+Mono:wght@400;700', cat: 'en' },
  { id: 'noto-sc', label: '思源黑体 Noto Sans SC', family: 'Noto Sans SC', stack: '"Noto Sans SC",sans-serif', google: 'Noto+Sans+SC:wght@400;500;700;900', cat: 'cjk' },
  { id: 'noto-serif-sc', label: '思源宋体 Noto Serif SC', family: 'Noto Serif SC', stack: '"Noto Serif SC",serif', google: 'Noto+Serif+SC:wght@400;600;900', cat: 'cjk' },
  { id: 'zcool-xiaowei', label: '站酷小薇 · 优雅中文', family: 'ZCOOL XiaoWei', stack: '"ZCOOL XiaoWei",serif', google: 'ZCOOL+XiaoWei', cat: 'cjk' },
  { id: 'zcool-kuaile', label: '站酷快乐体 · 活泼中文', family: 'ZCOOL KuaiLe', stack: '"ZCOOL KuaiLe",sans-serif', google: 'ZCOOL+KuaiLe', cat: 'cjk' },
  { id: 'mashanzheng', label: '马善政毛笔 · 书法中文', family: 'Ma Shan Zheng', stack: '"Ma Shan Zheng",cursive', google: 'Ma+Shan+Zheng', cat: 'cjk' },
  { id: 'lxgw', label: '霞鹜文楷 LXGW · 仿宋中文', family: 'LXGW WenKai TC', stack: '"LXGW WenKai TC",serif', google: 'LXGW+WenKai+TC', cat: 'cjk' },
];
const FONT_BY_ID: Record<string, FontDef> = {}; FONTS.forEach((f) => (FONT_BY_ID[f.id] = f));
const usedFontIds = new Set<string>(); // google fonts picked this session → links injected into preview/export
const NEW_BLOCKS: Array<{ type: Block['type']; label: string; make: () => Block }> = [
  { type: 'heading', label: '标题', make: () => ({ id: '', type: 'heading', text: '新标题', level: 2 }) },
  { type: 'text', label: '正文', make: () => ({ id: '', type: 'text', text: '新的一段文字' }) },
  { type: 'list', label: '要点', make: () => ({ id: '', type: 'list', items: ['要点一', '要点二'] }) },
  { type: 'quote', label: '引用', make: () => ({ id: '', type: 'quote', text: '一句引用' }) },
  { type: 'image', label: '图片', make: () => ({ id: '', type: 'image', src: 'https://via.placeholder.com/800x450', alt: '图片说明' }) },
];

let deck: Deck = JSON.parse(JSON.stringify(EXAMPLE));
let cur = 0;
let selBid: string | null = null;
let fileBase = 'deck';

// ---- bridge: when the Studio is served by `slidesmith serve`/`mcp`, it connects
// back over a same-origin WebSocket so Claude Code (via MCP) can push decks /
// patches in and read the user's edit-requests out. Opened from file:// → no
// host → stays in fully-manual (offline) mode. ----
const bridge = { ws: null as WebSocket | null, connected: false, everConnected: false, tries: 0,
  owner: null as { label: string; since: number } | null, port: 0 };
// 改前先问我：when on, edit-requests carry confirm:true and AI patches arrive as
// proposals (保留/还原) instead of committing silently. Persisted across sessions.
const CONFIRM_KEY = 'sm-ai-confirm';
let aiConfirm = false;
try { aiConfirm = localStorage.getItem(CONFIRM_KEY) === '1'; } catch { /* noop */ }

// ---- v2 HTML-first mode: an imported contract HTML deck is the source of truth ----
type Mode = 'ir' | 'html';
let mode: Mode = 'ir';
interface HtmlSlide { id: string; title: string; seg: string; segName: string; variant: string; html: string }
let htmlSlides: HtmlSlide[] = [];
let htmlSelEl: Element | null = null; // currently selected element inside the edit iframe
let htmlGotoAfterRender = -1; // restore this slide after a re-render (e.g. after applying a patch)
let fxMode: 'auto' | 'manual' = 'auto'; // 动效播放模式：auto=进入页面即播 / manual=点击页面才播（写进导出的 <html data-smfx>）
let embedPhoneRemote = false; // 勾选「嵌入手机遥控」后，导出的 deck 会烘进「📱 手机遥控」按钮 + 配对客户端（云端/局域网可选）
let newRoomOnExport = false;  // 勾了才换新房间号；默认沿用 deck 里已有的，免得每导一版就要重扫码
let relayId = 'cf';           // 用哪个云中转。**默认 Cloudflare** —— 一直用得好，别擅自改默认
let remotePass = '';          // 遥控密码（明文只留在 Studio 内存里；烘进 deck 的是 sha256(room:密码)）
try { relayId = localStorage.getItem('sm-relay') || 'cf'; } catch { /* noop */ }
function relayUrl(): string {
  const hit = PR_RELAYS.filter((r) => r.id === relayId)[0];
  return (hit && hit.url) || PR_CLOUD;
}
let remotePassHash = '';      // 上面那个密码的 sha256，导出时同步取用
const PASS_SALT = 'slidesmith-remote:';   // 手机端算哈希用的是同一个盐
/** 密码 → sha256 十六进制。**烘哈希不烘明文**：deck 常常是公开分享的，
 *  源码里直接写着密码等于没设。
 *  ⚠️ 但要清楚它挡的是什么：它挡住「在台下扫了一眼大屏二维码就想遥控」的人；
 *  真去下载 deck 文件、翻出这串哈希的人仍然进得来（哈希就是凭证本身）。
 *  要更强的隔离就别公开分享那一份，现场用本地文件。 */
async function computePassHash(code: string): Promise<void> {
  if (!code) { remotePassHash = ''; return; }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PASS_SALT + code));
  remotePassHash = Array.from(new Uint8Array(buf)).map((b) => ('0' + b.toString(16)).slice(-2)).join('');
}
let lastExportRoom = '';      // 上一次导出实际用的房间号（导出后提示里报出来）

// ---- never-lose-work: a dirty flag + debounced localStorage draft + undo/redo history.
// All HTML-mode mutations route through markDirty()/pushHistory() so edits survive a
// refresh/crash and are reversible. (Roadmap step 1; see _memory/optimization-roadmap.md) ----
let dirty = false; // true when the deck has edits not yet written to the real file
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
const DRAFT_KEY = 'sm-studio-draft-v1';
interface Snap { slides: string; overrides: Record<string, string>; theme: string; skin: string; fx: 'auto' | 'manual'; cur: number }
let undoStack: Snap[] = [];
let redoStack: Snap[] = [];
let lastPushAt = 0, lastPushTag = '';
let gizmoEl: HTMLElement | null = null; // the move/resize overlay drawn over the selected element (in the iframe)

// ---- File System Access: a writable handle captured when the user opens a deck,
// so "保存 HTML" can overwrite that exact file in place (one click, no re-pick).
// Cleared on every import; re-set by the open-picker / drop paths below. Null when
// the deck came from the bridge or the browser lacks the API → save falls back to a picker. ----
interface FsWritable { write(data: BlobPart): Promise<void>; close(): Promise<void> }
interface FsFileHandle { kind?: string; name?: string; getFile(): Promise<File>; createWritable(): Promise<FsWritable> }
let fileHandle: FsFileHandle | null = null;
const aiInstructions: Record<string, string> = {}; // per-slide-id comment to AI (the human's task for that page)
const aiApplied = new Set<string>(); // slide ids AI has already applied a patch to (badge ✓ 已改)
const aiSent = new Set<string>(); // slide ids sent to Claude, waiting for a patch back (badge 已发送, pulsing)
const aiBefore: Record<string, string> = {}; // pre-AI html per slide id, so a change can be reverted
const proposed = new Set<string>(); // slide ids in a pending preview proposal (改前先问我), awaiting 保留/还原
// ---- image tray: stage images, then hand the whole batch to the AI to lay out ----
// AI-first: the user doesn't drop each image onto a page by hand. They collect images
// in this tray (with an optional per-image note), then send ONE request. The AI decides
// which page each image goes on and how to lay it out, returning <img data-img-id="…">
// placeholders; Studio backfills the real base64 by id (so the request stays token-light,
// and the bridge writes the pixels to disk so the AI can actually *see* each image).
interface TrayImage { id: string; name: string; dataUrl: string; w: number; h: number; note: string; placed: boolean; slideId: string }
const trayImages: TrayImage[] = []; // session-scoped (never persisted to the localStorage draft — base64 is huge)
let traySeq = 0;
// the deck's non-slide skeleton, kept verbatim so export re-emits a clean contract deck
const H = {
  head: '', htmlAttrs: 'lang="zh"', bodyClass: '', prelude: '', trailing: '',
  baseTokens: {} as Record<string, string>, overrides: {} as Record<string, string>,
  themes: [] as string[], theme: '',
  skin: '', // editorial-slides 换皮：''=保持原样，否则注入 SKINS[skin] 的 bundle 重新着皮
};

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

