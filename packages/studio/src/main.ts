// Slidesmith Studio — a fully client-side editor bundled into one HTML file.
// Open it (file:// or http), import a contract HTML deck, edit Keynote-style, then
// "保存" to overwrite the opened file in place (File System Access API; first save
// picks the file once, then one-click overwrite). "导出 PDF" for a shareable artifact.
// No server, no CLI.
import {
  validateDeck,
  LAYOUTS,
  ANIM_NAMES,
  ANIM_OUT_NAMES,
  MOTION_NAMES,
  EMPH_NAMES,
  COLOR_TOKENS,
  SIZE_TOKENS,
  ALIGN_TOKENS,
  WEIGHT_TOKENS,
} from '@slidesmith/ir';
import type { Deck, Block, Slide, NoteBlock } from '@slidesmith/ir';
import { parseMarkdownToIR } from '@slidesmith/parser-md';
import { renderDeckHtml } from '@slidesmith/engine';
import { listThemes } from '@slidesmith/themes';
import { galleryHtml } from '@slidesmith/anim-gallery';
import { fxCanvasJs } from '@slidesmith/fx-canvas';
import { cloudRelay as PR_CLOUD, qrLibJs, pairClientJs } from '@slidesmith/phone-remote';
import { SKINS, SKIN_ORDER } from '@slidesmith/skins';

// ---- preview bridge: injected into the deck iframe for inline editing ----
const BRIDGE = `
(function(){
  'use strict';
  if(window.parent===window) return;
  var P=window.parent;
  function post(m){ try{P.postMessage(m,'*');}catch(e){} }
  function toMd(el){
    var h=el.innerHTML
      .replace(/<strong[^>]*>/gi,'**').replace(/<\\/strong>/gi,'**')
      .replace(/<b[^>]*>/gi,'**').replace(/<\\/b>/gi,'**')
      .replace(/<em[^>]*>/gi,'*').replace(/<\\/em>/gi,'*')
      .replace(/<i[^>]*>/gi,'*').replace(/<\\/i>/gi,'*')
      .replace(/<br\\s*\\/?>/gi,'\\n').replace(/<[^>]+>/g,'');
    var t=document.createElement('textarea'); t.innerHTML=h;
    return t.value.replace(/\\u00a0/g,' ').replace(/\\n{2,}/g,'\\n').trim();
  }
  function editable(el,commit,sel){
    el.setAttribute('contenteditable','true'); el.classList.add('sm-editable');
    el.addEventListener('focus',sel);
    el.addEventListener('mousedown',function(e){e.stopPropagation();});
    el.addEventListener('keydown',function(e){e.stopPropagation();});
    el.addEventListener('blur',commit);
  }
  function wire(blk){
    var bid=blk.getAttribute('data-bid');
    var type=(blk.className.match(/blk\\s+(\\w+)/)||[])[1]||'';
    var sel=function(){post({type:'sm-select',bid:bid,btype:type});};
    blk.addEventListener('click',sel);
    if(blk.matches('h1,h2,h3')||blk.classList.contains('p')){
      editable(blk,function(){post({type:'sm-edit',bid:bid,field:'text',value:toMd(blk)});},sel);
    } else if(blk.classList.contains('list')){
      blk.querySelectorAll('li').forEach(function(li){
        editable(li,function(){
          var items=[].map.call(blk.querySelectorAll('li'),function(x){return toMd(x);}).filter(function(s){return s.length;});
          post({type:'sm-edit',bid:bid,field:'items',value:items});
        },sel);
      });
    } else if(blk.classList.contains('quote')){
      var p=blk.querySelector('p'); if(p) editable(p,function(){post({type:'sm-edit',bid:bid,field:'text',value:toMd(p)});},sel);
      var c=blk.querySelector('cite'); if(c) editable(c,function(){post({type:'sm-edit',bid:bid,field:'cite',value:toMd(c)});},sel);
    } else if(blk.classList.contains('fig')){
      var cap=blk.querySelector('figcaption'); if(cap) editable(cap,function(){post({type:'sm-edit',bid:bid,field:'alt',value:toMd(cap)});},sel);
    }
  }
  window.addEventListener('message',function(e){
    var d=e.data; if(!d||typeof d!=='object') return;
    if(d.type==='sm-goto' && typeof d.idx==='number'){ try{ if(window.__SM_GO__) window.__SM_GO__(d.idx); }catch(x){} }
  });
  function init(){
    document.querySelectorAll('.sm-deck [data-bid]').forEach(wire);
    var st=document.createElement('style');
    st.textContent='.sm-editable{outline:1px dashed rgba(120,120,120,.45);outline-offset:3px;cursor:text;border-radius:2px}'
      +'.sm-editable:hover{outline-color:rgba(181,64,42,.7)}'
      +'.sm-editable:focus{outline:2px solid #B5402A;background:rgba(181,64,42,.06)}'
      +'.sm-topbar,.sm-sidebar,.sm-nav{display:none!important}'
      +'.sm-stage{top:0!important;left:0!important;padding:14px!important}';
    document.head.appendChild(st);
    try{window.dispatchEvent(new Event('resize'));}catch(e){}
    post({type:'sm-ready'});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
`;

const EXAMPLE: Deck = {
  ir_version: '1.0',
  theme: 'keynote-dark',
  metadata: { title: '示例演示', author: 'Slidesmith' },
  defaults: { layout: 'bullets' },
  slides: [
    { id: 's1', layout: 'cover', notes: '开场用一句话点题。',
      slots: { main: [
        { id: 'b1', type: 'text', text: 'SLIDESMITH STUDIO', style: { color: 'accent', size: 'small', weight: 'bold' } },
        { id: 'b2', type: 'heading', text: '点文字就能改', level: 1, style: { size: 'display' } },
        { id: 'b3', type: 'text', text: '像 Keynote 一样编辑，导出可投屏 HTML', style: { color: 'muted' } },
      ] } },
    { id: 's2', layout: 'bullets', seg: '1', segName: '段1 · 怎么用',
      slots: { main: [
        { id: 'b4', type: 'heading', text: '三步走', level: 2 },
        { id: 'b5', type: 'list', items: ['导入 HTML deck', '点文字直接改、右侧换主题', '保存 / 导出 PDF 投屏'],
          build: { anim: 'stagger-list', mode: 'by-item', stagger: 90 } },
      ] } },
    { id: 's3', layout: 'quote', seg: '2', segName: '段2 · 收尾',
      slots: { main: [{ id: 'b6', type: 'quote', text: '让 AI 生成，让人类精修。', cite: 'Slidesmith' }] } },
  ],
};

const meta = {
  themes: listThemes(),
  layouts: Object.keys(LAYOUTS),
  layoutSlots: LAYOUTS as Record<string, readonly string[]>,
  anims: ANIM_NAMES as readonly string[],
  animOuts: ANIM_OUT_NAMES as readonly string[],
  motions: MOTION_NAMES as readonly string[],
  emphs: EMPH_NAMES as readonly string[],
  colors: COLOR_TOKENS as readonly string[],
  sizes: SIZE_TOKENS as readonly string[],
  aligns: ALIGN_TOKENS as readonly string[],
  weights: WEIGHT_TOKENS as readonly string[],
};

// friendly Chinese labels for the inspector
const MOTION_LABEL: Record<string, string> = {
  none: '无', glow: '呼吸灯（发光）', breathe: '呼吸（缩放）', float: '漂浮', pulse: '闪烁', neon: '霓虹微闪', stress: '强调脉冲', shimmer: '流光溢彩', 'ken-burns': '缓慢推拉',
};
const ANIM_LABEL: Record<string, string> = {
  none: '无', fade: '淡入', rise: '上升淡入', 'fade-up': '上移淡入', pop: '弹出', 'in-left': '从左进', 'in-right': '从右进', 'stagger-list': '逐条浮现', 'counter-up': '数字滚动', morph: '形变',
  'tracking-in': '字距展开', 'focus-in': '聚焦显影', 'slide-blur': '模糊滑入', 'flip-in': '翻牌入场', 'back-in': '纵深拉入', 'num-pop': '数字弹入', 'texts-reveal': '多行浮现', 'clip-wipe': '裁切揭示',
};
const EMPH_LABEL: Record<string, string> = {
  none: '无', tada: '嗒哒', 'rubber-band': '橡皮筋', jello: '果冻', heartbeat: '心跳', headshake: '摇头', shake: '抖动', 'text-pop': '抬字',
};
const ANIM_OUT_LABEL: Record<string, string> = {
  none: '无', 'fade-out': '淡出', sink: '下沉淡出', 'zoom-out': '缩小淡出', 'out-left': '向左退出', 'out-right': '向右退出',
};

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

// ---------------- rendering ----------------
function previewHtml(): string {
  return insertBeforeBodyEnd(renderDeckHtml(deck), `<script>${BRIDGE}</script>`);
}
function reloadPreview(): void {
  ($('#preview') as HTMLIFrameElement).srcdoc = previewHtml();
}
function gotoPreview(i: number): void {
  const w = ($('#preview') as HTMLIFrameElement).contentWindow;
  try { w?.postMessage({ type: 'sm-goto', idx: i }, '*'); } catch { /* noop */ }
}

function esc(t: string): string { return (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function clip(t: string): string { t = (t || '').replace(/\s+/g, ' ').trim(); return t.length > 22 ? t.slice(0, 21) + '…' : t; }

function slideTitle(s: Slide): string {
  const all: Block[] = [];
  for (const k of Object.keys(s.slots)) all.push(...(s.slots[k] as Block[]));
  for (const b of all) if (b.type === 'heading') return b.text;
  for (const b of all) if (b.type === 'quote') return clip(b.text);
  for (const b of all) if (b.type === 'text') return clip(b.text);
  return s.id;
}

function renderLeft(): void {
  const box = $('#slides'); box.innerHTML = '';
  if (mode === 'html') {
    htmlSlides.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'srow' + (i === cur ? ' active' : '');
      const seg = s.seg && s.seg !== '0' ? `<span class="sseg">${esc(s.seg)}</span>` : '';
      const badge = aiApplied.has(s.id) ? '<span class="sbadge done" title="AI 已修改本页">✓</span>'
        : aiSent.has(s.id) ? '<span class="sbadge sent" title="已发送，等待 Claude 修改">●</span>'
        : aiInstructions[s.id] ? '<span class="sbadge todo" title="有待发送给 AI 的修改说明">●</span>' : '';
      row.innerHTML = `<span class="snum">${i + 1}</span>${seg}<span class="stt">${esc(s.title)}</span>${badge}`;
      row.addEventListener('click', () => selectHtmlSlide(i));
      box.appendChild(row);
    });
    return;
  }
  deck.slides.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'srow' + (i === cur ? ' active' : '');
    row.innerHTML = `<span class="snum">${i + 1}</span><span class="stt">${esc(slideTitle(s))}</span>`;
    row.addEventListener('click', () => selectSlide(i));
    box.appendChild(row);
  });
}

function selectSlide(i: number): void {
  cur = Math.max(0, Math.min(deck.slides.length - 1, i));
  [].forEach.call(document.querySelectorAll('.srow'), (r: Element, idx: number) => r.classList.toggle('active', idx === cur));
  selBid = null; clearSel(); gotoPreview(cur); refreshSlidePanel(); renderDoc();
}

// ---- 左栏「换装」：21 套皮做成可视化卡片，点一下整份 deck 换风格（就地换肤，瞬时、不黑） ----
function matchCssVar(css: string, nm: string): string {
  const m = new RegExp('--' + nm + '\\s*:\\s*([^;]+);').exec(css); return m ? m[1].trim() : '';
}
// 取第一个能解析成「具体颜色」的变量——跟随 var(--x) 跳转（皮肤常 --accent: var(--vermilion)）
function pickCssVar(css: string, names: string[]): string {
  for (const nm of names) {
    let v = matchCssVar(css, nm); let hops = 0; let ref: RegExpExecArray | null;
    while (v && hops < 4 && (ref = /^var\(\s*--([a-z0-9-]+)\s*\)/i.exec(v))) { v = matchCssVar(css, ref[1]); hops++; }
    if (v && !/^var\(/i.test(v)) return v;
  }
  return '';
}
function skinSwatch(b: { css: string; dark: boolean }): { bg: string; ink: string; accent: string } {
  const css = b.css || '';
  return {
    bg: pickCssVar(css, ['paper', 'bg', 'background', 'base', 'surface']) || (b.dark ? '#16181e' : '#ffffff'),
    ink: pickCssVar(css, ['ink', 'text', 'fg', 'ink-1', 'foreground']) || (b.dark ? '#f5f6f8' : '#1c1c1f'),
    accent: pickCssVar(css, ['accent', 'accent-ui', 'vermilion', 'gold', 'navy', 'green', 'accent-2', 'primary']) || '#B5402A',
  };
}
function skinCardHtml(name: string, label: string, tag: string, sw: { bg: string; ink: string; accent: string }, active: boolean): string {
  return `<button class="skincard${active ? ' on' : ''}" data-skin="${esc(name)}" title="${esc(label)}">`
    + `<span class="skinprev" style="background:${sw.bg}">`
    + `<span class="skinline" style="background:${sw.ink}"></span>`
    + `<span class="skinline short" style="background:${sw.ink}"></span>`
    + `<span class="skinbar" style="background:${sw.accent}"></span></span>`
    + `<span class="skinmeta"><span class="skinname">${esc(label)}</span><span class="skintag">${esc(tag)}</span></span></button>`;
}
function renderSkinGallery(): void {
  const box = document.getElementById('skinGallery'); if (!box) return;
  if (mode !== 'html') { box.innerHTML = '<div class="lpane-soon">换装作用于导入的 HTML deck。<br>先导入一个 HTML，再来这里一键换风格。</div>'; return; }
  let html = skinCardHtml('', '保持原样', '原始', { bg: '#ffffff', ink: '#1c1c1f', accent: '#c9c9cc' }, !H.skin);
  SKIN_ORDER.forEach((n) => { const b = SKINS[n]; if (b) html += skinCardHtml(n, b.label || n, b.dark ? '暗' : '浅', skinSwatch(b), H.skin === n); });
  box.innerHTML = '<div class="skingal">' + html + '</div>';
  box.querySelectorAll('.skincard').forEach((el) => el.addEventListener('click', () => applySkinFromGallery((el as HTMLElement).dataset.skin || '')));
}
function applySkinFromGallery(n: string): void {
  if (mode !== 'html' || n === H.skin) return;
  const tf = tweakFactor('--t-body'), pf = tweakFactor('--pad-x'); // 旧皮基准下的当前缩放比例
  harvestAll(); pushHistory('skin'); H.skin = n; applySkinLive();
  reapplyTweaksForSkin(tf, pf); // 按新皮基准重算字号/留白，保持比例
  refreshHtmlInspector(); markDirty();
  const sel = $('#hSkin') as HTMLSelectElement | null; if (sel) sel.value = n;
  renderSkinGallery();
  toast(n ? '已换装：' + (SKINS[n] ? SKINS[n].label || n : n) : '已恢复原始皮肤');
}
// ---- 左栏「插入」：HTML 模式下真正可用的添加动作收成一个中枢 ----
function renderInsertPane(): void {
  const box = document.getElementById('insertPane'); if (!box) return;
  if (mode !== 'html') { box.innerHTML = '<div class="lpane-soon">插入作用于导入的 HTML deck。<br>先导入一个 HTML 再用。</div>'; return; }
  box.innerHTML = '<div class="insgrid">'
    + '<button class="inscard" data-act="image"><b>插入图片</b><span>从本地选图，插入到当前页</span></button>'
    + '<button class="inscard" data-act="ai"><b>AI 配图 / 图表</b><span>转到右栏「AI」，描述要生成的配图或图表</span></button>'
    + '</div><div class="lpane-soon" style="text-align:left;padding:10px 4px">更多插入项（新页 / 引用 / 表格）会随 HTML 模式增删页能力一起补上。</div>';
  box.querySelectorAll('.inscard').forEach((el) => el.addEventListener('click', () => {
    const act = (el as HTMLElement).dataset.act;
    if (act === 'image') (document.getElementById('hInsertImg') as HTMLElement | null)?.click();
    else if (act === 'ai') (document.querySelector('.htab[data-htab="ai"]') as HTMLElement | null)?.click();
  }));
}

function refreshSlidePanel(): void {
  const s = deck.slides[cur]; const keys = Object.keys(s.slots);
  const lay = $('#layout') as HTMLSelectElement; lay.innerHTML = '';
  meta.layouts.forEach((L) => {
    const contract = meta.layoutSlots[L] || [];
    if (keys.every((k) => contract.indexOf(k) >= 0)) {
      const o = document.createElement('option'); o.value = L; o.textContent = L; lay.appendChild(o);
    }
  });
  lay.value = s.layout || 'bullets';
}

function findBlock(bid: string): Block | null {
  for (const sl of deck.slides) for (const k of Object.keys(sl.slots)) {
    for (const b of sl.slots[k] as Block[]) {
      if (b.id === bid) return b;
      if (b.type === 'group') for (const c of b.children as Block[]) if (c.id === bid) return c;
    }
  }
  return null;
}

function uid(prefix: string): string {
  const ids: Record<string, 1> = {};
  deck.slides.forEach((s) => { ids[s.id] = 1; for (const k of Object.keys(s.slots)) (s.slots[k] as Block[]).forEach((b) => { ids[b.id] = 1; (b as { children?: Block[] }).children?.forEach((c) => (ids[c.id] = 1)); }); });
  let n = 1; while (ids[prefix + n]) n++; return prefix + n;
}

// ---------------- edits ----------------
function applyEdit(bid: string, field: string, value: unknown): void {
  const b = findBlock(bid) as Record<string, unknown> | null; if (!b) return;
  if (field === 'items') { if (Array.isArray(value) && value.length) b.items = value; }
  else b[field] = value;
  renderLeft();
}
// locate a top-level block of the CURRENT slide (for element ops)
function locateBlock(bid: string): { slotKey: string; arr: Block[]; index: number } | null {
  const s = deck.slides[cur];
  for (const slotKey of Object.keys(s.slots)) {
    const arr = s.slots[slotKey] as Block[];
    const index = arr.findIndex((b) => b.id === bid);
    if (index >= 0) return { slotKey, arr, index };
  }
  return null;
}

function showBlock(bid: string, btype: string): void {
  const b = findBlock(bid); if (!b) return;
  document.querySelectorAll('.needsel').forEach((el) => ((el as HTMLElement).style.display = ''));
  document.querySelectorAll('.nosel').forEach((el) => ((el as HTMLElement).style.display = 'none'));
  $('#blktype').textContent = btype || b.type;
  const st = (b.style ?? {}) as Record<string, string>;
  setVal('#fsize', st.size || ''); setVal('#fcolor', st.color || ''); setVal('#fweight', st.weight || ''); setVal('#falign', st.align || '');
  setVal('#anim', (b.build && b.build.anim) || 'none');
  setVal('#motion', (b.build && b.build.motion) || 'none');
  const loc = locateBlock(bid);
  ($('#elUp') as HTMLButtonElement).disabled = !loc || loc.index === 0;
  ($('#elDown') as HTMLButtonElement).disabled = !loc || (loc && loc.index === loc.arr.length - 1);
}
function setVal(sel: string, v: string): void { const el = $(sel) as HTMLSelectElement; if (el) el.value = v; }

function setStyle(prop: string, val: string): void {
  if (!selBid) return; const b = findBlock(selBid) as { style?: Record<string, string> } | null; if (!b) return;
  const style = Object.assign({}, b.style);
  if (val) style[prop] = val; else delete style[prop];
  if (Object.keys(style).length) b.style = style; else delete b.style;
  reloadPreview();
}
function setAnim(val: string): void { setBuild('anim', val); }
function setMotion(val: string): void { setBuild('motion', val === 'none' ? undefined : val); }
function setBuild(prop: string, val: string | undefined): void {
  if (!selBid) return; const b = findBlock(selBid) as { build?: Record<string, unknown> } | null; if (!b) return;
  const build = Object.assign({}, b.build) as Record<string, unknown>;
  if (val == null) delete build[prop]; else build[prop] = val;
  if (Object.keys(build).length) b.build = build; else delete b.build;
  reloadPreview();
}

// ---- element ops (delete / move / add within the current slide) ----
function delElement(): void {
  if (!selBid) return; const loc = locateBlock(selBid); if (!loc) return;
  loc.arr.splice(loc.index, 1);
  if (!loc.arr.length && Object.keys(deck.slides[cur].slots).length > 1) delete deck.slides[cur].slots[loc.slotKey];
  selBid = null; clearSel(); reloadPreview();
}
function moveElement(dir: number): void {
  if (!selBid) return; const loc = locateBlock(selBid); if (!loc) return;
  const j = loc.index + dir; if (j < 0 || j >= loc.arr.length) return;
  const t = loc.arr[loc.index]; loc.arr[loc.index] = loc.arr[j]; loc.arr[j] = t;
  reloadPreview();
}
function addElement(make: () => Block): void {
  const s = deck.slides[cur];
  // target slot = selected block's slot, else the busiest slot, else first
  let slotKey = selBid ? locateBlock(selBid)?.slotKey : undefined;
  if (!slotKey) { const keys = Object.keys(s.slots); slotKey = keys.sort((a, b) => (s.slots[b] as Block[]).length - (s.slots[a] as Block[]).length)[0] || keys[0]; }
  const blk = make(); (blk as { id: string }).id = uid('b');
  (s.slots[slotKey] as Block[]).push(blk);
  reloadPreview();
}
function clearSel(): void {
  document.querySelectorAll('.needsel').forEach((el) => ((el as HTMLElement).style.display = 'none'));
  document.querySelectorAll('.nosel').forEach((el) => ((el as HTMLElement).style.display = ''));
}

// ---- 文稿 (notes + cue/golden/data) ----
function renderDoc(): void {
  const s = deck.slides[cur];
  ($('#notes') as HTMLTextAreaElement).value = s.notes || '';
  const box = $('#noteblocks'); box.innerHTML = '';
  (s.noteBlocks ?? []).forEach((nb, i) => {
    const row = document.createElement('div'); row.className = 'nbrow';
    row.innerHTML = `<span class="nbtag nb-${nb.kind}">${nb.kind === 'cue' ? '讲法' : nb.kind === 'golden' ? '金句' : '数据'}</span>`;
    const inp = document.createElement('input'); inp.value = nb.text;
    inp.addEventListener('input', () => { (s.noteBlocks as NoteBlock[])[i].text = inp.value; });
    const del = document.createElement('button'); del.textContent = '✕'; del.title = '删除';
    del.addEventListener('click', () => { (s.noteBlocks as NoteBlock[]).splice(i, 1); renderDoc(); });
    row.appendChild(inp); row.appendChild(del); box.appendChild(row);
  });
}
function addNoteBlock(kind: string): void {
  const s = deck.slides[cur];
  if (!s.noteBlocks) s.noteBlocks = [];
  (s.noteBlocks as NoteBlock[]).push({ kind: kind as NoteBlock['kind'], text: '' });
  renderDoc();
}

function addSlide(): void {
  const s: Slide = { id: uid('s'), layout: 'bullets', slots: { main: [{ id: uid('b'), type: 'heading', text: '新页面', level: 2 }] } };
  deck.slides.splice(cur + 1, 0, s); cur += 1; renderLeft(); reloadPreview();
}
function delSlide(): void {
  if (deck.slides.length <= 1) return;
  deck.slides.splice(cur, 1); if (cur >= deck.slides.length) cur = deck.slides.length - 1;
  renderLeft(); reloadPreview(); selectSlide(cur);
}
function moveSlide(dir: number): void {
  const j = cur + dir; if (j < 0 || j >= deck.slides.length) return;
  const t = deck.slides[cur]; deck.slides[cur] = deck.slides[j]; deck.slides[j] = t;
  cur = j; renderLeft(); reloadPreview(); selectSlide(cur);
}

// ---------------- import / export ----------------
function download(name: string, content: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// 保存 HTML — write the current deck back to the file the user opened, overwriting it
// in place. Reuses the captured handle for a silent one-click overwrite; if there is no
// handle (deck came from the bridge, or first save) it asks the user to pick the file
// once and remembers it; browsers without the File System Access API get a download.
async function saveHtmlInPlace(): Promise<void> {
  const html = mode === 'html' ? await buildExportHtml() : renderDeckHtml(deck);
  // 0) 连着桥就让桥写回原文件。
  //
  // **这一条以前没有，后果是 app 里的「保存」从来没真正保存过。** 下面那两条走的都是
  // 浏览器的 File System Access API（`fileHandle` / `showSaveFilePicker`），而
  // WKWebView 两个都没有，于是一路落到最后的「下载副本」——在 WKWebView 里那等于
  // 什么都没发生，还会把 WebView 导航去 blob URL，表现是「左右栏突然没了」，
  // 而用户以为自己已经存好了。
  // inPlace=1：写不回原文件就明确失败，绝不悄悄在别处新建一份。
  if (location.protocol.startsWith('http')) {
    try {
      const r = await fetch(
        `${libBase()}/api/export-html?inPlace=1&reveal=0&name=${encodeURIComponent(fileBase)}.html`,
        { method: 'POST', headers: { 'content-type': 'text/html;charset=utf-8' }, body: html });
      const j = await r.json() as { ok: boolean; path?: string; error?: string };
      if (j.ok && j.path) {
        toast('已保存：' + j.path);
        clearDraft(); syncExportToBridge();   // 桥里那份也换成新的，否则 ⌘R 会把改动"退回去"
        return;
      }
      // 桥不知道这份 deck 在磁盘的哪儿（导入 HTML 进来的，网页拿不到路径）。
      // **这时候绝不能悄悄往下走「下载副本」**——在 app 的 WebView 里那等于什么都
      // 没发生，用户以为存好了，其实一个字节没写。退一步存成一份真文件，并且
      // 明确告诉他存到哪了、这不是覆盖原文件。
      if (j.error === 'no-path' && !(window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker) {
        const r2 = await fetch(
          `${libBase()}/api/export-html?name=${encodeURIComponent(fileBase)}.html`,
          { method: 'POST', headers: { 'content-type': 'text/html;charset=utf-8' }, body: html });
        const j2 = await r2.json() as { ok: boolean; path?: string };
        if (j2.ok && j2.path) {
          clearDraft(); syncExportToBridge();
          toast('⚠️ 没能覆盖原文件（这份 deck 是导入进来的，拿不到它的路径），'
              + '已另存到：' + j2.path + ' —— 想一键覆盖，请用「打开」重新打开这份文件。', true);
          return;
        }
      }
    } catch { /* 桥没应答 → 往下走浏览器那套 */ }
  }
  // 1) reuse a known handle → silent overwrite
  if (fileHandle) {
    try {
      const w = await fileHandle.createWritable();
      await w.write(html); await w.close();
      toast('已保存：' + (fileHandle.name || fileBase + '.html'));
      clearDraft(); syncExportToBridge();
      return;
    } catch { /* permission lost / file moved → fall through to picker */ fileHandle = null; }
  }
  // 2) no handle → let the user pick the file to overwrite, then remember it
  const w = window as unknown as { showSaveFilePicker?: (o?: unknown) => Promise<FsFileHandle> };
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({
        suggestedName: fileBase + '.html',
        types: [{ description: 'HTML deck', accept: { 'text/html': ['.html', '.htm'] } }],
      });
      const ws = await h.createWritable();
      await ws.write(html); await ws.close();
      fileHandle = h;
      toast('已保存：' + (h.name || fileBase + '.html'));
      clearDraft(); syncExportToBridge();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user cancelled the dialog
      /* fall through to download */
    }
  }
  // 3) 都不行了才下载副本。
  // **在 app 的 WebView 里这条是死路**（没有下载能力，还会把页面导航去 blob URL，
  // 表现是「左右栏突然没了」），所以宁可明说失败，也不要假装存好了。
  if (location.protocol.startsWith('http')) {
    toast('❌ 没能保存：桥不知道这份 deck 的文件位置，而这个环境也不支持「另存为」对话框。'
        + '请用「打开」重新打开这份文件，再按保存。', true);
    return;
  }
  download(fileBase + '.html', html, 'text/html');
  toast('当前浏览器不支持原地覆盖，已下载副本', true);
}

// route an imported file by type: contract HTML deck → html mode; json/md → IR mode
/** 这一次导入是桥推下来的吗（是的话就别再回声给桥） */
let importedFromBridge = false;
function importFile(name: string, text: string): void {
  cueMap = null; cueLoaded = false;   // 换了 deck，提词缓存作废
  notesDoc = null; notesLoaded = false; notesUndo = null; noteAnns = []; notePick = null;  // 讲稿同理
  fileHandle = null; // a new deck arrived → drop any stale writable handle; open-picker/drop re-set it after
  if (/\.html?$/i.test(name) || /^\s*<(!doctype|html|section|div|body)/i.test(text)) loadHtmlDeck(name, text);
  else loadDeck(name, text);
}

function loadDeck(name: string, text: string): void {
  fileBase = name.replace(/\.deck\.(md|json)$/i, '').replace(/\.(md|json)$/i, '') || 'deck';
  let ir: unknown;
  try {
    ir = /\.json$/i.test(name) || text.trim().startsWith('{') ? JSON.parse(text) : parseMarkdownToIR(text);
  } catch (e) { toast('解析失败: ' + (e as Error).message, true); return; }
  const res = validateDeck(ir);
  if (!res.ok) { toast('校验失败: ' + res.errors[0].path + ' ' + res.errors[0].message, true); return; }
  deck = res.ir; cur = 0; selBid = null; mode = 'ir';
  ($('#theme') as HTMLSelectElement).value = deck.theme || 'editorial';
  clearSel(); setHtmlMode(false);
  $('#deckname').textContent = fileBase;
  renderLeft(); refreshSlidePanel(); renderDoc(); reloadPreview();
  toast('已导入 ' + fileBase + '（' + deck.slides.length + ' 页）');
}

// ======================= v2: contract HTML deck (HTML itself = truth) =======================
function deriveHtmlTitle(sec: Element, i: number): string {
  const dt = sec.getAttribute('data-title'); if (dt) return dt;
  const el = sec.querySelector('.cover__title,.secdiv__title,.manifesto__title,.insight__statement,.head__title,.title,h1,h2,h3');
  const t = el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return t || 'slide ' + (i + 1);
}
function nodeToHtml(n: Node): string {
  if (n.nodeType === 1) return (n as Element).outerHTML;
  if (n.nodeType === 3) return n.textContent || '';
  if (n.nodeType === 8) return '<!--' + (n as Comment).data + '-->';
  return '';
}
function attrsString(el: Element): string {
  return Array.from(el.attributes).map((a) => (a.value ? `${a.name}="${a.value.replace(/"/g, '&quot;')}"` : a.name)).join(' ');
}
function toHex(v: string): string {
  v = (v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
  const m = v.match(/rgba?\(([^)]+)\)/i);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return '#' + p.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join(''); }
  return '';
}
function parseTokens(head: string): { base: Record<string, string>; themes: string[] } {
  const base: Record<string, string> = {};
  const m = head.match(/:root\s*\{([^}]*)\}/);
  if (m) m[1].split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) { const k = d.slice(0, i).trim(); if (k.startsWith('--')) base[k] = d.slice(i + 1).trim(); } });
  const themes: string[] = []; const re = /:root\[data-theme=["']?([^"'\]]+)["']?\]/g; let t;
  while ((t = re.exec(head))) if (themes.indexOf(t[1]) < 0) themes.push(t[1]);
  return { base, themes };
}

function loadHtmlDeck(name: string, html: string): void {
  fileBase = name.replace(/\.html?$/i, '') || 'deck';
  let doc: Document;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); }
  catch (e) { toast('HTML 解析失败: ' + (e as Error).message, true); return; }
  const deckEl = doc.querySelector('#deck') || doc.querySelector('.deck');
  const secs = deckEl ? Array.from(deckEl.querySelectorAll(':scope > .slide')) : Array.from(doc.querySelectorAll('section.slide, .slide'));
  if (!secs.length) { toast('未识别到 .slide 结构（需符合 Deck 契约：每页 <section class="slide">）', true); return; }

  // split body into prelude (before #deck) + trailing (after #deck) so export re-emits a clean deck
  let prelude = '', trailing = '';
  if (deckEl) { let seen = false; Array.from(doc.body.childNodes).forEach((n) => { if (n === deckEl) { seen = true; return; } (seen ? (trailing += nodeToHtml(n)) : (prelude += nodeToHtml(n))); }); }
  const mapM = html.match(/window\.SLIDE_MAP\s*=\s*(\[[^\]]*\])/);
  let slideMap: string[] | null = null; if (mapM) { try { slideMap = JSON.parse(mapM[1]); } catch { slideMap = null; } }
  // recover the FX play mode if this deck was exported by us before (else default auto)
  fxMode = /<html[^>]*\bdata-smfx=["']?manual/i.test(html) ? 'manual' : 'auto';
  const { base, themes } = parseTokens(doc.head.innerHTML);

  htmlSlides = secs.map((s, i) => {
    const id = s.getAttribute('data-id') || (slideMap && slideMap[i]) || 's' + (i + 1);
    s.setAttribute('data-id', id); // stable addressing key for Submit-to-AI patches
    return {
      id,
      title: deriveHtmlTitle(s, i),
      seg: s.getAttribute('data-seg') || '0',
      segName: s.getAttribute('data-segname') || '',
      variant: (s.getAttribute('class') || '').replace(/\bslide\b/, '').trim(),
      html: s.outerHTML,
    };
  });
  // recover any token overrides we previously baked as inline <html> style, then
  // strip that attr so it isn't duplicated (htmlOpenTag re-emits from H.overrides)
  const overrides: Record<string, string> = {};
  (doc.documentElement.getAttribute('style') || '').split(';').forEach((d) => {
    const i = d.indexOf(':'); if (i > 0) { const k = d.slice(0, i).trim(); if (k.startsWith('--')) overrides[k] = d.slice(i + 1).trim(); }
  });
  doc.documentElement.removeAttribute('style');

  // recover a baked-in skin (our injected <style id="sm-skin" data-skin>) and strip it + its font
  // link, so assembleDeck re-injects cleanly (no accumulation across export→import cycles)
  const skinEl = doc.getElementById('sm-skin');
  const detectedSkin = skinEl ? (skinEl.getAttribute('data-skin') || '') : '';
  if (skinEl) skinEl.remove();
  const skinFontEl = doc.getElementById('sm-skin-font'); if (skinFontEl) skinFontEl.remove();

  H.head = doc.head.innerHTML;
  H.htmlAttrs = attrsString(doc.documentElement);
  H.bodyClass = doc.body.getAttribute('class') || '';
  H.prelude = prelude; H.trailing = trailing;
  H.baseTokens = base; H.overrides = overrides; H.themes = themes;
  H.theme = doc.documentElement.getAttribute('data-theme') || '';
  H.skin = (detectedSkin && (SKINS as Record<string, unknown>)[detectedSkin]) ? detectedSkin : '';

  mode = 'html'; cur = 0; selBid = null; htmlSelEl = null;
  $('#deckname').textContent = fileBase;
  Object.keys(aiInstructions).forEach((k) => delete aiInstructions[k]); aiApplied.clear(); aiSent.clear(); Object.keys(aiBefore).forEach((k) => delete aiBefore[k]); proposed.clear(); aiCurId = ''; aiDeckInstruction = ''; usedFontIds.clear();
  trayImages.length = 0; Object.keys(genQueue).forEach((k) => delete genQueue[k]); // a new deck → drop staged images + photo-gen marks (they were deck-specific)
  undoStack = []; redoStack = []; lastPushTag = ''; dirty = false; updateUndoButtons(); updateDirtyBadge();
  const aiBox = $('#aiInstruction') as HTMLTextAreaElement | null; if (aiBox) aiBox.value = '';
  const aiDeckBox = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (aiDeckBox) aiDeckBox.value = '';
  const fxSel = $('#hFxMode') as HTMLSelectElement | null; if (fxSel) fxSel.value = fxMode; // reflect imported deck's play mode
  renderLeft(); setHtmlMode(true); refreshHtmlInspector(); renderHtmlEdit(); renderTray(); renderTodo();
  // **自己开的 deck 要主动报给桥**：否则桥的 `hasDeck` 一直是 false，
  // AI 那边看到的是「Studio 里没打开任何 deck」，而屏幕上明明开着。
  // 从桥推下来的那份不用回声（它本来就知道）。
  if (!importedFromBridge) setTimeout(syncExportToBridge, 400);
  toast('已导入 HTML deck：' + fileBase + '（' + htmlSlides.length + ' 页 · ' + new Set(htmlSlides.map((s) => s.seg)).size + ' 段）');
}

// —— the editing surface: render ONE slide cleanly (deck head styles, no deck engine) ——
// Token overrides ride as an INLINE style on <html> — highest specificity, so they
// beat any `:root[data-theme=…]` rule in the deck (a plain :root block would lose).
function overridesInline(): string {
  return Object.keys(H.overrides).map((k) => `${k}:${H.overrides[k]}`).join(';');
}
function htmlOpenTag(): string {
  let a = H.htmlAttrs;
  if (H.theme) a = /data-theme=/.test(a) ? a.replace(/data-theme=("[^"]*"|'[^']*'|\S+)/, `data-theme="${H.theme}"`) : a + ` data-theme="${H.theme}"`;
  const ov = overridesInline();
  if (ov) a += ` style="${ov}"`;
  return a;
}
// Render the FULL deck (head + prelude + #deck{all slides} + trailing engine) so it
// looks exactly as designed — correct 16:9 AND the deck's OWN segnav + thumbnail nav.
// Editing is layered on top of the live (same-origin) DOM; no aspect/nav loss.
// editorial-slides 换皮：把选中皮的 bundle 作为一层 <style> 叠加在 deck 自身 CSS 之后（后者被覆盖），
// 同时按需带上该皮的 web 字体 <link>。导出时一并烘焙，再导入时由 loadHtmlDeck 识别 data-skin 还原。
function skinInject(): { style: string; font: string } {
  const b = H.skin && (SKINS as Record<string, { css: string; font: string }>)[H.skin];
  if (!b) return { style: '', font: '' };
  const font = b.font ? `<link id="sm-skin-font" rel="stylesheet" href="${b.font}">` : '';
  return { style: `<style id="sm-skin" data-skin="${H.skin}">${b.css}</style>`, font };
}
// 换肤就地生效：只替换活预览里的 <style id="sm-skin">（+皮肤字体 <link>），不重建整个 iframe。
// 全量 renderHtmlEdit() 会用 srcdoc 重灌全部幻灯片——大 deck 又慢、又会触发缩放 slide 的合成层
// 发黑。就地换皮则瞬时、无重渲染、不发黑。H.skin 已更新，导出/全量渲染时仍由 skinInject 一致烘焙。
function applySkinLive(): void {
  const ifr = $('#preview') as HTMLIFrameElement;
  const d = ifr && ifr.contentDocument;
  if (!d || !d.head || !d.querySelector('#deck .slide')) { renderHtmlEdit(); return; } // 预览没就绪 → 回退全量
  const anchor = d.getElementById('sm-typo'); // 皮肤 CSS 排在 deck 自身 CSS 之后、typo/FX 之前（与 assembleDeck 一致）
  const b = H.skin && (SKINS as Record<string, { css: string; font: string }>)[H.skin];
  let st = d.getElementById('sm-skin') as HTMLStyleElement | null;
  let fl = d.getElementById('sm-skin-font') as HTMLLinkElement | null;
  if (b) {
    if (!st) { st = d.createElement('style'); st.id = 'sm-skin'; if (anchor) d.head.insertBefore(st, anchor); else d.head.appendChild(st); }
    st.setAttribute('data-skin', H.skin); st.textContent = b.css;
    if (b.font) { if (!fl) { fl = d.createElement('link'); fl.id = 'sm-skin-font'; fl.rel = 'stylesheet'; fl.media = 'print'; fl.onload = function () { (this as HTMLLinkElement).media = 'all'; }; st.parentNode!.insertBefore(fl, st); } fl.href = b.font; }
    else if (fl) { fl.remove(); }
  } else {
    if (st) st.remove();
    if (fl) fl.remove();
  }
}
// 把 render-blocking 的外链字体 <link rel=stylesheet href=fonts.googleapis.com/css…> 改成非阻塞：
// 加 media="print" onload="this.media='all'" —— 浏览器照常后台拉，但不卡屏渲染。没翻墙拉不到时
// 就一直用系统字体兜底，绝不发黑/卡死；拉到了再切回。preconnect/已带 media 的不动。
function nonBlockFonts(html: string): string {
  return html.replace(/<link\b[^>]*fonts\.googleapis\.com\/css[^>]*>/gi, (tag) => {
    if (/\bmedia\s*=/.test(tag)) return tag;
    if (!/\brel\s*=\s*["']?\s*stylesheet/i.test(tag)) return tag;
    return tag.replace(/\s*\/?>\s*$/, ` media="print" onload="this.media='all'">`);
  });
}
// 在**文档真正的**结束标签前插入内容。
//
// 千万别用 String.replace('</body>', …)：那只换首次匹配。一体版 deck 会把整份副屏
// HTML 当字符串存在 JS 里（`window.SM_PRESENTER_HTML = '<!doctype html>…</body></html>'`），
// 那串里就有 </body>，首次匹配会命中**字符串内部**，把脚本拦腰截断。
// 实测后果：dogfood deck 导出后整段脚本报 "Invalid or unexpected token"，
// SM_NOTES / SM_PRESENTER_HTML 全变 undefined → 演讲者模式打开是空的。
//
// 结构决定判据：内嵌的 HTML 字符串一定在 body 里，所以
//   · 文档真正的 </body> 是**最后**一个
//   · 文档真正的 </head> 是 <body 之前的**最后**一个
function insertBeforeBodyEnd(doc: string, s: string): string {
  const i = doc.lastIndexOf('</body>');
  return i < 0 ? doc + s : doc.slice(0, i) + s + doc.slice(i);
}
function insertBeforeHeadEnd(doc: string, s: string): string {
  const bodyAt = doc.search(/<body\b/i);
  const i = doc.lastIndexOf('</head>', bodyAt < 0 ? doc.length : bodyAt);
  return i < 0 ? doc : doc.slice(0, i) + s + doc.slice(i);
}
// 编辑态按键闸门（只注入预览、不进导出件）。
//
// 为什么必须由 Studio 来挡：deck 自带的引擎把空格 / 方向键 / Enter / f o p s / 1-9
// 全占成了翻页与投屏快捷键，而编辑模式下每个文本块都是 contenteditable——用户一打字
// 就翻页、敲个 f 就进全屏。引擎源码已经补了 isTyping 守卫，但**用户手上已经导出的
// deck 还带着老引擎**，改不了那些文件；所以这里在预览里再兜一层。
//
// 手法：document 上的**捕获**监听。捕获永远早于同一节点上的冒泡监听（deck 引擎用的是
// 冒泡），所以不管引擎何时注册都拦得住。只 stopImmediatePropagation、**不** preventDefault
// ——按键照常输入字符、照常移动光标，只是引擎收不到。带 ⌘/Ctrl/Alt 的一律放行，
// 否则会连 Studio 自己的 ⌘S / ⌘Z 一起掐掉。放在 <head> 最前，先于任何 deck 脚本执行。
const EDIT_KEYGUARD_JS = '<script id="sm-edit-keyguard">(function(){'
  + 'function typing(){var a=document.activeElement;'
  + 'return !!(a&&(a.isContentEditable||a.tagName==="INPUT"||a.tagName==="TEXTAREA"||a.tagName==="SELECT"));}'
  + 'document.addEventListener("keydown",function(e){'
  + 'if(e.metaKey||e.ctrlKey||e.altKey)return;'   // ⌘S/⌘Z 等留给 Studio
  + 'if(!typing())return;'                        // 没在打字 → 翻页快捷键照常
  + 'if(e.key==="Escape"){try{document.activeElement.blur();}catch(x){}e.preventDefault();e.stopImmediatePropagation();return;}'
  + 'e.stopImmediatePropagation();'               // 不 preventDefault：字照打、光标照走
  + '},true);'
  + '})();</scr' + 'ipt>\n';
// 一体版 deck 的「演讲者」按钮开副屏用的是 `location.href.split('#')[0] + '#presenter'`
// ——**重开自己**、靠 hash 切成副屏视图。这在 Studio 里会坏掉：预览是 srcdoc iframe，
// 里面的 `location.href` 是 `about:srcdoc`，于是开出来的是 `about:srcdoc#presenter`，
// 一个真正空白的文档 → 症状是「窗口弹出来了，但里面什么都没有」。
// 修法：在预览里包一层 window.open，认出这种自我重开，改成用父窗口给的干净 deck HTML
// 做一个 blob URL 再开。只拦 `about:srcdoc` + 带 hash 这一种，别的（相对路径的
// 三文件版副屏、`window.open('')` + document.write 的打印窗口）一律原样放行。
const PRESENTER_OPEN_FIX_JS = '<script id="sm-presenter-open-fix">(function(){'
  + 'var orig=window.open;'
  + 'window.open=function(url,name,features){'
  + 'var u=url==null?"":String(url);'
  + 'var i=u.indexOf("#");'
  + 'if(u.indexOf("about:srcdoc")===0&&i>=0){'
  + 'var html=null;'
  + 'try{html=window.parent.__SM_PRESENTER_HTML__&&window.parent.__SM_PRESENTER_HTML__();}catch(e){}'
  + 'if(html){try{'
  + 'var b=URL.createObjectURL(new Blob([html],{type:"text/html"}));'
  + 'return orig.call(window,b+u.slice(i),name,features);'
  + '}catch(e){}}'
  + '}'
  + 'return orig.call(window,url,name,features);'
  + '};'
  + '})();</scr' + 'ipt>\n';
/** 预览里要不要显示 deck 自带的段导航。默认不显示，选择记在 localStorage。 */
let deckChromeOn = (() => { try { return localStorage.getItem('sm-deckchrome') === 'on'; } catch { return false; } })();
/**
 * 幻灯片在预览里显示多大，由 deck 自己的 `--fit-scale` 决定，而它的公式是
 * `innerWidth - 300 - 60`——那个 300 是段导航的宽度，**硬编码在 deck 里**。
 * 于是把段导航藏了以后，地方腾出来了，幻灯片却还是老尺寸（白等于没腾）。
 * 这里按同一个公式重算一遍，只把 300 那项按当前开关取舍。
 * 播放态（body.present）归 deck 自己管，别插手。
 */
function refitPreview(): void {
  const ifr = $('#preview') as HTMLIFrameElement | null;
  const w = ifr?.contentWindow, d = ifr?.contentDocument;
  if (!w || !d || !d.documentElement) return;
  if (d.body && d.body.classList.contains('present')) return;
  const availW = w.innerWidth - (deckChromeOn ? 360 : 60);
  const availH = w.innerHeight - 100;
  const scale = Math.max(0.25, Math.min(0.7, availW / 1920, availH / 1080));
  d.documentElement.style.setProperty('--fit-scale', scale.toFixed(4));
}
/** 把选择贴到活预览的 <html> 上——改属性就生效，不用重建预览。 */
function applyDeckChrome(): void {
  const d = ($('#preview') as HTMLIFrameElement | null)?.contentDocument;
  if (d && d.documentElement) d.documentElement.setAttribute('data-sm-deckchrome', deckChromeOn ? 'on' : 'off');
  const b = $('#deckNavTog');
  if (b) { b.classList.toggle('on', deckChromeOn); b.setAttribute('aria-pressed', String(deckChromeOn)); }
  refitPreview();
}
function assembleDeck(forEdit = false): string {
  // 编辑态默认把 deck 自带的段导航（固定 300px + #deck 让出 320px 内边距）藏起来：
  // 左栏那份页面列表做的是同一件事，两套导航并排既占地方又让人不知道该点哪个。
  // 想看缩略图的话顶栏 ▦ 一按就回来——所以这只是默认值，不是砍功能。
  const chromeCss = '<style id="sm-deckchrome-css">'
    + 'html[data-sm-deckchrome="off"] body > #segnav,html[data-sm-deckchrome="off"] body > nav.segnav{display:none!important}'
    + 'html[data-sm-deckchrome="off"] #deck{padding-left:0!important}'
    + 'html[data-sm-deckchrome="off"] body > .hint{display:none!important}'
    // deck 自己的顶栏是按 1920 宽设计的，塞进编辑预览（约 1000 宽）会每个按钮都折行，
    // 看着像坏了。只在编辑预览里收紧间距 + 不许折行——导出的文件一个字节都不动。
    + 'body > .topbar{gap:10px!important;padding:0 14px!important}'
    + 'body > .topbar > *{white-space:nowrap}'
    + 'body > .topbar .topbar__brand,body > .topbar .topbar__sub{min-width:0;overflow:hidden;text-overflow:ellipsis}'
    + '</style>';
  const editCss = forEdit
    ? chromeCss + '<style id="sm-edit-css">[contenteditable]{cursor:text}'
      + '#deck .slide [contenteditable]:hover{outline:1px dashed rgba(120,120,170,.7);outline-offset:2px}'
      + '#deck .slide [contenteditable]:focus{outline:2px solid #B5402A;outline-offset:2px}'
      + '#deck .slide .sm-sel{outline:2px solid #3a86ff!important;outline-offset:2px}</style>'
    : '';
  const deckInner = htmlSlides.map((s) => s.html).join('\n');
  // load any user-picked Google fonts (those not already linked by the deck author)
  const fontLinks = fontLinksFor(deckInner);
  // FX CSS+JS injected into EVERY assembled deck (preview + export) so entrance anims &
  // motion play offline — the imported deck has no such rules of its own. data-smfx on
  // <html> carries the auto/manual choice into the exported file; data-smfx-edit marks
  // the editing surface so the FX driver skips exit-on-nav (keeps Studio nav instant).
  const editAttr = forEdit ? ' data-smfx-edit="1" data-sm-deckchrome="' + (deckChromeOn ? 'on' : 'off') + '"' : '';
  const skin = skinInject();
  const keyGuard = forEdit ? EDIT_KEYGUARD_JS + PRESENTER_OPEN_FIX_JS : '';
  let doc = `<!DOCTYPE html>\n<html ${htmlOpenTag()} data-smfx="${fxMode}"${editAttr}>\n<head>\n${keyGuard}${H.head}${skin.font}${skin.style}${fontLinks}${TYPO_CSS}${NOTES_CSS}${FX_CSS}${PRESENT_FIX_CSS}${editCss}\n</head>\n<body class="${H.bodyClass}">\n${H.prelude}\n<div class="deck" id="deck">\n${deckInner}\n</div>\n${H.trailing}\n${FX_JS}\n${FX_CANVAS_JS}\n</body>\n</html>`;
  // 手机遥控：先剥离任何旧注入（幂等，防 re-import 累积），再按需（仅导出、勾选时）烘进。
  // 注意：注入内容含 `$`（qr 库/客户端里有），必须用「函数替换」——字符串替换会把 $'/$&/$1 当特殊
  // 记号解释，导致注入的 JS 被腐蚀（曾致「二维码生成失败」）。
  //
  // **房间号沿用旧的**（除非用户勾了「换新房间号」）。房间号就是配对凭证，烘死在文件里，
  // 手机扫过一次就记住了。每导出一次就换一个的话，同一份 deck 迭代五版就要重扫五次码——
  // 而且忘了重扫的表现极其难认：手机连的是旧房间，手表照样有内容（老 deck 的兜底提词），
  // 只是**和你刚生成的那套对不上**。真要换号勾一下即可。
  const inheritedRoom = (/window\.__SM_ROOM__\s*=\s*"([^"]+)"/.exec(doc) || [])[1] || '';
  const inheritedDeckId = (/window\.__SM_DECK_ID__\s*=\s*"([^"]+)"/.exec(doc) || [])[1] || '';
  doc = doc.replace(/<!--sm-phone-remote-start-->[\s\S]*?<!--sm-phone-remote-end-->/g, '');
  if (!forEdit && embedPhoneRemote) {
    // 房间号 = 配对凭证（烘死 → 二维码永久不变）；deck id = 广播频道名，保证同一台
    // 电脑上同时开着的两份 deck 不会串台（BroadcastChannel 按同源+频道名广播）。
    const room = (!newRoomOnExport && inheritedRoom) ? inheritedRoom : smRoomId();
    const deckId = (!newRoomOnExport && inheritedDeckId) ? inheritedDeckId : ('sm-' + smRoomId().slice(0, 12));
    const inject = PHONE_REMOTE_JS
      .replace('__SM_ROOMVAL__', room)
      .replace('__SM_DECKIDVAL__', deckId);
    doc = insertBeforeBodyEnd(doc, inject + '\n');
    lastExportRoom = room;
  }
  // 编辑预览：把外链 Google Fonts 改成「非阻塞」加载，否则没翻墙时浏览器会卡在 fonts.googleapis.com
  // 等渲染 →「加载特别慢 / 看不到 slides / 换肤黑屏」。文字先用系统字体即时显示，字体到了再升级。
  return forEdit ? nonBlockFonts(doc) : doc;
}
// <link> tags for user-picked Google fonts that the deck author didn't already include.
// Detected from usedFontIds plus a scan of the deck HTML (so a re-imported deck that
// carries inline font-family but lost its <link> still loads). Returns '' when none.
function fontLinksFor(deckHtml: string): string {
  const ids = new Set<string>(usedFontIds);
  FONTS.forEach((f) => { if (f.google && f.family && deckHtml.indexOf(f.family) >= 0) ids.add(f.id); });
  const head = H.head || '';
  const hasGoogle = /fonts\.googleapis\.com/.test(head);
  const fams: string[] = [];
  ids.forEach((id) => {
    const f = FONT_BY_ID[id]; if (!f || !f.google) return;
    // skip only if the deck author already loads this family from Google Fonts
    if (hasGoogle && (head.indexOf(f.family.replace(/ /g, '+')) >= 0 || head.indexOf(f.family) >= 0)) return;
    fams.push(f.google);
  });
  if (!fams.length) return '';
  return '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=' + fams.join('&family=') + '&display=swap">';
}
// Typography polish injected into every assembled deck (imported or rendered): balance
// headings so they don't drop a lonely word onto a second line, and prettify body text
// so paragraphs/lists avoid orphan last-line words. Native CSS, degrades silently on old
// browsers, no-op on single-line text. Targets generic tags + the Deck-Contract classes.
// 播放（present）态的布局修复。**deck 模板里那条规则在所有笔记本上都是坏的**，
// 而存量 deck 把它烤死在自己的 <style> 里了 —— 所以这份修复要注进每一次 assemble
// （预览和导出都要），用户手上已有的 deck 一存 / 一导出就跟着修好。
//
// 坏在哪：`body.present .slide` 用 `transform:scale(var(--sc))` 缩放，**但 transform
// 不改布局尺寸** —— 盒子在布局上仍是 1920×1080。屏幕只要比 1920×1080 小（＝所有笔记本），
// `.deck` 就被撑出滚动条；而 flex 居中的溢出是两边对称的，右边能滚到、**左边那一截
// 滚都滚不回来**。实测 1728×899：文档 1824×1080，横向溢出 96px、纵向 181px，幻灯片
// 视觉顶端在 -82px。用户看到的就是「播放时一大片黑、画面偏出去、手动拉回来、翻下一页又偏」。
// 修法：用负 margin 把布局盒子收回到视觉尺寸。
const PRESENT_FIX_CSS = '<style id="sm-present-fix">'
  + 'body.present .slide{margin:calc((1080px * var(--sc,1) - 1080px) / 2) calc((1920px * var(--sc,1) - 1920px) / 2)}'
  + '</style>';
const TYPO_CSS = '<style id="sm-typo">'
  + '#deck .slide h1,#deck .slide h2,#deck .slide h3,#deck .slide h4,#deck .slide .title,#deck .slide .cover__title,#deck .slide .secdiv__title,#deck .slide .manifesto__title,#deck .slide .insight__statement,#deck .slide .head__title,#deck .slide blockquote{text-wrap:balance}'
  + '#deck .slide p,#deck .slide li,#deck .slide .cover__sub,#deck .slide .card__desc,#deck .slide .sub{text-wrap:pretty}'
  + '</style>';
// FX: one-shot ENTRANCE animations (data-anim) + continuous MOTION (data-motion),
// ported from the runtime so they play in any imported/exported deck (which has no
// such rules of its own). Gated by FX_JS via slide classes so we get auto-on-show
// vs click-to-play. Respect prefers-reduced-motion.
//  - auto  (default): a slide gets .sm-play when it becomes active → entrance plays once, motion loops.
//  - manual: a slide gets .sm-armed (entrance hidden, motion paused) until the viewer clicks → .sm-play.
// 演讲者备注：写在 slide 里的 <aside class="notes">，**永远不给观众看**。
// 预览和导出件都注入这条——漏出去就是事故（观众看到你的提词）。手机遥控客户端
// 会把这些备注收集起来现造一份讲稿推到 iPad/手机，那才是它们该出现的地方。
const NOTES_CSS = '<style id="sm-notes">#deck .slide aside.notes,#deck .slide .notes,'
  + '#deck .slide [data-notes]{display:none!important}</style>';
const FX_CSS = '<style id="sm-fx">'
  // continuous MOTION — assigned always; auto runs immediately, manual stays paused until played
  + '#deck .slide [data-motion]{will-change:transform,opacity,filter}'
  + '#deck .slide [data-motion="glow"]{animation:sm-m-glow 3.2s ease-in-out infinite}'
  + '#deck .slide [data-motion="breathe"]{animation:sm-m-breathe 3.6s ease-in-out infinite;transform-origin:center}'
  + '#deck .slide [data-motion="float"]{animation:sm-m-float 3.4s ease-in-out infinite}'
  + '#deck .slide [data-motion="pulse"]{animation:sm-m-pulse 2s ease-in-out infinite}'
  + '#deck .slide [data-motion="neon"]{animation:sm-m-neon 5.5s linear infinite}'
  + '#deck .slide [data-motion="stress"]{animation:sm-m-stress 4.2s ease-in-out infinite;transform-origin:center}'
  + '#deck .slide [data-motion="shimmer"]{will-change:background-position;background:linear-gradient(125deg,#ff6eb4 0%,#ffb347 8%,#ffe46e 16%,#7bf0ff 24%,#a855f7 32%,#f4b73e 40%,#ff6eb4 48%,#06b6d4 56%,#a855f7 64%,#ffb347 72%,#7bf0ff 80%,#ff6eb4 90%,#f4b73e 100%);background-size:600% 600%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:sm-m-shimmer 6s ease-in-out infinite}'
  + 'html[data-smfx="manual"] #deck .slide [data-motion]{animation-play-state:paused}'
  + 'html[data-smfx="manual"] #deck .slide.sm-play [data-motion]{animation-play-state:running}'
  // one-shot ENTRANCE — element is normally visible; only hidden while armed/playing, then animates in
  + '#deck .slide.sm-armed [data-anim]{opacity:0}'
  + '#deck .slide.sm-play [data-anim]{opacity:0;animation-fill-mode:both;animation-duration:.55s;animation-timing-function:cubic-bezier(.16,1,.3,1)}'
  + '#deck .slide.sm-play [data-anim="fade"]{animation-name:sm-a-fade;animation-duration:.5s}'
  + '#deck .slide.sm-play [data-anim="rise"]{animation-name:sm-a-rise}'
  + '#deck .slide.sm-play [data-anim="fade-up"]{animation-name:sm-a-rise}'
  + '#deck .slide.sm-play [data-anim="pop"]{animation-name:sm-a-pop;animation-duration:.5s}'
  + '#deck .slide.sm-play [data-anim="in-left"]{animation-name:sm-a-in-left}'
  + '#deck .slide.sm-play [data-anim="in-right"]{animation-name:sm-a-in-right}'
  + '#deck .slide.sm-play [data-anim="counter-up"]{animation-name:sm-a-fade;animation-duration:.5s}'
  + '#deck .slide.sm-play [data-anim="morph"]{animation-name:sm-a-pop;animation-duration:.6s}'
  // stagger-list — the list itself stays visible; its items rise one after another
  + '#deck .slide.sm-armed [data-anim="stagger-list"]{opacity:1}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]{opacity:1;animation:none}'
  + '#deck .slide.sm-armed [data-anim="stagger-list"]>li{opacity:0}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li{opacity:0;animation:sm-a-rise .5s cubic-bezier(.16,1,.3,1) both}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(2){animation-delay:.07s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(3){animation-delay:.14s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(4){animation-delay:.21s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(5){animation-delay:.28s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(6){animation-delay:.35s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(n+7){animation-delay:.42s}'
  // one-shot EXIT — plays on the leaving slide (FX_JS keeps it visible long enough)
  + '#deck .slide.sm-exit [data-anim-out]{animation-fill-mode:both;animation-duration:.42s;animation-timing-function:cubic-bezier(.4,0,.2,1)}'
  + '#deck .slide.sm-exit [data-anim-out="fade-out"]{animation-name:sm-o-fade}'
  + '#deck .slide.sm-exit [data-anim-out="sink"]{animation-name:sm-o-sink}'
  + '#deck .slide.sm-exit [data-anim-out="zoom-out"]{animation-name:sm-o-zoom}'
  + '#deck .slide.sm-exit [data-anim-out="out-left"]{animation-name:sm-o-left}'
  + '#deck .slide.sm-exit [data-anim-out="out-right"]{animation-name:sm-o-right}'
  // entrance keyframes
  + '@keyframes sm-a-fade{from{opacity:0}to{opacity:1}}'
  + '@keyframes sm-a-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-in-left{from{opacity:0;transform:translateX(-48px)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-in-right{from{opacity:0;transform:translateX(48px)}to{opacity:1;transform:none}}'
  // motion keyframes
  + '@keyframes sm-m-glow{0%,100%{filter:drop-shadow(0 0 1px transparent)}50%{filter:drop-shadow(0 0 16px var(--accent,#F4B73E))}}'
  + '@keyframes sm-m-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}'
  + '@keyframes sm-m-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}'
  + '@keyframes sm-m-pulse{0%,100%{opacity:1}50%{opacity:.55}}'
  + '@keyframes sm-m-neon{0%,16%,18%,55%,57%,100%{opacity:1}17%,56%{opacity:.7}80%,82%{opacity:.88}}'
  + '@keyframes sm-m-stress{0%,38%,100%{transform:scale(1)}45%{transform:scale(1.06)}}'
  + '@keyframes sm-m-shimmer{0%{background-position:0% 30%}33%{background-position:80% 65%}66%{background-position:40% 90%}100%{background-position:0% 30%}}'
  // exit keyframes
  + '@keyframes sm-o-fade{from{opacity:1}to{opacity:0}}'
  + '@keyframes sm-o-sink{from{opacity:1;transform:none}to{opacity:0;transform:translateY(44px)}}'
  + '@keyframes sm-o-zoom{from{opacity:1;transform:none}to{opacity:0;transform:scale(.86)}}'
  + '@keyframes sm-o-left{from{opacity:1;transform:none}to{opacity:0;transform:translateX(-64px)}}'
  + '@keyframes sm-o-right{from{opacity:1;transform:none}to{opacity:0;transform:translateX(64px)}}'
  // ── 动画库新增（集众家所长）：新入场 + 强调 + 点睛 ──
  + '#deck .slide.sm-play{perspective:1400px}'
  + '#deck .slide.sm-play [data-anim="tracking-in"]{animation-name:sm-a-tracking;animation-duration:.8s}'
  + '#deck .slide.sm-play [data-anim="focus-in"]{animation-name:sm-a-focus;animation-duration:.7s}'
  + '#deck .slide.sm-play [data-anim="slide-blur"]{animation-name:sm-a-slideblur;animation-duration:.55s}'
  + '#deck .slide.sm-play [data-anim="flip-in"]{animation-name:sm-a-flip;animation-duration:.7s}'
  + '#deck .slide.sm-play [data-anim="back-in"]{animation-name:sm-a-back;animation-duration:.7s}'
  + '@keyframes sm-a-tracking{0%{opacity:0;letter-spacing:-.42em;filter:blur(6px)}40%{opacity:1}100%{opacity:1;letter-spacing:normal;filter:none}}'
  + '@keyframes sm-a-focus{from{opacity:0;filter:blur(14px)}to{opacity:1;filter:none}}'
  + '@keyframes sm-a-slideblur{from{opacity:0;transform:translateX(-64px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}'
  + '@keyframes sm-a-flip{from{opacity:0;transform:rotateY(88deg)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-back{from{opacity:0;transform:translateY(96px) scale(.86)}to{opacity:1;transform:none}}'
  // 强调（一次性，元素本身可见，翻到本页时做个手势）
  + '#deck .slide.sm-play [data-emph]{animation-fill-mode:both;animation-duration:.9s}'
  + '#deck .slide.sm-play [data-emph="tada"]{animation-name:sm-e-tada}'
  + '#deck .slide.sm-play [data-emph="rubber-band"]{animation-name:sm-e-rubber}'
  + '#deck .slide.sm-play [data-emph="jello"]{animation-name:sm-e-jello;transform-origin:center}'
  + '#deck .slide.sm-play [data-emph="heartbeat"]{animation-name:sm-e-heart;animation-duration:1.3s}'
  + '#deck .slide.sm-play [data-emph="headshake"]{animation-name:sm-e-head;animation-duration:.8s}'
  + '#deck .slide.sm-play [data-emph="shake"]{animation-name:sm-e-shake;animation-duration:.7s}'
  + '#deck .slide.sm-play [data-emph="text-pop"]{animation-name:sm-e-textpop;animation-duration:.6s}'
  + '@keyframes sm-e-tada{0%{transform:scale(1)}10%,20%{transform:scale(.9) rotate(-3deg)}30%,50%,70%,90%{transform:scale(1.1) rotate(3deg)}40%,60%,80%{transform:scale(1.1) rotate(-3deg)}100%{transform:scale(1)}}'
  + '@keyframes sm-e-rubber{0%{transform:scale(1)}30%{transform:scaleX(1.25) scaleY(.75)}40%{transform:scaleX(.75) scaleY(1.25)}50%{transform:scaleX(1.15) scaleY(.85)}65%{transform:scaleX(.95) scaleY(1.05)}75%{transform:scaleX(1.05) scaleY(.95)}100%{transform:scale(1)}}'
  + '@keyframes sm-e-jello{0%,11%,100%{transform:none}22%{transform:skewX(-12deg) skewY(-12deg)}33%{transform:skewX(6deg) skewY(6deg)}44%{transform:skewX(-3deg) skewY(-3deg)}55%{transform:skewX(1.5deg) skewY(1.5deg)}66%{transform:skewX(-.8deg) skewY(-.8deg)}}'
  + '@keyframes sm-e-heart{0%,40%,80%,100%{transform:scale(1)}14%{transform:scale(1.22)}28%{transform:scale(1)}54%{transform:scale(1.22)}}'
  + '@keyframes sm-e-head{0%{transform:translateX(0)}12.5%{transform:translateX(-7px) rotateY(-9deg)}37.5%{transform:translateX(6px) rotateY(7deg)}62.5%{transform:translateX(-4px) rotateY(-5deg)}87.5%{transform:translateX(2px) rotateY(3deg)}100%{transform:translateX(0)}}'
  + '@keyframes sm-e-shake{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-9px)}20%,40%,60%,80%{transform:translateX(9px)}}'
  + '@keyframes sm-e-textpop{from{text-shadow:0 0 0 rgba(0,0,0,0);transform:none}to{text-shadow:0 6px 18px rgba(0,0,0,.28);transform:translateY(-4px)}}'
  // 点睛：Ken Burns / 线条自绘 / 擦幕 / 聚光灯
  + '#deck .slide [data-motion="ken-burns"],#deck .slide .smfx-kenburns img{animation:sm-kenburns 18s ease-in-out infinite alternate;transform-origin:center}'
  + '@keyframes sm-kenburns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.12) translate(-2%,-2%)}}'
  + '#deck .slide .smfx-draw path,#deck .slide .smfx-draw line,#deck .slide .smfx-draw polyline{stroke-dasharray:1;stroke-dashoffset:1}'
  + '#deck .slide.sm-play .smfx-draw path,#deck .slide.sm-play .smfx-draw line,#deck .slide.sm-play .smfx-draw polyline{animation:sm-draw 1.2s cubic-bezier(.4,0,.2,1) forwards}'
  + '@keyframes sm-draw{to{stroke-dashoffset:0}}'
  + '#deck .slide.sm-play [data-anim="clip-wipe"],#deck .slide.sm-play .smfx-wipe{animation:sm-wipe .8s cubic-bezier(.4,0,.2,1) both}'
  + '@keyframes sm-wipe{from{opacity:1;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}'
  + '#deck .slide.sm-play .smfx-spot>:not([data-focus]){opacity:.22;filter:saturate(.4);transition:opacity .4s,filter .4s}'
  + '#deck .slide.sm-play .smfx-spot>[data-focus]{transform:scale(1.04)}'
  // ── 移植自 transitions.dev（自有实现，按放映态重写）：A5 数字弹入 / A12 多行浮现 / H8 成功对勾 ──
  // A5 数字弹入：容器可见，逐字 .smfx-ch（FX_JS 的 play() 自动拆字）错落带模糊滑入
  + '#deck .slide.sm-armed [data-anim="num-pop"],#deck .slide.sm-play [data-anim="num-pop"]{opacity:1;animation:none}'
  + '#deck .slide.sm-armed [data-anim="num-pop"] .smfx-ch{display:inline-block;opacity:0}'
  + '#deck .slide.sm-play [data-anim="num-pop"] .smfx-ch{display:inline-block;opacity:0;animation:sm-a-numpop .7s cubic-bezier(.34,1.5,.5,1) both;animation-delay:calc(var(--i,0)*.07s)}'
  + '@keyframes sm-a-numpop{from{opacity:0;transform:translateY(.5em);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}'
  // A12 多行浮现：容器可见，每个直接子元素依次带模糊上浮
  + '#deck .slide.sm-armed [data-anim="texts-reveal"],#deck .slide.sm-play [data-anim="texts-reveal"]{opacity:1;animation:none}'
  + '#deck .slide.sm-armed [data-anim="texts-reveal"]>*{opacity:0}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*{opacity:0;animation:sm-a-textsrev .5s cubic-bezier(.16,1,.3,1) both}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(2){animation-delay:.1s}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(3){animation-delay:.2s}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(4){animation-delay:.3s}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(n+5){animation-delay:.4s}'
  + '@keyframes sm-a-textsrev{from{opacity:0;transform:translateY(.55em);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}'
  // H8 成功对勾：圆环弹入 + 对勾描线（复用 sm-draw）
  + '#deck .slide.sm-armed .smfx-check{opacity:0}'
  + '#deck .slide.sm-play .smfx-check{display:inline-block;animation:sm-check-in .72s cubic-bezier(.34,1.5,.5,1) both}'
  + '#deck .slide .smfx-check svg{overflow:visible}'
  + '#deck .slide .smfx-check .smfx-check-tick{stroke-dasharray:1;stroke-dashoffset:1}'
  + '#deck .slide.sm-play .smfx-check .smfx-check-tick{animation:sm-draw .5s cubic-bezier(.4,0,.2,1) .2s forwards}'
  + '@keyframes sm-check-in{0%{opacity:0;transform:scale(.6) rotate(-12deg)}60%{opacity:1;transform:scale(1.08) rotate(2deg)}100%{opacity:1;transform:scale(1) rotate(0)}}'
  + '@media(prefers-reduced-motion:reduce){#deck .slide [data-motion],#deck .slide [data-anim],#deck .slide [data-anim] *,#deck .slide [data-anim-out],#deck .slide [data-emph],#deck .slide .smfx-draw path,#deck .slide .smfx-check,#deck .slide .smfx-check .smfx-check-tick{animation:none!important;opacity:1!important;letter-spacing:normal!important;filter:none!important;stroke-dashoffset:0!important}}'
  + '</style>';
// FX driver — injected into preview + export. Watches which slide is active and, per
// data-smfx mode, plays it (auto) or arms it for a click (manual). Exposes window hooks
// so the Studio's ▶ button / mode switch can drive it live without a re-render.
const FX_JS = '<script id="sm-fx-js">(function(){'
  + 'var root=document.documentElement;var deck=document.getElementById("deck");if(!deck)return;'
  + 'function mode(){return root.getAttribute("data-smfx")||"auto";}'
  + 'function reduce(){try{return matchMedia("(prefers-reduced-motion:reduce)").matches;}catch(e){return false;}}'
  + 'function active(){return deck.querySelector(".slide.active")||deck.querySelector(".slide");}'
  + 'function arm(s){if(!s)return;splitNum(s);s.classList.remove("sm-play");s.classList.add("sm-armed");}'
  // A5 数字弹入：把 [data-anim="num-pop"] 文本拆成逐字 .smfx-ch（带 --i 序号），只拆一次
  + 'function splitNum(s){try{s.querySelectorAll(\'[data-anim="num-pop"]:not([data-smfx-split])\').forEach(function(el){var t=el.textContent;el.setAttribute("data-smfx-split","1");el.textContent="";var i=0;t.split("").forEach(function(ch){if(ch===" "){el.appendChild(document.createTextNode(" "));return;}var sp=document.createElement("span");sp.className="smfx-ch";sp.style.setProperty("--i",i++);sp.textContent=ch;el.appendChild(sp);});});}catch(e){}}'
  + 'function play(s){if(!s)return;splitNum(s);s.classList.remove("sm-play");s.classList.remove("sm-armed");void s.offsetWidth;s.classList.add("sm-play");}'
  + 'function onShow(s){if(!s)return;if(mode()==="manual"){arm(s);}else{play(s);}}'
  + 'window.__SM_FX_PLAY__=function(){play(active());};'
  + 'window.__SM_FX_REARM__=function(){onShow(active());};'
  // EXIT: keep the leaving slide visible while [data-anim-out] elements animate out
  + 'var EXIT_MS=440,exiting=false,bypass=false;'
  + 'function hasExit(s){return !!(s&&s.querySelector("[data-anim-out]"));}'
  + 'function runExit(s,done){if(!s){done&&done();return;}s.classList.remove("sm-exit");void s.offsetWidth;s.classList.add("sm-exit");setTimeout(function(){s.classList.remove("sm-exit");done&&done();},EXIT_MS);}'
  + 'window.__SM_FX_PLAY_OUT__=function(){runExit(active());};'
  + 'deck.addEventListener("click",function(){if(mode()!=="manual")return;var s=active();if(s&&s.classList.contains("sm-armed"))play(s);},true);'
  // intercept presentation nav so the exit plays first, then replay the event for the deck engine.
  // skipped while editing in Studio (data-smfx-edit) so navigating stays instant.
  + 'if(root.getAttribute("data-smfx-edit")!=="1"){'
  + 'var NAVK={ArrowRight:1,ArrowDown:1,PageDown:1,Enter:1," ":1,ArrowLeft:1,ArrowUp:1,PageUp:1,Backspace:1,Home:1,End:1};'
  + 'function isNav(e){return NAVK[e.key]===1||/^[1-9]$/.test(e.key);}'
  + 'document.addEventListener("keydown",function(e){'
  + 'if(bypass){bypass=false;return;}'
  + 'if(!isNav(e)||reduce())return;'
  + 'if(exiting){e.preventDefault();e.stopImmediatePropagation();return;}'
  + 'var cur=active();if(!hasExit(cur))return;'
  + 'e.preventDefault();e.stopImmediatePropagation();exiting=true;'
  + 'runExit(cur,function(){exiting=false;bypass=true;try{document.dispatchEvent(new KeyboardEvent("keydown",{key:e.key,code:e.code,bubbles:true,cancelable:true}));}catch(x){bypass=false;}});'
  + '},true);'
  + 'document.addEventListener("click",function(e){'
  + 'var btn=e.target&&e.target.closest&&e.target.closest("[data-act=\\"next\\"],[data-act=\\"prev\\"]");if(!btn)return;'
  + 'if(bypass){bypass=false;return;}if(reduce())return;'
  + 'if(exiting){e.preventDefault();e.stopImmediatePropagation();return;}'
  + 'var cur=active();if(!hasExit(cur))return;'
  + 'e.preventDefault();e.stopImmediatePropagation();exiting=true;'
  + 'runExit(cur,function(){exiting=false;bypass=true;try{btn.click();}catch(x){bypass=false;}});'
  + '},true);}'
  + 'var last=null;function tick(){var s=active();if(s&&s!==last){last=s;onShow(s);}}'
  + 'try{new MutationObserver(tick).observe(deck,{attributes:true,subtree:true,attributeFilter:["class"]});}catch(e){}'
  + 'setTimeout(tick,60);setTimeout(tick,400);'
  + '})();</scr' + 'ipt>';
// Canvas FX engine (J · Canvas 特效). Self-contained IIFE with its own MutationObserver that
// boots data-fx effects on the active slide and tears them down on leave — so background canvas
// effects run in the Studio preview AND the exported deck, exactly like a built editorial deck.
// srcdoc re-render swaps the whole document, so the old canvas rAF dies with it (no leak).
const FX_CANVAS_JS = '<script id="sm-fx-canvas">' + fxCanvasJs + '</scr' + 'ipt>';

// 「手机遥控」注入块（仅导出、且勾选时）：配置(云中转地址) + 浏览器二维码库 + 配对客户端。
// 用 HTML 注释作首尾标记，assembleDeck 每次导出先剥离旧的再按需注入，避免 re-import 后重复。
// __SM_ROOM__ 占位符在导出时被替换成一个固定房间号（每份导出各一个），使这份 HTML 的配对二维码永久不变。
const PHONE_REMOTE_JS =
  '<!--sm-phone-remote-start-->\n'
  + '<script>window.__SM_CLOUD_RELAY__=' + JSON.stringify(PR_CLOUD) + ';window.__SM_ROOM__="__SM_ROOMVAL__";'
  + 'window.__SM_DECK_ID__="__SM_DECKIDVAL__";</scr' + 'ipt>\n'
  + '<script>' + qrLibJs + '</scr' + 'ipt>\n'
  + '<script>' + pairClientJs + '</scr' + 'ipt>\n'
  + '<!--sm-phone-remote-end-->';
// 生成一个固定房间号（浏览器内），烘进导出件 → 二维码永久不变、可截图复用。
// ---------------- 手表提词（watch mode） ----------------
// 提词表按**锚点**索引（`{"s1-boom":["无缝嵌入"]}`），存在 deck 自己的
// `window.__SM_CUES__` 里。这里做的是「读出来 → 编辑 → 写回去」。
//
// 读为什么走预览 iframe 而不是正则解析文本：那份字面量是**人和 skill 写的 JS**，
// 带注释、可能有尾逗号，正则解析迟早翻车。iframe 里那份是浏览器**已经求值过**的，
// 永远是对的。写回去时我们统一写成严格 JSON，下次谁解析都不难。
let cueMap: Record<string, string[]> | null = null;
let cueLoaded = false;
/** 用户手动点「＋ 加一条」超出 5 条时，额外多给几个空框（按锚点记） */
const cueExtra: Record<string, number> = {};

/** 提词的硬约束 —— 与 slides-presenter-mode skill 里那张表一字不差 */
// 表盘放得下 5 行短提词。**这是 skill 出品的上限**；Studio 允许手动超过它
// （手表上会变成要翻页，能用但不优雅），所以这里只告警、不拦。
const CUE_MAX = 5;
const CUE_LEN = 10;
const CUE_STRUCTURAL = /^(第[一二三四五六七八九十\d]+(部分|章|节|页)|part\s*\d+|目录|结构|概览|agenda)$/i;

function previewWin(): (Window & { deckAPI?: { SLIDE_MAP?: string[] }; __SM_CUES__?: Record<string, string[]> }) | null {
  try { return (($('#preview') as HTMLIFrameElement).contentWindow as never) || null; } catch { return null; }
}

/** 预览 iframe 里那份 deck 真的渲染出来了吗（`#deck` 在了就算） */
function previewReady(): boolean {
  try { return !!previewWin()?.document?.querySelector('#deck'); } catch { return false; }
}

/** 第 i 页对应的讲稿锚点。与 deck 端 stateFromDom() 的取法保持一致，否则手表对不上 */
function slideAnchor(i: number): string {
  const w = previewWin();
  const m = w?.deckAPI?.SLIDE_MAP;
  return (m && m[i]) || ('sm-note-' + i);
}

/** 首次进面板时从预览里吃一份。返回 null = 这份 deck 没开 watch mode */
function loadCues(): Record<string, string[]> | null {
  if (cueLoaded) return cueMap;
  // **预览没起来就别缓存**：这时候读到的 undefined 不代表"这份 deck 没提词"，
  // 缓存下去就变成永久的假答案（导入过程中 refreshTasks 就会撞上）。
  if (!previewReady()) return null;
  cueLoaded = true;
  const raw = previewWin()?.__SM_CUES__;
  cueMap = (raw && typeof raw === 'object') ? JSON.parse(JSON.stringify(raw)) as Record<string, string[]> : null;
  return cueMap;
}

/** 写回 deck 文本。__SM_CUES__ 落在 #deck 之外，也就是 H.prelude / H.trailing 里 */
function persistCues(): void {
  if (!cueMap) return;
  const json = JSON.stringify(cueMap, null, 2);
  // **全局替换、两处都写**：万一 deck 里混进了两份 __SM_CUES__ 赋值（历史注入 + 新注入），
  // 只写第一份的话，浏览器用的是最后一份 —— Studio 面板显示得好好的，deck 和手表拿到的
  // 却是另一份，而且没有任何报错。让每一份都是同一张表，谁赢都对。
  const re = /(window\.__SM_CUES__\s*=\s*)\{[\s\S]*?\}(\s*;)/g;
  let done = false;
  for (const key of ['trailing', 'prelude'] as const) {
    const src = H[key];
    if (re.test(src)) {
      re.lastIndex = 0;
      // 用函数替换：提词里可能含 $ 之类的字符，字符串替换会被当特殊记号解释
      H[key] = src.replace(re, (_m, a: string, b: string) => a + json + b);
      done = true;
    }
    re.lastIndex = 0;
  }
  // **只标脏，不重渲染预览**：提词不影响幻灯片外观，为敲一个字就重载整份 deck
  // 会丢掉滚动位置和选中态。
  //
  // 但预览里那个活对象要就地更新——不然 deck 上的「✦ 提词」浮层显示的还是旧表，
  // 面板里明明写好了、浮层却说「这一页没有提词」，看着就像根本没写进去。
  if (done) {
    try {
      const w = previewWin() as (Window & { __SM_CUES__?: Record<string, string[]>; __SM_CUE_REFRESH__?: () => void }) | null;
      if (w) {
        w.__SM_CUES__ = JSON.parse(json) as Record<string, string[]>;
        if (typeof w.__SM_CUE_REFRESH__ === 'function') w.__SM_CUE_REFRESH__();
      }
    } catch { /* 预览没就绪就算了，下次重渲染自然会带上 */ }
    markDirty();
  }
}

function renderCuePane(): void {
  const box = $('#cueBody'); if (!box) return;
  if (mode !== 'html') { box.innerHTML = '<div class="nosel">提词只对导入的 HTML deck 可用。</div>'; return; }
  const map = loadCues();
  if (!map) {
    const ch = deckChannel();
    box.innerHTML = '<div class="nosel">这份 deck 没有开 <b>watch mode</b>——里面没有提词表，写不进去。<br><br>'
      + '最省事的办法：在 Claude 面板点 <b>一键加提词</b>，它会先把 watch mode 烘进去再拟提词'
      + (ch ? '（频道名已认出：<code>' + esc(ch) + '</code>）' : '')
      + '。<br><br>也可以自己跑 <code>slides-presenter-mode</code> skill 重新缝一遍。</div>';
    return;
  }
  const anchor = slideAnchor(cur);
  // 已有的全都显示（可能超过 5——手动加的），不足 5 条补空框
  const list = (map[anchor] || []).slice();
  while (list.length < CUE_MAX) list.push('');
  if (cueExtra[anchor]) { for (let k = 0; k < cueExtra[anchor]; k++) list.push(''); }

  const rows = list.map((v, i) =>
    `<div class="field"><input class="cue-in" data-i="${i}" value="${esc(v)}" placeholder="${i === 0 ? '例：无缝嵌入' : '（可留空）'}" maxlength="24"></div>`
  ).join('');

  // 全 deck 的账要摆在最上面：提词是「每页都得有」的东西，只盯着当前页
  // 永远不知道自己还差 12 页没写。
  const sum = cueDeckSummary(map);
  const short = sum.total - sum.have;
  const sumTxt = `全 deck ${sum.have}/${sum.total} 页有提词`
    + (short ? ` · 缺 ${short} 页` : '')
    + (sum.bad ? ` · ${sum.bad} 页不合规` : (short ? '' : ' · 全部合规'));

  box.innerHTML = (cueUndo
      ? `<div class="audit-row">Claude 刚写入 ${cueAiCount} 页 · <button id="cueUndo" class="mini">撤销</button></div>`
      : '')
    + `<div class="cfaint">${sumTxt}</div>`
    + `<div class="cfaint">第 ${cur + 1} 页 · 锚点 <code>${esc(anchor)}</code></div>`
    + rows
    + '<div class="oprow"><button id="cueAdd" class="mini">＋ 加一条</button>'
    + '<button id="cueFromNotes" class="mini">从讲稿抽一版</button>'
    + ((short || sum.bad) ? '<button id="cueNext" class="mini">跳到下一个待处理</button>' : '')
    + '</div>'
    + '<div id="cueCheck"></div>';

  box.querySelectorAll('.cue-in').forEach((el) => {
    el.addEventListener('input', () => {
      const vals = Array.from(box.querySelectorAll('.cue-in'))
        .map((x) => (x as HTMLInputElement).value.trim())
        .filter((t) => t.length > 0);
      if (!cueMap) return;
      if (vals.length) cueMap[anchor] = vals; else delete cueMap[anchor];
      checkCues(vals);
      persistCues();
    });
  });
  const addBtn = $('#cueAdd');
  if (addBtn) addBtn.addEventListener('click', () => {
    // 手动突破 5 条 —— 手表上会变成要翻页，体检会提醒，但不拦
    cueExtra[anchor] = (cueExtra[anchor] || 0) + 1;
    renderCuePane();
  });
  const fromNotes = $('#cueFromNotes');
  if (fromNotes) fromNotes.addEventListener('click', () => cueDraftFromNotes(anchor));
  const undoBtn = $('#cueUndo');
  if (undoBtn) undoBtn.addEventListener('click', () => undoCuePatch());
  const nextBtn = $('#cueNext');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const i = nextCueTodo(map);
    if (i < 0) { toast('全部页都过关了'); return; }
    selectHtmlSlide(i);
  });
  checkCues(list.filter((t) => t.length > 0));
}

/** 一页提词的毛病清单（空 = 合规）。**只此一处**——面板体检、全 deck 汇总、
 *  交给 Claude 的回报，三处共用它，规则不会各写各的然后慢慢漂开。 */
function cueIssues(vals: string[]): string[] {
  const bad: string[] = [];
  if (!vals.length) bad.push('这一页还没有提词');
  if (vals.length > CUE_MAX) bad.push(`条数 ${vals.length}，超过 ${CUE_MAX} 条手表要翻页`);
  vals.forEach((v) => {
    if (v.length > CUE_LEN) bad.push(`「${v.slice(0, 8)}…」${v.length} 字，超上限 ${CUE_LEN}`);
    if (CUE_STRUCTURAL.test(v)) bad.push(`「${v}」像结构标签，手表上帮不上忙`);
  });
  return bad;
}

/** 就地体检 —— 讲台上才发现提词不合用就晚了 */
function checkCues(vals: string[]): void {
  const out = $('#cueCheck'); if (!out) return;
  const bad = cueIssues(vals);
  out.className = bad.length ? 'audit-row error' : 'audit-row';
  out.textContent = bad.length ? '⚠ ' + bad.join(' · ') : '✓ 合规';
}

/** 从讲稿里抽这一段的 <strong> 当草稿。**仍需人过一遍**——见 skill 里的红线 */
function cueDraftFromNotes(anchor: string): void {
  const w = previewWin() as (Window & { __TXB64__?: string }) | null;
  const b64 = w?.__TXB64__;
  if (!b64) { toast('这份 deck 没有内嵌讲稿，抽不出来', true); return; }
  let html = '';
  try { html = decodeURIComponent(escape(atob(b64))); } catch { toast('讲稿解码失败', true); return; }
  const re = new RegExp('<h[1-6][^>]*\\bid="' + anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>([\\s\\S]*?)(?=<h[1-6][^>]*\\bid=|$)', 'i');
  const seg = html.match(re);
  if (!seg) { toast('讲稿里没找到锚点 ' + anchor, true); return; }
  const found: string[] = [];
  seg[1].replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, t: string) => {
    const clean = t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (clean && found.indexOf(clean) < 0) found.push(clean);
    return '';
  });
  if (!found.length) { toast('这一段讲稿里没有 <strong> 标记', true); return; }
  if (!cueMap) return;
  cueMap[anchor] = found.slice(0, CUE_MAX);
  persistCues();
  renderCuePane();
  toast('抽了 ' + found.length + ' 条草稿 —— 请逐条过一遍再用');
}

// ---------- 提词的对外接口：Claude ↔ 桥 ↔ 这里（「一键加提词」走的就是这条） ----------
//
// **为什么非要另开一条通道**：`slidesmith_apply_patch` 只按 `data-id` 替换 `#deck` 里的
// `<section>`，而提词表落在 `#deck` 之外的 prelude/trailing —— 补丁够不着它。
//
// **读也不让桥去正则解析那份字面量**（理由同 loadCues）：那是人和 skill 手写的 JS，
// 带注释、可能有尾逗号。这里交出去的是浏览器已经求值过的那份；锚点也用 Studio 自己的
// `slideAnchor()` 算，和提词面板、和手表查表用的键完全同源，不会各算各的。
interface CuePageInfo { index: number; anchor: string; title: string; cues: string[]; issues: string[] }
/** AI 上一次写入之前的整份提词表 —— 撤销用。null = 这一会话 AI 还没写过 */
let cueUndo: Record<string, string[]> | null = null;
let cueAiCount = 0;

/**
 * 这份 deck 的广播频道名。
 *
 * watch mode 的注入代码要用它拼 `{{CHANNEL}}-presenter-sync` 跟着翻页走；**填错了提词窗
 * 就一辈子停在第一页**，两份 deck 同开还会串台。deck 自己的引擎里本来就写着一个
 * （`const CONFIG = { channel: 'dyq-defense-2026', … }`），直接抄它，别另起一个。
 */
function deckChannel(): string {
  const src = H.prelude + '\n' + H.trailing;
  const pats = [
    /\bchannel\s*:\s*['"]([^'"]+)['"]/,
    /new\s+BroadcastChannel\(\s*['"]([^'"]+?)-presenter-sync['"]/,
    /new\s+BroadcastChannel\(\s*['"]([^'"]+)['"]/,
  ];
  for (const re of pats) { const m = re.exec(src); if (m && m[1]) return m[1]; }
  return '';
}

function cueReport(): { watchMode: boolean; watchOutdated: boolean; deckMode: string; channel: string; pages: CuePageInfo[] } {
  const map = mode === 'html' ? loadCues() : null;
  const pages: CuePageInfo[] = mode === 'html'
    ? htmlSlides.map((s, i) => {
      const a = slideAnchor(i);
      const vals = (map && map[a]) ? map[a].slice() : [];
      return { index: i + 1, anchor: a, title: s.title, cues: vals, issues: cueIssues(vals) };
    })
    : [];
  const src = H.prelude + '\n' + H.trailing;
  return {
    watchMode: !!map,
    watchOutdated: !!map && src.indexOf('__SM_CUE_REFRESH__') < 0,
    deckMode: mode, channel: mode === 'html' ? deckChannel() : '', pages,
  };
}

function sendCueReport(extra: Record<string, unknown> = {}): void {
  if (!bridge.connected || !bridge.ws || bridge.ws.readyState !== WebSocket.OPEN) return;
  try { bridge.ws.send(JSON.stringify({ type: 'cues', ...cueReport(), ...extra })); } catch { /* noop */ }
}

/**
 * Claude 写来一份提词表。
 *
 * 默认 **merge**：只填还空着的页，**不动用户已经手调过的**。重跑「一键加提词」
 * 因此是安全的——否则用户在面板里逐页过完一遍的成果，会被下一次生成整份抹掉。
 * replace=true 才覆盖。
 */
function applyCuePatch(incoming: Record<string, string[]>, replace: boolean): void {
  if (mode !== 'html') { sendCueReport({ applied: 0, error: '当前不是 HTML deck，提词写不进去' }); return; }
  const map = loadCues();
  if (!map) {
    sendCueReport({ applied: 0, error: '这份 deck 没开 watch mode（找不到 window.__SM_CUES__）。'
      + '先用 slides-presenter-mode skill 以 watch mode 重新缝一次，deck 里才有提词表可写。' });
    return;
  }
  // 预览没就绪时 slideAnchor() 会退化成 'sm-note-N'，拿它当白名单会把一批**完全正确**的
  // 锚点判成「不认识」——那个报错指错了方向，人会去改锚点，而锚点根本没错。
  if (!previewReady()) {
    sendCueReport({ applied: 0, error: '预览还在重载，锚点表暂时读不到。等一两秒再写一次（别改锚点，它们没错）。' });
    return;
  }
  const valid = new Set(htmlSlides.map((_s, i) => slideAnchor(i)));
  const snapshot = JSON.parse(JSON.stringify(map)) as Record<string, string[]>;
  const unknown: string[] = []; const kept: string[] = [];
  let applied = 0;
  Object.keys(incoming).forEach((k) => {
    // 不认识的锚点**不静默丢**——回报里带上，让写的人知道自己写歪了
    if (!valid.has(k)) { unknown.push(k); return; }
    const vals = (incoming[k] || []).map((v) => String(v).trim()).filter((v) => v.length > 0);
    if (!vals.length) return;
    if (!replace && map[k] && map[k].length) { kept.push(k); return; }
    map[k] = vals; applied++;
  });
  if (applied) {
    cueUndo = snapshot; cueAiCount = applied;
    persistCues();
    if (!($('[data-hpane="script"]') as HTMLElement | null)?.hidden) renderCuePane();
    toast('Claude 写入 ' + applied + ' 页提词 —— 请在右栏「讲稿」里逐页过一遍');
    setTimeout(syncExportToBridge, 300);
  }
  sendCueReport({ applied, keptExisting: kept, unknownAnchors: unknown });
}

/** 找到并摘掉 deck 里已有的 watch-cues 注入块。返回是否摘到。 */
function stripWatchBlock(): boolean {
  // 新版注入带标记，精准；老版（skill 直接烘的 / 早期 Studio 注入的）没有标记，
  // 只能按「含 __SM_CUES__ 赋值的那个 <script>」找。
  // **有几块摘几块**，不是摘一块就收工：留一块下来就等于留了第二份提词表，
  // 而浏览器只认最后那份，Studio 却在改前面那份 —— 两边静默分家。
  const marked = /<!--sm-watch-cues-start-->[\s\S]*?<!--sm-watch-cues-end-->\s*/;
  // `=\s*\{` 这个约束是必须的：pair-client 里有 `typeof window.__SM_CUES__ === 'object'`，
  // 只写 `=` 会把整个手机遥控块一起摘掉。
  const bare = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\.__SM_CUES__\s*=\s*\{[\s\S]*?<\/script>\s*/i;
  let n = 0;
  for (const key of ['trailing', 'prelude'] as const) {
    for (const re of [marked, bare]) {
      while (re.test(H[key])) { H[key] = H[key].replace(re, ''); n++; if (n > 20) break; }
    }
  }
  return n > 0;
}

/**
 * 把 watch mode 烘进这份 deck —— `js` 是 skill 那份 `watch-cues.js.template`
 * 填好 `{{CHANNEL}}` 之后的成品。
 *
 * **模板不抄一份到 Studio 里**：抄了就是第二个真相源，skill 那边一改，这边就开始漂。
 * Studio 只负责两件它才做得了的事：报出频道名、把成品塞进 `#deck` 之外的位置。
 *
 * `replace=true` 用来**升级已经烘过的 deck**：摘掉旧块、换上新的，
 * **提词表原样保留**（写回由 persistCues 完成，它认的是内存里那份 cueMap）。
 */
function enableWatchMode(js: string, replace = false): void {
  if (mode !== 'html') { sendCueReport({ enabled: false, error: '当前不是 HTML deck' }); return; }
  const existing = loadCues();
  if (existing && !replace) {
    sendCueReport({ enabled: false, error: '这份 deck 已经开着 watch mode 了。'
      + '要换成新版注入代码（修了提词窗空白 / 弹窗被压 / 按钮不跟皮肤 三个毛病）就传 replaceExisting=true，提词表会原样保留。' });
    return;
  }
  if (!/window\.__SM_CUES__\s*=\s*\{/.test(js)) {
    sendCueReport({ enabled: false, error: '交来的代码里没有 window.__SM_CUES__ = { … }; 那句赋值——'
      + '提词表就是靠它存的，没有它烘进去也写不了' });
    return;
  }
  if (existing && !stripWatchBlock()) {
    sendCueReport({ enabled: false, error: '在 deck 里找不到旧的 watch-cues 注入块，不敢盲目再加一份'
      + '（会出现两份 __SM_CUES__，后一份覆盖前一份，Studio 改的却是前一份）' });
    return;
  }
  H.trailing += '\n<!--sm-watch-cues-start-->\n<script>\n' + js + '\n</' + 'script>\n<!--sm-watch-cues-end-->\n';
  // 升级：提词表原样写回新块。全新开启：坐实成空表——不用等预览 iframe 重渲染完
  // 再去读，那一步是异步的，紧接着的写入会扑空。
  if (existing) { persistCues(); } else { cueMap = {}; cueLoaded = true; }
  markDirty();
  renderHtmlEdit();          // 让预览把新脚本跑起来（✦提词 按钮也才会出现）
  setTimeout(syncExportToBridge, 500);
  if (!($('[data-hpane="script"]') as HTMLElement | null)?.hidden) renderCuePane();
  toast(existing ? '提词注入代码已升级到新版（提词表保留）' : '已开启 watch mode —— 现在可以写提词了');
  sendCueReport({ enabled: true, upgraded: !!existing });
}

function undoCuePatch(): void {
  if (!cueUndo) return;
  cueMap = cueUndo; cueUndo = null; cueAiCount = 0;
  persistCues(); renderCuePane(); toast('已还原到 Claude 写入之前');
}

/** 全 deck 一眼：几页有提词、几页不合规。**讲台上才发现缺页就晚了** */
function cueDeckSummary(map: Record<string, string[]>): { have: number; total: number; bad: number } {
  let have = 0; let bad = 0;
  htmlSlides.forEach((_s, i) => {
    const vals = map[slideAnchor(i)] || [];
    if (!vals.length) return;
    have++;
    if (cueIssues(vals).length) bad++;
  });
  return { have, total: htmlSlides.length, bad };
}

/** 下一个还没提词 / 提词不合规的页（从当前页往后绕一圈）。-1 = 全都过关了 */
function nextCueTodo(map: Record<string, string[]>): number {
  const n = htmlSlides.length;
  for (let k = 1; k <= n; k++) {
    const i = (cur + k) % n;
    if (cueIssues(map[slideAnchor(i)] || []).length) return i;
  }
  return -1;
}

// ---------------- 讲稿批注（notes） ----------------
//
// **讲稿不给直接编辑的入口，这是产品决策不是技术妥协**（2026-08-20 定）。
// 讲稿带着锚点、`p.cue` 讲法块、`.golden` 金句块、`.data` 数据块——人手直接改必然
// 弄漂这些结构，副屏同步和提词抽取会跟着一起坏。所以这里只做「读 + 划一段 + 加批注」，
// 真正的改写交给 Claude；它回填的时候 **Studio 还要验一遍锚点在不在**
// （见 applyNotesPatch）——把「别弄丢锚点」变成代码里的一道闸，而不是 prompt 里的一句嘱咐。
//
// 讲稿存在一体版 deck 的 `window.__TXB64__` 里（整份讲稿 HTML 的 base64）。和提词一样，
// 它落在 `#deck` 之外，apply_patch 够不着 —— 所以又是一条独立通道。
let notesDoc: Document | null = null;
let notesLoaded = false;

function loadNotes(): Document | null {
  if (notesLoaded) return notesDoc;
  if (!previewReady()) return null;   // 同 loadCues：没起来就别缓存"没有"
  notesLoaded = true;
  const b64 = (previewWin() as (Window & { __TXB64__?: string }) | null)?.__TXB64__;
  if (!b64) return null;
  let html = '';
  try { html = decodeURIComponent(escape(atob(b64))); } catch { return null; }
  try { notesDoc = new DOMParser().parseFromString(html, 'text/html'); } catch { notesDoc = null; }
  return notesDoc;
}

/** 一个锚点块 = `h3#anchor` 本身 + 到下一个 h3 / 段封面之前的所有兄弟。
 *  这就是「这一页的讲稿」，副屏整块高亮划的也是同一条线。 */
function noteBlock(doc: Document, anchor: string): Element[] | null {
  const h = doc.getElementById(anchor);
  if (!h) return null;
  const out: Element[] = [h];
  let n = h.nextElementSibling;
  while (n && !n.matches('h3, .seg-cover')) { out.push(n); n = n.nextElementSibling; }
  return out;
}
function noteBlockHtml(doc: Document, anchor: string): string | null {
  const els = noteBlock(doc, anchor);
  return els ? els.map((e) => e.outerHTML).join('\n') : null;
}

/** 写回 deck 文本里的 `__TXB64__`。找不到那句赋值就返回 false —— **不静默失败** */
function persistNotes(): boolean {
  if (!notesDoc) return false;
  const html = '<!DOCTYPE html>\n' + notesDoc.documentElement.outerHTML;
  let b64 = '';
  try { b64 = btoa(unescape(encodeURIComponent(html))); } catch { return false; }
  const re = /(window\.__TXB64__\s*=\s*)(['"])[A-Za-z0-9+/=\s]*\2/;
  let done = false;
  for (const key of ['trailing', 'prelude'] as const) {
    if (!done && re.test(H[key])) {
      H[key] = H[key].replace(re, (_m, a: string, q: string) => a + q + b64 + q);
      done = true;
    }
  }
  if (done) markDirty();
  return done;
}

function pageOfAnchor(a: string): number {
  for (let i = 0; i < htmlSlides.length; i++) if (slideAnchor(i) === a) return i + 1;
  return 0;
}

interface NoteAnn { id: string; anchor: string; page: number; quote: string; note: string }
let noteAnns: NoteAnn[] = [];
let noteAnnSeq = 0;
/** 刚在讲稿里划中、还没写批注的那一段 */
let notePick: { anchor: string; quote: string } | null = null;

function notesFrame(): HTMLIFrameElement | null { return $('#notesFrame') as HTMLIFrameElement | null; }

/** 讲稿原样进 iframe（它自带 CSS，换一套只会看着不像自己），另外注入选中 → 加批注的那点交互 */
function notesFrameHtml(doc: Document): string {
  const inject = '<style>'
    + '.sm-ann{background:#ffe9a8;box-shadow:0 0 0 1px #e0c063;border-radius:2px}'
    + '#sm-annbtn{position:absolute;z-index:99;font:600 12px/1 system-ui,-apple-system,sans-serif;padding:7px 11px;'
    + 'border:0;border-radius:7px;background:#1c1c1f;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.32)}'
    + '.sm-cur{outline:2px solid rgba(184,58,38,.35);outline-offset:6px;border-radius:3px}'
    // 重新打开时黄色高亮是复原不了的（那是包在选区上的 <mark>，iframe 一重载就没了）。
    // 所以至少让「这一段有批注」看得见——否则关掉再打开，批注像是凭空消失了。
    + '.sm-annd{position:relative}'
    + '.sm-annd::after{content:"批注";position:absolute;margin-left:.6em;font:600 10px/1.6 system-ui,sans-serif;'
    + 'letter-spacing:.08em;color:#8a6a2a;background:#ffe9a8;border-radius:3px;padding:2px 6px;vertical-align:middle}'
    + '</style>'
    + '<script>' + NOTES_FRAME_JS + '<\/script>';
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML.replace(/<\/body>/i, inject + '</body>');
}

function openNotes(): void {
  if (mode !== 'html') { toast('讲稿只对导入的 HTML deck 可用', true); return; }
  const doc = loadNotes();
  const m = $('#notesModal'); if (m) (m as HTMLElement).style.display = 'flex';
  const frame = notesFrame();
  const empty = $('#notesEmpty');
  if (!doc) {
    if (frame) (frame as HTMLElement).style.display = 'none';
    if (empty) { (empty as HTMLElement).style.display = ''; }
    renderNoteAnns();
    return;
  }
  if (empty) (empty as HTMLElement).style.display = 'none';
  const ub = $('#notesUndoBtn'); if (ub) (ub as HTMLElement).style.display = notesUndo ? '' : 'none';
  if (frame) {
    (frame as HTMLElement).style.display = '';
    frame.onload = () => {
      // 打开就停在当前页对应的那一段——45 页的讲稿里自己找是没人愿意做的事
      const a = slideAnchor(cur);
      try {
        frame.contentWindow?.postMessage({ type: 'sm-note-goto', anchor: a }, '*');
        pushAnnAnchors();
      } catch { /* noop */ }
    };
    frame.srcdoc = notesFrameHtml(doc);
  }
  renderNoteAnns();
}
function closeNotes(): void { const m = $('#notesModal'); if (m) (m as HTMLElement).style.display = 'none'; }
function pushAnnAnchors(): void {
  const anchors = Array.from(new Set(noteAnns.map((a) => a.anchor).filter(Boolean)));
  try { notesFrame()?.contentWindow?.postMessage({ type: 'sm-note-anchors', anchors }, '*'); } catch { /* noop */ }
}

/** 讲稿 iframe 里划中了一段 */
function onNotePick(anchor: string, quote: string): void {
  notePick = { anchor, quote };
  const box = $('#notePickBox'); if (box) (box as HTMLElement).style.display = '';
  const q = $('#notePickQuote'); if (q) q.textContent = quote.length > 90 ? quote.slice(0, 90) + '…' : quote;
  const pg = $('#notePickWhere');
  if (pg) {
    const p = pageOfAnchor(anchor);
    pg.textContent = anchor ? (p ? `第 ${p} 页 · ${anchor}` : `锚点 ${anchor}`) : '⚠ 这段不在任何锚点下，批注会挂在整份讲稿上';
  }
  const t = $('#noteText') as HTMLTextAreaElement | null;
  if (t) { t.value = ''; t.focus(); }
}

function addNoteAnn(): void {
  const t = $('#noteText') as HTMLTextAreaElement | null;
  const txt = (t?.value || '').trim();
  if (!notePick) { toast('先在讲稿里划中一段', true); return; }
  if (!txt) { toast('写一句要改什么', true); return; }
  const id = 'ann-' + (++noteAnnSeq);
  noteAnns.push({ id, anchor: notePick.anchor, page: pageOfAnchor(notePick.anchor), quote: notePick.quote, note: txt });
  // 让 iframe 把刚才那段标黄——批注挂在哪儿要看得见，否则划完就消失，等于没挂
  try { notesFrame()?.contentWindow?.postMessage({ type: 'sm-note-mark', id }, '*'); } catch { /* noop */ }
  notePick = null;
  if (t) t.value = '';
  const box = $('#notePickBox'); if (box) (box as HTMLElement).style.display = 'none';
  renderNoteAnns(); refreshTasks(); pushAnnAnchors();
  toast('已加批注 —— 在「AI 待办」里一键发送');
}
function removeNoteAnn(id: string): void {
  noteAnns = noteAnns.filter((a) => a.id !== id);
  renderNoteAnns(); refreshTasks(); pushAnnAnchors();
}
function renderNoteAnns(): void {
  const box = $('#noteList'); if (!box) return;
  const n = $('#noteCount'); if (n) n.textContent = noteAnns.length ? `${noteAnns.length} 条批注` : '还没有批注';
  if (!noteAnns.length) {
    box.innerHTML = '<div class="qempty">在左边讲稿里划一段文字，会浮出「加批注」。<br><br>'
      + '批注挂在<b>锚点</b>上（跟着那一段走，不是行号），汇总进「AI 待办」，一键发给 Claude 改写。</div>';
    return;
  }
  box.innerHTML = '';
  noteAnns.forEach((a) => {
    const row = document.createElement('div'); row.className = 'annrow';
    row.innerHTML = `<div class="annhead"><span class="todochip note">${a.page ? '第 ' + a.page + ' 页' : '整份'}</span>`
      + `<code>${esc(a.anchor || '—')}</code><button class="todo-del" title="删掉这条批注" aria-label="移除">✕</button></div>`
      + `<div class="annquote">${esc(a.quote.length > 120 ? a.quote.slice(0, 120) + '…' : a.quote)}</div>`
      + `<div class="annnote">${esc(a.note)}</div>`;
    row.querySelector('.todo-del')!.addEventListener('click', () => removeNoteAnn(a.id));
    row.querySelector('.annquote')!.addEventListener('click', () => {
      try { notesFrame()?.contentWindow?.postMessage({ type: 'sm-note-goto', anchor: a.anchor }, '*'); } catch { /* noop */ }
    });
    box.appendChild(row);
  });
}

/** 给 Claude 的那一段：批注 + 原文块 + 硬约束。**原文块必须带上**——不给原文，
 *  它只能靠猜，锚点和讲法块十有八九活不下来。 */
function aiNotesBlock(): string {
  const doc = loadNotes();
  const byAnchor: Record<string, NoteAnn[]> = {};
  noteAnns.forEach((a) => { (byAnchor[a.anchor] = byAnchor[a.anchor] || []).push(a); });
  const secs = Object.keys(byAnchor).map((anchor) => {
    const anns = byAnchor[anchor];
    const p = anns[0].page;
    const src = (doc && anchor) ? noteBlockHtml(doc, anchor) : null;
    return `### 锚点 \`${anchor || '（整份）'}\`${p ? ` · 第 ${p} 页` : ''}\n\n`
      + anns.map((a) => `- 划中：「${a.quote}」\n  批注：${a.note}`).join('\n')
      + (src ? `\n\n当前讲稿原文（这一整块，改写后原样替换它）：\n\n${FENCE}html\n${src}\n${FENCE}\n` : '\n');
  }).join('\n');
  return `## 讲稿批注（用 \`slidesmith_notes\` 回写，**不要用 apply_patch**）

用户在讲稿上划了几段、各写了一条批注。请按批注改写对应的**整个锚点块**，
然后用 \`slidesmith_notes\` 的 \`set\` 写回：\`{ "锚点": "改写后的整块 HTML" }\`。

**改写时不许破的**：
1. \`<h3 ... id="锚点">\` 必须原样留着（id 一个字都不能改，Studio 会验，丢了直接拒收）。
2. 讲法块 \`<p class="cue">\` / 金句块 \`<div class="golden">\` / 数据块 \`<div class="data">\`
   该在的还在——除非批注明确说要删。
3. \`<strong>\` 是提词的种子（手表上会显示），别整段加粗、也别全去掉。
4. 只动被批注的那几块，别顺手重写整份讲稿。

${secs}
---
`;
}

// 注入讲稿 iframe 的那点交互：划一段 → 浮出「加批注」→ 告诉父窗口。
// **按钮放在 iframe 里面**，不是父窗口——不然选区坐标要跨窗口换算，滚动一次就飘了。
const NOTES_FRAME_JS = `(function(){
  var btn = document.createElement('button');
  btn.id = 'sm-annbtn'; btn.type = 'button'; btn.textContent = '加批注'; btn.style.display = 'none';
  document.body.appendChild(btn);
  var pending = null;
  function anchorOf(node){
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (el && el !== document.body) {
      var p = el;
      while (p) { if (p.tagName === 'H3' && p.id) return p.id; p = p.previousElementSibling; }
      el = el.parentElement;
    }
    return '';
  }
  document.addEventListener('mouseup', function(){
    setTimeout(function(){
      var sel = document.getSelection();
      if (!sel || sel.isCollapsed) { btn.style.display = 'none'; pending = null; return; }
      var txt = String(sel.toString()).replace(/\\s+/g, ' ').trim();
      if (!txt) { btn.style.display = 'none'; pending = null; return; }
      var r = sel.getRangeAt(0), box = r.getBoundingClientRect();
      pending = { anchor: anchorOf(r.startContainer), quote: txt, range: r.cloneRange() };
      btn.style.left = Math.max(4, box.left + window.scrollX) + 'px';
      btn.style.top = (box.bottom + window.scrollY + 6) + 'px';
      btn.style.display = '';
    }, 0);
  });
  btn.addEventListener('mousedown', function(e){ e.preventDefault(); });
  btn.addEventListener('click', function(){
    if (!pending) return;
    try { parent.postMessage({ type: 'sm-note-pick', anchor: pending.anchor, quote: pending.quote }, '*'); } catch(e){}
    btn.style.display = 'none';
  });
  window.addEventListener('message', function(e){
    var d = e && e.data; if (!d) return;
    if (d.type === 'sm-note-mark') {
      if (!pending) return;
      var m = document.createElement('mark'); m.className = 'sm-ann'; m.setAttribute('data-ann', d.id || '');
      try { pending.range.surroundContents(m); }
      catch (err) { try { m.appendChild(pending.range.extractContents()); pending.range.insertNode(m); } catch (e2) {} }
      pending = null;
      var s = document.getSelection(); if (s) s.removeAllRanges();
    } else if (d.type === 'sm-note-anchors') {
      var had = document.querySelectorAll('.sm-annd');
      for (var j = 0; j < had.length; j++) had[j].classList.remove('sm-annd');
      var list = d.anchors || [];
      for (var k = 0; k < list.length; k++) {
        var t = document.getElementById(list[k]); if (t) t.classList.add('sm-annd');
      }
    } else if (d.type === 'sm-note-goto' && d.anchor) {
      var el = document.getElementById(d.anchor); if (!el) return;
      var old = document.querySelectorAll('.sm-cur');
      for (var i = 0; i < old.length; i++) old[i].classList.remove('sm-cur');
      el.classList.add('sm-cur');
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
})();`;

// ---------- 讲稿的对外接口：Claude ↔ 桥 ↔ 这里 ----------
interface NotePageInfo { index: number; anchor: string; title: string; chars: number; annotations: { quote: string; note: string }[]; html?: string }
/** Claude 上一次改写之前的整份讲稿 —— 撤销用 */
let notesUndo: string | null = null;
let notesAiCount = 0;

function notesReport(wantHtml: string[] = [], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const doc = mode === 'html' ? loadNotes() : null;
  const want = new Set(wantHtml);
  const pages: NotePageInfo[] = [];
  if (doc) {
    htmlSlides.forEach((s, i) => {
      const a = slideAnchor(i);
      const els = noteBlock(doc, a);
      const text = els ? els.map((e) => e.textContent || '').join(' ').replace(/\s+/g, ' ').trim() : '';
      const info: NotePageInfo = {
        index: i + 1, anchor: a, title: s.title, chars: text.length,
        annotations: noteAnns.filter((x) => x.anchor === a).map((x) => ({ quote: x.quote, note: x.note })),
      };
      // 整份讲稿一次倒出去在 45 页上就是几万 token；点名要哪几块才给全文
      if (want.has(a) || want.has(String(i + 1))) info.html = els ? els.map((e) => e.outerHTML).join('\n') : '';
      pages.push(info);
    });
  }
  return { hasNotes: !!doc, deckMode: mode, pages, ...extra };
}
function sendNotesReport(wantHtml: string[] = [], extra: Record<string, unknown> = {}): void {
  if (!bridge.connected || !bridge.ws || bridge.ws.readyState !== WebSocket.OPEN) return;
  try { bridge.ws.send(JSON.stringify({ type: 'notes', ...notesReport(wantHtml, extra) })); } catch { /* noop */ }
}

/**
 * Claude 改写完的讲稿块回填。
 *
 * ⭐ **这里是那道闸**：锚点丢了 / 改了 / 变出第二个，一律拒收并原样报回去。
 * 讲稿之所以不给人直接编辑，就是怕锚点被弄漂；换成 AI 来写，同一个风险还在——
 * 所以把「锚点必须活着」写成代码，而不是 prompt 里的一句嘱咐。
 */
function applyNotesPatch(incoming: Record<string, string>): void {
  if (mode !== 'html') { sendNotesReport([], { applied: 0, error: '当前不是 HTML deck' }); return; }
  const doc = loadNotes();
  if (!doc) {
    sendNotesReport([], { applied: 0, error: '这份 deck 里没有内嵌讲稿（找不到 window.__TXB64__）。'
      + '三文件联动版的讲稿在隔壁文件里，Studio 读不到——一体版才行。' });
    return;
  }
  const before = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  const rejected: { anchor: string; why: string }[] = [];
  const okAnchors: string[] = [];
  Object.keys(incoming).forEach((anchor) => {
    const els = noteBlock(doc, anchor);
    if (!els) { rejected.push({ anchor, why: '讲稿里没有这个锚点' }); return; }
    let frag: Document;
    try { frag = new DOMParser().parseFromString(String(incoming[anchor] || ''), 'text/html'); }
    catch { rejected.push({ anchor, why: 'HTML 解析失败' }); return; }
    const kids = Array.prototype.slice.call(frag.body.children) as Element[];
    if (!kids.length) { rejected.push({ anchor, why: '改写后是空的' }); return; }
    // 先问"锚点还在不在"，再问"在不在该在的位置"——顺序反了的话，被包进 <div> 的
    // 锚点会收到"你把锚点弄丢了"这种指错方向的说法。
    if (!frag.getElementById(anchor)) { rejected.push({ anchor, why: `改写后丢了 id="${anchor}" 的标题——锚点是副屏同步和手表提词的键，不能动` }); return; }
    const heads = kids.filter((e) => e.id === anchor);
    if (!heads.length) { rejected.push({ anchor, why: `id="${anchor}" 被嵌进了别的元素里，锚点必须留在这一块的顶层` }); return; }
    if (heads.length > 1) { rejected.push({ anchor, why: `改写后出现 ${heads.length} 个 id="${anchor}"，锚点必须唯一` }); return; }
    if (heads[0] !== kids[0]) { rejected.push({ anchor, why: '锚点标题必须是这一块的第一个元素' }); return; }
    const parent = els[0].parentNode; if (!parent) { rejected.push({ anchor, why: '讲稿结构异常' }); return; }
    const holder = doc.createDocumentFragment();
    kids.forEach((k) => holder.appendChild(doc.importNode(k, true)));
    parent.insertBefore(holder, els[0]);
    els.forEach((e) => e.remove());
    okAnchors.push(anchor);
  });
  if (okAnchors.length) {
    if (!persistNotes()) {
      // 写不回去就得把内存里那份也退回去，否则界面和文件从此各说各话
      try { notesDoc = new DOMParser().parseFromString(before, 'text/html'); } catch { /* noop */ }
      sendNotesReport([], { applied: 0, rejected, error: 'deck 里找不到 window.__TXB64__ = "…" 那句赋值，讲稿写不回去' });
      return;
    }
    notesUndo = before; notesAiCount = okAnchors.length;
    // 改过的那几块的批注算办完了，从待办里撤掉
    noteAnns = noteAnns.filter((a) => okAnchors.indexOf(a.anchor) < 0);
    refreshTasks();
    if ($('#notesModal') && ($('#notesModal') as HTMLElement).style.display !== 'none') openNotes();
    toast('Claude 改写了 ' + okAnchors.length + ' 段讲稿' + (rejected.length ? `，${rejected.length} 段被拒` : ''));
    setTimeout(syncExportToBridge, 300);
  }
  sendNotesReport([], { applied: okAnchors.length, appliedAnchors: okAnchors, rejected });
}

function undoNotesPatch(): void {
  if (!notesUndo) return;
  try { notesDoc = new DOMParser().parseFromString(notesUndo, 'text/html'); } catch { return; }
  notesUndo = null; notesAiCount = 0;
  persistNotes(); openNotes(); toast('已还原到 Claude 改写之前');
}

function smRoomId(): string {
  const a = new Uint8Array(12); (window.crypto || crypto).getRandomValues(a);
  return Array.from(a).map((b) => ('0' + b.toString(16)).slice(-2)).join('');
}
function isTextLeaf(el: Element): boolean {
  if (el.querySelector('div,section,ul,ol,li,figure,table,svg,img,canvas,iframe,p,h1,h2,h3,h4,h5,h6,blockquote')) return false;
  return (el.textContent || '').trim().length > 0;
}
function wireFullDeckEditing(d: Document): void {
  d.querySelectorAll('#deck .slide').forEach((slide) => {
    slide.querySelectorAll('*').forEach((el) => { if (isTextLeaf(el)) (el as HTMLElement).setAttribute('contenteditable', 'true'); });
  });
  // **deck 自己顶栏上的标题也要能改。** 它在 #deck 之外（属于 H.prelude），
  // 所以既点不动、AI 也够不着——用户看着"贵州财经大学"却没有任何地方能改成
  // "正大管理学院"。这里把那两行文字放开，harvestTopbar() 负责写回 prelude。
  d.querySelectorAll('body > .topbar .topbar__brand, body > .topbar .topbar__sub')
    .forEach((el) => (el as HTMLElement).setAttribute('contenteditable', 'true'));
  const deckEl = d.querySelector('#deck'); if (!deckEl) return;
  deckEl.addEventListener('click', (e) => {
    followSlideFromDeck(e.target);   // 点哪一页，左栏就跟到哪一页（点空白也算）
    let t = e.target as Node | null; while (t && t.nodeType !== 1) t = (t as Node).parentNode;
    const el = t as HTMLElement | null;
    // a click on the slide background / empty area (not a leaf element) clears the selection, Keynote-style
    if (!el || !el.closest('#deck .slide') || el.classList.contains('slide')) { deselectHtml(); return; }
    if (htmlSelEl) (htmlSelEl as HTMLElement).classList.remove('sm-sel');
    htmlSelEl = el; el.classList.add('sm-sel'); showHtmlSel(true, el); showGizmo(el);
    revealElementTab();
  }, true);
  // a click anywhere outside the deck (iframe margins / gaps between slides) also clears it — but never on the gizmo handles
  d.addEventListener('click', (e) => {
    const tg = e.target as HTMLElement | null;
    if (!tg || tg.closest('#deck') || tg.closest('.sm-gizmo')) return;
    deselectHtml();
  }, true);
  // keep the move/resize gizmo glued to the element while the deck scrolls or rescales
  // (the gizmo is position:fixed, so without this it detaches and floats on screen)
  try {
    const win = d.defaultView as Window;
    win.addEventListener('scroll', () => positionGizmo(), true); // capture: also catch scroll on inner scrollers
    win.addEventListener('resize', () => positionGizmo());
  } catch { /* noop */ }
}
function renderHtmlEdit(): void {
  const ifr = $('#preview') as HTMLIFrameElement;
  htmlSelEl = null; showHtmlSel(false);
  let done = false, tries = 0;
  // Wire as soon as the deck DOM is parsed — do NOT wait for the iframe `load`
  // event, which blocks on the deck's external font <link> (stalls offline) and
  // would leave contentEditable + click-to-select unattached.
  const ready = (): boolean => {
    if (done) return true;
    const d = ifr.contentDocument;
    if (!d || !d.querySelector('#deck .slide')) return false;
    done = true;
    wireFullDeckEditing(d); updateAiTarget(); startHtmlNavSync();
    // 挂在 deck 自己的 resize 监听「之后」注册——同一事件按注册顺序触发，
    // 所以 deck 先按它的公式写一遍，我们再按实际可用宽度覆盖掉。
    try { (d.defaultView as Window).addEventListener('resize', () => refitPreview()); } catch { /* noop */ }
    // 退出全屏时 resize 和 fullscreenchange 谁先谁后没保证：万一 resize 先到、那会儿
    // body.present 还在，我们会让路，deck 写的播放态尺寸就留下了（幻灯片卡在小尺寸）。
    // 等一拍再算一次，稳。
    try { d.addEventListener('fullscreenchange', () => setTimeout(() => refitPreview(), 60)); } catch { /* noop */ }
    applyDeckChrome();
    // **不能赌谁先注册。** ready() 是在 deck DOM 一解析出来就跑的，那时候 deck 尾部
    // 那段引擎脚本还没执行；它一执行就按自己的公式（减掉段导航的 300px）写一遍
    // --fit-scale，把我们刚算好的覆盖掉——表现就是"首屏没铺满，⌘R 之后才对"。
    // 隔几拍各补一次，再加一次 load 兜底，谁最后跑都不影响结果。
    [60, 250, 700, 1500].forEach((ms) => setTimeout(() => { refitPreview(); refreshDeckTokenInputs(); }, ms));
    ifr.addEventListener('load', () => setTimeout(() => refitPreview(), 60), { once: true });
    // never-lose-work + history for text edits done straight in the deck DOM
    d.addEventListener('input', (e) => { followSlideFromDeck(e.target); markDirty(); }, true);
    d.addEventListener('focusin', (e) => {
      followSlideFromDeck(e.target);   // 光标一落进某页就跟过去，不用等打字
      if ((e.target as HTMLElement)?.isContentEditable) pushHistory('text');
    }, true);
    // paste an image straight onto a slide → inline it
    d.addEventListener('paste', (e) => {
      const items = (e as ClipboardEvent).clipboardData?.items; if (!items) return;
      for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image/') === 0) { const f = items[i].getAsFile(); if (f) { e.preventDefault(); const r = new FileReader(); r.onload = () => placeImage(String(r.result)); r.readAsDataURL(f); return; } } }
    }, true);
    // forward save/undo/redo shortcuts pressed while focus is inside the deck iframe
    d.addEventListener('keydown', (e) => {
      const meta = e.metaKey || e.ctrlKey; if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); void saveHtmlInPlace(); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    }, true);
    if (htmlGotoAfterRender >= 0) { const t = htmlGotoAfterRender; htmlGotoAfterRender = -1; setTimeout(() => selectHtmlSlide(t), 120); }
    return true;
  };
  ifr.onload = ready;
  ifr.srcdoc = assembleDeck(true);
  const poll = setInterval(() => { if (ready() || ++tries > 80) clearInterval(poll); }, 50);
}
// strip the editing/engine cruft so an exported <section> is clean + re-importable
function cleanSectionHtml(s: Element, id?: string): string {
  const c = s.cloneNode(true) as Element;
  c.classList.remove('active', 'sm-reveal', 'sm-sel', 'sm-play', 'sm-armed', 'sm-exit');
  c.removeAttribute('contenteditable'); c.removeAttribute('data-global-idx');
  if (id) c.setAttribute('data-id', id); // keep the stable addressing key
  (c as HTMLElement).style.removeProperty('--sm-fit');
  // `--sc` 是 deck 引擎在播放态按**当时那块屏**算出来写进 style 的，纯运行时产物。
  // 不剥的话它会被 outerHTML 原样烤进保存 / 导出的文件（实测用户那份 deck 里躺了 4 个
  // `--sc: 0.4619`），换一块屏再播放，第一帧就是错的。
  (c as HTMLElement).style.removeProperty('--sc');
  c.querySelectorAll('.chrome').forEach((e) => e.remove()); // engine-injected page footer
  c.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
  c.querySelectorAll('.sm-sel').forEach((e) => e.classList.remove('sm-sel'));
  if (!c.getAttribute('class')) c.removeAttribute('class');
  return c.outerHTML;
}
function harvestAll(): void {
  if (mode !== 'html') return;
  const d = ($('#preview') as HTMLIFrameElement).contentDocument; if (!d) return;
  d.querySelectorAll('#deck .slide').forEach((s, i) => { if (htmlSlides[i]) htmlSlides[i].html = cleanSectionHtml(s, htmlSlides[i].id); });
  harvestTopbar(d);
}
/**
 * 把 deck 顶栏上改过的标题写回 `H.prelude`。
 *
 * **只搬文字，不搬结构。** prelude 里还躺着 `__SM_CUES__` / 讲稿那些 script，
 * 整块重新序列化风险太大；这里把 prelude 解析成一棵离线的 DOM，只替换那两个
 * 元素的 textContent，再序列化回去——脚本原样保留。
 */
function harvestTopbar(d: Document): void {
  const live = d.querySelector('body > .topbar');
  if (!live || !H.prelude) return;
  const holder = document.createElement('div');
  holder.innerHTML = H.prelude;
  const target = holder.querySelector('.topbar');
  if (!target) return;
  let changed = false;
  ['.topbar__brand', '.topbar__sub'].forEach((sel) => {
    const a = live.querySelector(sel), b = target.querySelector(sel);
    if (!a || !b) return;
    const next = a.textContent || '';
    if ((b.textContent || '') !== next) { b.textContent = next; changed = true; }
  });
  if (changed) H.prelude = holder.innerHTML;
}
/** 左栏高亮跟到第 cur 行，并把它滚进可视区 —— 44 页的列表里只换个底色是看不见的。 */
function markLeftActive(): void {
  let row: HTMLElement | null = null;
  document.querySelectorAll('#slides .srow').forEach((r, idx) => {
    const on = idx === cur; r.classList.toggle('active', on); if (on) row = r as HTMLElement;
  });
  const box = $('#slides'); if (!row || !box) return;
  const br = box.getBoundingClientRect(), rr = (row as HTMLElement).getBoundingClientRect();
  let dy = 0;
  if (rr.top < br.top + 6) dy = rr.top - br.top - 6;
  else if (rr.bottom > br.bottom - 6) dy = rr.bottom - br.bottom + 6;
  if (dy) { try { box.scrollTo({ top: box.scrollTop + dy, behavior: 'smooth' }); } catch { box.scrollTop += dy; } }
}
/** 用户在预览里点了 / 改了某一页 → 让「当前页」跟过去。
 *  和 selectHtmlSlide 的区别：**不滚动预览**（人正看着那一页，把它滚走很讨厌），
 *  也不清掉选中元素（就是它把我们带过来的）。
 *  不只是左栏好看：`cur` 同时决定「本页」的修改意见记到哪一页、提词面板显示哪一页、
 *  以及报给桥/app 的选中页 —— 不跟着走的话，在第 8 页写的意见会记到第 1 页去。 */
function followSlideFromDeck(node: EventTarget | null): void {
  if (mode !== 'html') return;
  const d = ($('#preview') as HTMLIFrameElement | null)?.contentDocument; if (!d) return;
  const n = node as Node | null;
  const start = (n && n.nodeType === 1 ? n as Element : n?.parentElement || null);
  const sec = start?.closest('#deck .slide'); if (!sec) return;
  const all = Array.prototype.slice.call(d.querySelectorAll('#deck .slide')) as Element[];
  const i = all.indexOf(sec); if (i < 0 || i === cur) return;
  cur = i;
  // 跟 nav-poll 对表：记下 deck **此刻**认为的活动页，等它自己变了（用户用 deck 自己的
  // 翻页/方向键）再让 poll 接管。直接写 i 的话，有 .active 的 deck 会在 300ms 内把我们扳回去。
  lastSyncIdx = activeSlideIndex();
  markLeftActive();
  if (!($('[data-hpane="script"]') as HTMLElement | null)?.hidden) renderCuePane();
  updateAiTarget();
}
function selectHtmlSlide(i: number): void {
  cur = Math.max(0, Math.min(htmlSlides.length - 1, i));
  // 提词是按页的，换页就得重画（面板没开着时这一步很廉价，直接 return）
  if (!($('[data-hpane="script"]') as HTMLElement | null)?.hidden) renderCuePane();
  lastSyncIdx = cur; // we are the source of truth now; keep the nav-poll in step
  if (htmlSelEl) deselectHtml(); // a selection on the old page no longer applies
  markLeftActive();
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  if (d) {
    const thumb = d.querySelector(`.thumb[data-idx="${cur}"]`) as HTMLElement | null;
    if (thumb) thumb.click();
    else {
      const el = d.querySelectorAll('#deck .slide')[cur] as HTMLElement | undefined;
      const target = (el?.closest('.slide-wrap') as HTMLElement | null) || el;
      try { target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* noop */ }
    }
  }
  updateAiTarget();
}
// —— inspector: tokens / theme / selected-element style + anim ——
/** 选中元素后，把右栏拨到「格式」——除非已经停在同样按元素工作的「动画」上。 */
function revealElementTab(): void {
  const act = document.querySelector('.htab.active') as HTMLElement | null;
  const cur = act?.dataset.htab || '';
  if (cur === 'fmt' || cur === 'anim') return;
  (document.querySelector('.htab[data-htab="fmt"]') as HTMLElement | null)?.click();
}
function showHtmlSel(on: boolean, el?: HTMLElement): void {
  if (!on) hideGizmo();
  // toggle every "selected element" panel (格式 + 动画效果 tabs) and their empty-state hints
  document.querySelectorAll('#htmlpanel .hselon').forEach((e) => ((e as HTMLElement).style.display = on ? '' : 'none'));
  document.querySelectorAll('#htmlpanel .hseloff').forEach((e) => ((e as HTMLElement).style.display = on ? 'none' : ''));
  if (!on || !el) return;
  const cls = String(el.getAttribute('class') || '').split(' ').filter((c) => c && c !== 'sm-sel')[0];
  const tag = el.tagName.toLowerCase() + (cls ? ' .' + cls : '');
  const t1 = $('#hSelTag'), t2 = $('#hSelTag2'); if (t1) t1.textContent = tag; if (t2) t2.textContent = tag;
  const cs = el.ownerDocument!.defaultView!.getComputedStyle(el);
  (($('#hFont') as HTMLSelectElement)).value = fontIdForStack(el.style.fontFamily);
  (($('#hFs') as HTMLInputElement)).value = el.style.fontSize ? String(parseInt(el.style.fontSize, 10)) : '';
  (($('#hColor') as HTMLInputElement)).value = toHex(el.style.color || cs.color) || '#000000';
  syncSwatches();
  (($('#hWeight') as HTMLSelectElement)).value = el.style.fontWeight || '';
  // bold / italic / underline toggles reflect the element's current inline style
  const wt = parseInt(el.style.fontWeight || '', 10);
  toggleBtn('#hBold', wt >= 600);
  toggleBtn('#hItalic', el.style.fontStyle === 'italic');
  toggleBtn('#hUnder', /underline/.test(el.style.textDecorationLine || el.style.textDecoration || ''));
  const al = el.style.textAlign || '';
  toggleBtn('#hAlignL', al === 'left'); toggleBtn('#hAlignC', al === 'center'); toggleBtn('#hAlignR', al === 'right');
  (($('#hAnim') as HTMLSelectElement)).value = el.getAttribute('data-anim') || 'none';
  (($('#hEmph') as HTMLSelectElement)).value = el.getAttribute('data-emph') || 'none';
  (($('#hMotion') as HTMLSelectElement)).value = el.getAttribute('data-motion') || 'none';
  (($('#hAnimOut') as HTMLSelectElement)).value = el.getAttribute('data-anim-out') || 'none';
  renderAnimChips(el);
  const wInp = $('#hElW') as HTMLInputElement | null; if (wInp) wInp.value = el.style.width ? String(parseInt(el.style.width, 10)) : '';
  positionGizmo();
  updateAiTarget();
}
function toggleBtn(sel: string, on: boolean): void { const b = $(sel); if (b) b.classList.toggle('on', on); }
// central deselect: drop the sm-sel outline, clear state, and tear down the gizmo (showHtmlSel(false) hides it).
function deselectHtml(): void {
  if (htmlSelEl) (htmlSelEl as HTMLElement).classList.remove('sm-sel');
  htmlSelEl = null;
  showHtmlSel(false);
}
// map an element's inline font-family back to a FONT id (for the dropdown's value)
function fontIdForStack(ff: string): string {
  if (!ff) return '';
  for (const f of FONTS) { if (f.stack && (ff === f.stack || (f.family && ff.indexOf(f.family) >= 0))) return f.id; }
  return '';
}
// fill the font dropdown, grouped 离线安全 / 英文 / 中文
function populateFontSelect(sel: string): void {
  const el = $(sel) as HTMLSelectElement; if (!el) return; el.innerHTML = '';
  const d0 = document.createElement('option'); d0.value = ''; d0.textContent = '默认（主题字体）'; el.appendChild(d0);
  ([['离线安全（无需联网）', 'sys'], ['英文字体', 'en'], ['中文字体', 'cjk']] as Array<[string, FontDef['cat']]>).forEach(([label, cat]) => {
    const og = document.createElement('optgroup'); og.label = label;
    FONTS.filter((f) => f.id && f.cat === cat).forEach((f) => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.label; og.appendChild(o); });
    if (og.children.length) el.appendChild(og);
  });
}
// ---- never-lose-work: dirty flag + autosave draft ----
function markDirty(): void {
  if (mode !== 'html') return;
  dirty = true; updateDirtyBadge();
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveDraft, 1200);
}
function updateDirtyBadge(): void {
  const el = $('#dirtyDot'); if (el) el.style.display = (dirty && mode === 'html') ? '' : 'none';
}
function autosaveDraft(): void {
  if (mode !== 'html') return;
  try {
    const html = exportHtmlDeck(); // harvest + assemble (no font embed — a local draft)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: fileBase, ts: Date.now(), html }));
  } catch { /* quota exceeded (big base64 images) or serialization issue → skip */ }
}
function clearDraft(): void { try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } dirty = false; updateDirtyBadge(); }

// ---- undo / redo: snapshot the committed deck state before each mutation ----
function snapshot(): Snap { return { slides: JSON.stringify(htmlSlides), overrides: { ...H.overrides }, theme: H.theme, skin: H.skin, fx: fxMode, cur }; }
// call BEFORE a mutation. tag coalesces rapid same-kind edits (e.g. dragging a color) into one step.
function pushHistory(tag = ''): void {
  if (mode !== 'html') return;
  const now = Date.now();
  if (tag && tag === lastPushTag && now - lastPushAt < 700) { lastPushAt = now; return; }
  harvestAll(); // capture current text edits living in the iframe DOM
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = []; lastPushAt = now; lastPushTag = tag;
  updateUndoButtons();
}
function restoreSnap(s: Snap): void {
  htmlSlides = JSON.parse(s.slides) as HtmlSlide[];
  H.overrides = { ...s.overrides }; H.theme = s.theme; H.skin = s.skin || ''; fxMode = s.fx;
  const fxSel = $('#hFxMode') as HTMLSelectElement | null; if (fxSel) fxSel.value = fxMode;
  htmlGotoAfterRender = Math.max(0, Math.min(s.cur, htmlSlides.length - 1));
  htmlSelEl = null; showHtmlSel(false);
  renderLeft(); renderHtmlEdit(); refreshHtmlInspector();
}
function undo(): void {
  if (mode !== 'html' || !undoStack.length) return;
  harvestAll(); redoStack.push(snapshot());
  restoreSnap(undoStack.pop() as Snap);
  lastPushTag = ''; markDirty(); updateUndoButtons(); toast('已撤销');
}
function redo(): void {
  if (mode !== 'html' || !redoStack.length) return;
  harvestAll(); undoStack.push(snapshot());
  restoreSnap(redoStack.pop() as Snap);
  lastPushTag = ''; markDirty(); updateUndoButtons(); toast('已重做');
}
function updateUndoButtons(): void {
  const u = $('#undoBtn') as HTMLButtonElement | null; if (u) u.disabled = undoStack.length === 0;
  const r = $('#redoBtn') as HTMLButtonElement | null; if (r) r.disabled = redoStack.length === 0;
}

// ---- insert an image (HTML mode): file-picker or paste → base64 inlined <img> ----
function insertImageFromFile(): void {
  if (mode !== 'html') { toast('请先导入 HTML deck', true); return; }
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => placeImage(String(r.result)); r.readAsDataURL(f);
  });
  inp.click();
}
function placeImage(dataUrl: string): void {
  const d = ($('#preview') as HTMLIFrameElement).contentDocument; if (!d) return;
  pushHistory('img');
  const img = d.createElement('img');
  img.src = dataUrl; img.setAttribute('alt', '图片');
  img.style.maxWidth = '100%'; img.style.height = 'auto'; img.style.display = 'block'; img.style.borderRadius = '12px';
  // insert after the selected element, else append to the active slide's content area
  if (htmlSelEl && (htmlSelEl as HTMLElement).closest('#deck .slide')) {
    (htmlSelEl as HTMLElement).insertAdjacentElement('afterend', img);
  } else {
    const active = d.querySelector('#deck .slide.active') || d.querySelector('#deck .slide');
    const host = (active && (active.querySelector('.fill') || active)) as HTMLElement | null;
    if (host) host.appendChild(img);
  }
  if (htmlSelEl) (htmlSelEl as HTMLElement).classList.remove('sm-sel');
  htmlSelEl = img; img.classList.add('sm-sel'); showHtmlSel(true, img); showGizmo(img);
  harvestAll(); markDirty();
  toast('已插入图片，可拖动选框上方的 ✥ 移动、右下角调整大小');
}

// ---- image tray (stage → batch hand-off to AI) ----
function extFromDataUrl(u: string): string {
  const m = u.match(/^data:image\/([a-z0-9.+-]+);/i); const t = (m ? m[1] : 'png').toLowerCase();
  return t === 'jpeg' ? 'jpg' : t === 'svg+xml' ? 'svg' : t;
}
// the page an image binds to = the page that's active when it's added (req: "在第7页加图→只排到第7页")
function currentSlideId(): string { const i = currentHtmlSlideIndex(); return htmlSlides[i]?.id || htmlSlides[0]?.id || ''; }
// load an image into the tray, measuring its natural pixel size (so the AI knows the aspect)
function addTrayImage(name: string, dataUrl: string, note = ''): void {
  const sid = currentSlideId();
  const im = new Image();
  const finish = (w: number, h: number) => {
    trayImages.push({ id: 'img-' + (++traySeq), name: name || ('image-' + traySeq), dataUrl, w, h, note, placed: false, slideId: sid });
    renderTray();
  };
  im.onload = () => finish(im.naturalWidth || 0, im.naturalHeight || 0);
  im.onerror = () => finish(0, 0); // still stage it (e.g. an SVG that didn't decode) — dims unknown
  im.src = dataUrl;
}
function slideLabel(id: string): string { const i = htmlSlides.findIndex((s) => s.id === id); return i >= 0 ? `第 ${i + 1} 页 · ${htmlSlides[i].title}` : '（未指定页）'; }
function trayFilesPicker(): void {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.addEventListener('change', () => {
    const fs = inp.files; if (!fs) return;
    Array.prototype.forEach.call(fs, (f: File) => { const r = new FileReader(); r.onload = () => addTrayImage(f.name, String(r.result)); r.readAsDataURL(f); });
  });
  inp.click();
}
function removeTrayImage(id: string): void { const i = trayImages.findIndex((t) => t.id === id); if (i >= 0) { trayImages.splice(i, 1); renderTray(); } }
function setTrayOver(on: boolean): void { const z = $('#trayDrop'); if (z) z.classList.toggle('over', on); }
// ⓘ help popovers: a single floating bubble shows a section's explanation on click of its
// "?" icon (so the panel stays clean — no inline paragraphs). Click-away / Esc / scroll closes.
function wireHelp(): void {
  const pop = $('#helpPop') as HTMLElement | null; if (!pop) return;
  let cur: HTMLElement | null = null;
  const hide = (): void => { pop.classList.remove('show'); cur = null; };
  document.addEventListener('click', (e) => {
    const ih = (e.target as HTMLElement).closest('.ihelp') as HTMLElement | null;
    if (!ih) { hide(); return; }
    e.preventDefault(); e.stopPropagation();
    if (cur === ih) { hide(); return; }
    cur = ih; pop.textContent = ih.getAttribute('data-help') || ''; pop.classList.add('show');
    const r = ih.getBoundingClientRect(); const pw = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - pw)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
}
// ---- 网页内色板 ----------------------------------------------------------
// 为什么不用原生 <input type="color">：在 Mac app（WKWebView）里它打开的是 macOS
// 取色面板，那是独立进程，每次改色要跨进程把事件送回 WebView —— 用户报的「调色要等
// 一两秒」就是这一段。网页里真正的应用只花 7ms、序列化 2ms。改成页面内控件后
// 整条路都留在 WebView 里，拖到哪就是哪。
// 实现上保留同 id 的 <input type="hidden">：既有的 refreshHtmlInspector（读 .value）
// 和 onInput（听 'input'）一行都不用改，我们只是换掉了「人怎么选色」这一层。
const SW_PRESETS: string[] = [
  '#000000', '#1c1c1f', '#3a3a3e', '#6a6a6e', '#9a9a9e', '#c9c9cd', '#ececee', '#ffffff',
  '#7b2d1c', '#b5402a', '#d4553c', '#e07a4e', '#f0b34a', '#e8c547', '#c2b280', '#8a7a52',
  '#2f5d3a', '#4f8a5b', '#7ba05b', '#2f6f5e', '#2b6a8f', '#378add', '#5a6fd0', '#7a5fb0',
  '#a8508f', '#c2456b', '#4a3f35', '#7b6a55', '#e8e6e1', '#f2ede4', '#faf8f4', '#0a0a0b',
];
let swBtn: HTMLElement | null = null;
let swH = 0, swS = 0, swV = 0;
function hexToRgb(h: string): [number, number, number] {
  const v = toHex(h) || '#888888'; const n = parseInt(v.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
}
function swatchInput(btn: HTMLElement): HTMLInputElement | null {
  return document.getElementById(btn.dataset.for || '') as HTMLInputElement | null;
}
/** 把每个色板按钮的色块 + hex 文字跟它背后的隐藏 input 对齐（程序改 .value 不发事件，得手动叫一次）。 */
function syncSwatches(): void {
  document.querySelectorAll('.swatch').forEach((el) => {
    const btn = el as HTMLElement; const inp = swatchInput(btn); if (!inp) return;
    const hex = toHex(inp.value) || '';
    const chip = btn.querySelector('.sw-chip') as HTMLElement | null;
    const txt = btn.querySelector('.sw-hex') as HTMLElement | null;
    if (chip) chip.style.background = hex || 'transparent';
    if (txt) txt.textContent = hex || '—';
  });
}
/** 本 deck 正在用的颜色 —— 配色最省事的来源就是「这份 deck 已有的颜色」。 */
function liveToken(name: string): string {
  const d = ($('#preview') as HTMLIFrameElement | null)?.contentDocument;
  if (!d || !d.defaultView || !d.documentElement) return '';
  return d.defaultView.getComputedStyle(d.documentElement).getPropertyValue(name).trim();
}
function deckTokenHex(name: string): string {
  return toHex(H.overrides[name] || liveToken(name) || H.baseTokens[name] || '');
}
function refreshDeckTokenInputs(): void {
  const tk = (name: string, id: string) => { const inp = $(id) as HTMLInputElement | null; if (inp) inp.value = deckTokenHex(name) || '#888888'; };
  tk('--accent', '#dAccent'); tk('--accent-2', '#dAccent2'); tk('--paper', '#dPaper'); tk('--ink', '#dInk');
  syncSwatches();
}
function deckSwatchColors(): string[] {
  const out: string[] = [];
  ['--accent', '--accent-2', '--accent-3', '--paper', '--paper-soft', '--ink', '--ink-3', '--good'].forEach((t) => {
    const hex = deckTokenHex(t);
    if (hex && out.indexOf(hex) < 0) out.push(hex);
  });
  return out.slice(0, 8);
}
function swCellsHtml(list: string[], cur: string): string {
  return list.map((c) => '<button type="button" class="sw-cell' + (c === cur ? ' on' : '')
    + '" data-c="' + c + '" title="' + c.toUpperCase() + '" style="background:' + c + '"></button>').join('');
}
/** 写值 = 设隐藏 input + 手动派 'input' —— 既有的 onInput 处理器照常接管，零改动。 */
function swApply(hex: string): void {
  if (!swBtn) return;
  const inp = swatchInput(swBtn); if (!inp) return;
  inp.value = hex;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  syncSwatches();
  const prev = $('#swPrev') as HTMLElement | null; if (prev) prev.style.background = hex;
  const hx = $('#swHex') as HTMLInputElement | null; if (hx && document.activeElement !== hx) hx.value = hex.toUpperCase();
  const pop = $('#swPop'); if (pop) pop.querySelectorAll('.sw-cell').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.c === hex));
}
function swPaint(): void {
  const area = $('#swArea') as HTMLElement | null, dot = $('#swDot') as HTMLElement | null;
  if (area) area.style.backgroundColor = hsvToHex(swH, 1, 1);
  if (dot) { dot.style.left = (swS * 100) + '%'; dot.style.top = ((1 - swV) * 100) + '%'; dot.style.background = hsvToHex(swH, swS, swV); }
  const hue = $('#swHue') as HTMLInputElement | null; if (hue) hue.value = String(Math.round(swH));
}
function swClose(): void {
  const pop = $('#swPop'); if (pop) pop.classList.remove('show');
  if (swBtn) swBtn.classList.remove('open');
  swBtn = null;
}
function swOpen(btn: HTMLElement): void {
  const pop = $('#swPop') as HTMLElement | null; if (!pop) return;
  refreshDeckTokenInputs();   // 打开的这一刻再对一次真值，别拿旧快照当当前色
  if (swBtn === btn) { swClose(); return; }
  swClose();
  swBtn = btn; btn.classList.add('open');
  const inp = swatchInput(btn);
  const hex = toHex(inp?.value || '') || '#888888';
  const [r, g, b] = hexToRgb(hex); const hsv = rgbToHsv(r, g, b);
  swH = hsv[0]; swS = hsv[1]; swV = hsv[2];
  const deckList = deckSwatchColors();
  const dk = $('#swDeckWrap') as HTMLElement | null;
  if (dk) { dk.style.display = deckList.length ? '' : 'none'; const g2 = dk.querySelector('.sw-grid'); if (g2) g2.innerHTML = swCellsHtml(deckList, hex); }
  const gr = $('#swGrid'); if (gr) gr.innerHTML = swCellsHtml(SW_PRESETS, hex);
  const hx = $('#swHex') as HTMLInputElement | null; if (hx) hx.value = hex.toUpperCase();
  const prev = $('#swPrev') as HTMLElement | null; if (prev) prev.style.background = hex;
  swPaint();
  pop.classList.add('show');
  // 定位：右栏贴着窗口右缘，先按按钮左对齐再夹回可视区；下方放不下就翻到上方
  const rc = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - 8 - pw)) + 'px';
  pop.style.top = (rc.bottom + 6 + ph < window.innerHeight ? rc.bottom + 6 : Math.max(8, rc.top - 6 - ph)) + 'px';
}
function wireSwatches(): void {
  const pop = $('#swPop') as HTMLElement | null; if (!pop) return;
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest('.swatch') as HTMLElement | null;
    if (btn) { e.preventDefault(); e.stopPropagation(); swOpen(btn); return; }
    if (!t.closest('#swPop')) swClose();
  });
  document.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') swClose(); });
  window.addEventListener('resize', swClose);
  pop.querySelectorAll('.sw-grid').forEach((g) => g.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest('.sw-cell') as HTMLElement | null; if (!c) return;
    const hex = c.dataset.c || ''; const [r, gg, b] = hexToRgb(hex); const hsv = rgbToHsv(r, gg, b);
    swH = hsv[0]; swS = hsv[1]; swV = hsv[2]; swPaint(); swApply(hex);
  }));
  const area = $('#swArea') as HTMLElement | null;
  if (area) {
    const pick = (ev: PointerEvent): void => {
      const r = area.getBoundingClientRect();
      swS = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      swV = Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height));
      swPaint(); swApply(hsvToHex(swH, swS, swV));
    };
    area.addEventListener('pointerdown', (e) => { area.setPointerCapture((e as PointerEvent).pointerId); pick(e as PointerEvent); });
    area.addEventListener('pointermove', (e) => { if ((e as PointerEvent).buttons) pick(e as PointerEvent); });
  }
  const hue = $('#swHue') as HTMLInputElement | null;
  if (hue) hue.addEventListener('input', () => { swH = parseFloat(hue.value) || 0; swPaint(); swApply(hsvToHex(swH, swS, swV)); });
  const hx = $('#swHex') as HTMLInputElement | null;
  if (hx) hx.addEventListener('input', () => {
    const hex = toHex(hx.value.trim().replace(/^#?/, '#')); if (!hex) return;
    const [r, g, b] = hexToRgb(hex); const hsv = rgbToHsv(r, g, b);
    swH = hsv[0]; swS = hsv[1]; swV = hsv[2]; swPaint(); swApply(hex);
  });
}
// 暂存盘：按「所属 slide」分组展示（缩略图自动换行，绝不横向滚动）。图片在导入时就绑定到
// 当时选中的页（addTrayImage 用 currentSlideId），所以不再需要每张图选页——顶部提示「导入到第 N 页」
// 跟随左侧选中；个别放错的用缩略图角上「⤴」一键移到当前选中页。
function updateTrayTarget(): void {
  const el = $('#trayTargetTxt'); if (!el) return;
  const i = currentHtmlSlideIndex(); const s = htmlSlides[i];
  el.textContent = s ? `第 ${i + 1} 页 · ${clip(s.title)}` : '（先在左侧选一页）';
}
function renderTray(): void {
  const grid = $('#trayGrid'); if (!grid) return;
  grid.innerHTML = '';
  updateTrayTarget();
  const bySlide = new Map<string, TrayImage[]>();
  trayImages.forEach((t) => { const k = t.slideId || ''; if (!bySlide.has(k)) bySlide.set(k, []); bySlide.get(k)!.push(t); });
  const inDeck = htmlSlides.map((s) => s.id).filter((id) => bySlide.has(id));
  const orphans = [...bySlide.keys()].filter((k) => !htmlSlides.some((s) => s.id === k));
  inDeck.concat(orphans).forEach((sid) => {
    const imgs = bySlide.get(sid) || [];
    const idx = htmlSlides.findIndex((s) => s.id === sid);
    const label = idx >= 0 ? `第 ${idx + 1} 页 · ${htmlSlides[idx].title}` : '页面已删 · 请移到当前页或移除';
    const group = document.createElement('div'); group.className = 'tray-group';
    const head = document.createElement('div'); head.className = 'tray-group-head' + (idx >= 0 ? ' clickable' : '');
    head.innerHTML = `<span class="tgh-label" title="${esc(label)}">${esc(label)}</span><span class="tgh-count">${imgs.length} 张</span>`;
    if (idx >= 0) head.addEventListener('click', () => selectHtmlSlide(idx));
    group.appendChild(head);
    const wrap = document.createElement('div'); wrap.className = 'tray-imgs';
    imgs.forEach((t) => {
      const cell = document.createElement('div'); cell.className = 'tray-cell' + (t.placed ? ' placed' : '');
      cell.innerHTML = `<div class="tray-thumb"><img alt="" src="${t.dataUrl}">${t.placed ? '<span class="tray-badge">已放置</span>' : ''}`
        + `<button class="tray-move" title="移到当前选中的页">⤴</button><button class="tray-del" title="移出暂存盘">✕</button></div>`
        + `<input class="tray-note" placeholder="说明（可留空）" value="${(t.note || '').replace(/"/g, '&quot;')}">`;
      cell.querySelector('.tray-del')!.addEventListener('click', () => removeTrayImage(t.id));
      cell.querySelector('.tray-move')!.addEventListener('click', () => { t.slideId = currentSlideId(); renderTray(); toast('已移到：' + slideLabel(t.slideId)); });
      const note = cell.querySelector('.tray-note') as HTMLInputElement;
      note.addEventListener('input', () => { t.note = note.value; });
      wrap.appendChild(cell);
    });
    group.appendChild(wrap);
    grid.appendChild(group);
  });
  const empty = $('#trayEmpty'); if (empty) (empty as HTMLElement).style.display = trayImages.length ? 'none' : '';
  renderTodo();
}
function trayImagesForSlide(id: string): TrayImage[] { return trayImages.filter((t) => t.slideId === id); }
// one image's manifest line: id · name · dims · note + a disk path (the bridge swaps
// __TRAY_DIR__ for a real temp dir so the AI can Read the actual pixels).
function aiImageLines(imgs: TrayImage[]): string {
  return imgs.map((t) => {
    const dims = t.w && t.h ? `${t.w}×${t.h}` : '尺寸未知';
    return `  - id \`${t.id}\` · 文件 ${t.name} · 尺寸 ${dims}` + (t.note.trim() ? ` · 说明：${t.note.trim()}` : '')
      + ` · 本地文件：__TRAY_DIR__/${t.id}.${extFromDataUrl(t.dataUrl)}（请用 Read 工具查看此图像）`;
  }).join('\n');
}
// the shared rule for how placeholders work — included whenever a request carries images
function aiImagePreamble(): string {
  return `## 图片素材（按指定页插入）
下面有页要插入用户暂存的图片。**每张图都已指定所属页**——请把它插入到所属页、并在该页内排好版式，**不要自行改放到别的页**。
插入方式：在该页 \`<section data-id>\` 里用占位 \`<img data-img-id="img-N" alt="…" style="…">\`（**只写 data-img-id，不要写 src、不要塞 base64**）；Studio 会按 id 回填真实图片。大小/圆角/位置用 \`style\`/\`class\`（沿用令牌、勿写死颜色），一张图只插一次。
`;
}
const trayPayload = (): { id: string; name: string; dataUrl: string }[] => trayImages.map((t) => ({ id: t.id, name: t.name, dataUrl: t.dataUrl }));
// 配图清单：每页一个生成请求 + 类型（矢量 SVG = Claude 直出 / 图表 = 按数据画 SVG / 照片 = codex 生成）+ 提示
const genQueue: Record<string, { type: 'vector' | 'chart' | 'photo'; hint: string }> = {};
let illType: 'vector' | 'chart' | 'photo' = 'vector'; // 本页「配图」当前选的类型
// send a request (optionally with its staged images) over the bridge, or explain how to connect
function sendOverBridge(r: { name: string; count: number; content: string; images?: { id: string; name: string; dataUrl: string }[] }, okMsg: string): boolean {
  if (bridge.connected && bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
    bridge.ws.send(JSON.stringify({ type: 'requests', request: { name: r.name, count: r.count, content: r.content, confirm: aiConfirm }, images: r.images }));
    toast(aiConfirm ? `${okMsg}（改前先问我：会以提议预览返回）` : okMsg);
    return true;
  }
  toast('需要先「连接 Claude Code」（桥接模式）；内容已保留，连接后再发送', true);
  return false;
}
// the SVG rules (included once when any 矢量 item is queued)
function aiIllustrateSpec(): string {
  return `## 矢量配图规则（type=矢量 的页：你直接画内联 <svg>）
画**一张贴合该页内容**的矢量示意图放进该页。务必：① 读懂主题，画相关概念图/示意/图标组合（「增长」→上扬线、「协作」→相连节点…），不要无关花纹或占位图；② 用设计令牌着色（\`var(--accent)\`/\`var(--accent-2)\`/\`var(--ink)\`），勿写死品牌色，浅/暗皮都好看；③ \`<svg viewBox>\` 纯路径/形状/渐变，**不引外部资源、不嵌位图**，保持单文件离线；④ 克制有构图，留白充足；装饰 svg 加 \`aria-hidden\`；⑤ 放对位置、不遮正文，必要时轻调布局。返回含该 \`<svg>\` 的整页 \`<section data-id>\`。
`;
}
// the chart rules (included once when any 图表 item is queued) — A default (SVG direct) + C escape hatch (matplotlib pre-render)
function aiChartSpec(): string {
  return `## 图表规则（type=图表 的页：把数据/描述变成内联 <svg> 图表）
读用户给的**数据或描述**（可能是「方法A 78、方法B 88…分组柱状图」这类一句话，也可能是从文件导入的多行 CSV/数字）→ 选对图型 → **直接画一张干净的内联 <svg> 图表**放进该页，**务必按真实数值算坐标**。务必：① **选对图型**（占比→饼/环；随时间或序列→折线/面积；类别对比→柱/分组柱/堆叠柱；多维对比→雷达；相关或分布→散点）；② **要素齐全且数据准确**：坐标轴 + 刻度 + 轴标题 + 单位 + 图例(多系列) + 必要数值标签，**按给的数算坐标别乱画**；③ 用设计令牌着色（\`var(--accent)\`/\`var(--accent-2)\`/\`var(--accent-3)\`/\`var(--ink)\`/\`var(--muted)\`，网格线浅灰），勿写死品牌色，浅/暗皮都好看；④ \`<svg viewBox>\` 纯路径/形状，**不引外部资源、不嵌位图、不依赖外部字体**，单文件离线；⑤ 克制专业、无 chartjunk、留白足；装饰元素 \`aria-hidden\`，图表整体给 \`aria-label\`；⑥ 放对位置不遮正文。图表 SVG 也存进图片库（同矢量配图）。返回含该 \`<svg>\` 的整页 \`<section data-id>\`。
**逃生舱（仅复杂图）**：当数据**密集或要精确统计**（箱线/小提琴/热力图/桑基/上百点散点/对数轴+误差棒）手绘易错时，改用本机 matplotlib 预渲染：写 Python（\`matplotlib.rcParams['font.sans-serif']=['PingFang SC','Noto Sans SC','Heiti SC']\` 防中文成□；配色用本 deck 令牌色的 hex 近似）→ \`savefig(format='svg')\` → 把生成的 \`<svg>\` 内联进该页并存图片库。注意预渲染 SVG 颜色是死 hex（换肤不跟着变）、体积较大，**仅复杂图才用**。
`;
}
// the codex+library rules (included once when any 照片 item is queued)
function aiImageGenSpec(): string {
  return `## 照片配图规则（type=照片 的页：用本机 codex 生成 → 存图片库 → 内联）
对每个 type=照片 的页：① 结合内容写英文图像提示词；② \`codex exec\` 生成 PNG；③ 存入图片库 \`~/.slidesmith/library/${fileBase}/\`（命名 \`<页id>__<slug>__<短码>.png\` + 更新 \`index.json\`）；④ base64 内联进该页 \`<img>\`。完整步骤见 \`AGENTS.md\` §4e。
- codex 示例：\`codex exec --skip-git-repo-check -C <dir> -s workspace-write -c sandbox_workspace_write.network_access=true "Generate <prompt>. Save as out.png."\`（按张计 codex 额度）
`;
}
// a per-page block: optional 修改要求 + optional 配图(矢量/照片) + optional 待插入图片 + current HTML
function aiTaskBlock(s: HtmlSlide, i: number, o: { instr?: string; gen?: { type: 'vector' | 'chart' | 'photo'; hint: string }; trayImgs?: TrayImage[] }): string {
  const trayImgs = o.trayImgs || [];
  let b = `### 第 ${i + 1} 页 · ${s.title}  (data-id: \`${s.id}\`)\n`;
  if (o.instr) b += `**修改要求：** ${o.instr}\n`;
  if (o.gen?.type === 'vector') b += `**配图（矢量 SVG · 你直接画内联 <svg>）：** ${o.gen.hint || '按本页内容画一张贴合的示意图'}\n`;
  if (o.gen?.type === 'chart') { const h = o.gen.hint || '按本页内容选图型并作图'; b += h.includes('\n') ? `**图表（按以下数据/描述画内联 <svg> 图表）：**\n${FENCE}\n${h}\n${FENCE}\n` : `**图表（按数据/描述画内联 <svg> 图表）：** ${h}\n`; }
  if (o.gen?.type === 'photo') b += `**配图（照片级 · 用 codex 生成→存图片库→内联）：** ${o.gen.hint || '按本页内容生成一张合适的照片'}\n`;
  if (trayImgs.length) b += `**在本页插入这些图片（占位 <img data-img-id>，勿写 src/base64）：**\n${aiImageLines(trayImgs)}\n`;
  b += `\n当前 HTML（在此基础上改写/插入/配图）：\n${FENCE}html\n${s.html}\n${FENCE}\n`;
  return b;
}
// THE unified request: deck-ask + every page that has a 改字 / 配图(矢量·照片) / 待插入图片.
// One request, one send — Claude does text edits, draws SVGs, runs codex, places images.
function buildAllRequest(): { name: string; count: number; content: string; images: { id: string; name: string; dataUrl: string }[] } | null {
  if (mode !== 'html') return null;
  harvestAll(); saveAiInstruction();
  const hasDeck = !!aiDeckInstruction.trim();
  const pages = htmlSlides.map((s, i) => ({ s, i })).filter(({ s }) =>
    (aiInstructions[s.id] && !aiApplied.has(s.id)) || genQueue[s.id] || trayImagesForSlide(s.id).length);
  const hasNoteAnns = noteAnns.length > 0;
  if (!pages.length && !hasDeck && !hasNoteAnns) return null;
  const anyVec = Object.values(genQueue).some((g) => g.type === 'vector');
  const anyChart = Object.values(genQueue).some((g) => g.type === 'chart');
  const anyPhoto = Object.values(genQueue).some((g) => g.type === 'photo');
  let body = aiRequestHeader('AI 待办 · 修改与配图一次办');
  if (hasDeck) body += aiDeckBlock();
  if (anyVec) body += aiIllustrateSpec();
  if (anyChart) body += aiChartSpec();
  if (anyPhoto) body += aiImageGenSpec();
  if (trayImages.length) body += aiImagePreamble();
  if (hasNoteAnns) body += aiNotesBlock();
  body += (pages.length ? '\n## 需要处理的页\n' : '') + pages.map(({ s, i }) => aiTaskBlock(s, i, {
    instr: (aiInstructions[s.id] && !aiApplied.has(s.id)) ? aiInstructions[s.id] : '',
    gen: genQueue[s.id],
    trayImgs: trayImagesForSlide(s.id),
  })).join('\n') + (pages.length ? aiOutputSpec() : '');
  return { name: `${fileBase}.ai-tasks.md`, count: pages.length + (hasDeck ? 1 : 0) + noteAnns.length, content: body, images: trayPayload() };
}
function submitAll(): void {
  const r = buildAllRequest();
  if (!r) { toast('待办清单是空的：写修改意见、加配图、或导入图片', true); return; }
  const sentNow = htmlSlides.filter((s) => aiInstructions[s.id] && !aiApplied.has(s.id)).map((s) => s.id);
  if (sendOverBridge(r, `已一键发送 ${r.count} 项给 Claude`)) {
    sentNow.forEach((id) => aiSent.add(id)); // 改字 → 已发送（结果回灌后变 已改）
    Object.keys(genQueue).forEach((k) => delete genQueue[k]); // 配图请求一次性，发出后清空（成品出现在页面 + 图片库）
    if (aiDeckInstruction.trim()) { aiDeckInstruction = ''; const box = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (box) box.value = ''; }
    refreshTasks();
  }
}
// 本页「配图」：把当前页按所选类型 + 提示加入配图清单
function addIllustToQueue(): void {
  if (mode !== 'html') { toast('请先导入 HTML deck', true); return; }
  const i = currentHtmlSlideIndex(); const s = htmlSlides[i]; if (!s) return;
  const hint = (($('#illHint') as HTMLInputElement | null)?.value || '').trim();
  genQueue[s.id] = { type: illType, hint };
  const box = $('#illHint') as HTMLInputElement | null; if (box) box.value = '';
  refreshTasks(); toast(`已加入配图清单：第 ${i + 1} 页 · ${illType === 'vector' ? '矢量 SVG' : illType === 'chart' ? '图表' : '照片 codex'}`);
}
// 图表数据：导入一个 CSV / 数字 / 文本数据文件，内容填进「配图」文本框（供 AI 据此作图）
function applyIllData(text: string, name: string): void {
  const t = (text || '').trim(); if (!t) return;
  const box = $('#illHint') as HTMLTextAreaElement | null; if (!box) return;
  box.value = (box.value.trim() ? box.value.trim() + '\n' : '') + t;
  const note = $('#illDataNote'); if (note) note.textContent = `已导入 ${name}（${t.split(/\r?\n/).length} 行）`;
}
function illDataPicker(): void {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.tab,.txt,.json,.dat,.md,text/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { applyIllData(String(r.result || ''), f.name); toast(`已导入数据文件：${f.name}`); }; r.readAsText(f);
  };
  inp.click();
}
function genUnmark(id: string): void { delete genQueue[id]; refreshTasks(); }
// the unified 待办清单 = deck ask + per-page 改字 / 配图(矢量·照片) / 导入图
function todoItems(): { label: string; desc: string; page: number; cls: string; remove: () => void }[] {
  const items: { label: string; desc: string; page: number; cls: string; remove: () => void }[] = [];
  if (aiDeckInstruction.trim()) items.push({ label: '整份要求', desc: aiDeckInstruction.trim(), page: 0, cls: 'deck', remove: () => { aiDeckInstruction = ''; const b = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (b) b.value = ''; refreshTasks(); } });
  htmlSlides.forEach((s, i) => {
    if (aiInstructions[s.id] && !aiApplied.has(s.id)) items.push({ label: aiSent.has(s.id) ? '改字 · 已发送' : '改字', desc: aiInstructions[s.id], page: i + 1, cls: 'edit', remove: () => { delete aiInstructions[s.id]; aiSent.delete(s.id); if (aiCurId === s.id) { const b = $('#aiInstruction') as HTMLTextAreaElement | null; if (b) b.value = ''; } refreshTasks(); } });
    const g = genQueue[s.id];
    if (g) { const lab = g.type === 'vector' ? '配图 · 矢量' : g.type === 'chart' ? '配图 · 图表' : '配图 · 照片'; const cls = g.type === 'vector' ? 'vec' : g.type === 'chart' ? 'chart' : 'photo'; items.push({ label: lab, desc: g.hint || '（按内容自动）', page: i + 1, cls, remove: () => genUnmark(s.id) }); }
    trayImagesForSlide(s.id).forEach((t) => items.push({ label: t.placed ? '导入图 · 已放置' : '导入图', desc: t.name, page: i + 1, cls: 'tray', remove: () => removeTrayImage(t.id) }));
  });
  // 讲稿批注也是待办的一种——同一个「一键发送」把它们一起交出去，
  // 用户不该为了改讲稿再学一套流程。
  noteAnns.forEach((a) => items.push({
    label: '讲稿批注', desc: a.note, page: a.page, cls: 'note', remove: () => removeNoteAnn(a.id),
  }));
  return items;
}
/** AI 面板里那行讲稿状态 */
function refreshNotesStatus(): void {
  const el = $('#notesStatus'); if (!el) return;
  if (mode !== 'html') { el.textContent = '—'; return; }
  const doc = loadNotes();
  if (!doc) { el.textContent = '这份 deck 没有内嵌讲稿（一体版才有）'; return; }
  const n = doc.querySelectorAll('h3[id]').length;
  el.textContent = `内嵌讲稿 ${n} 段` + (noteAnns.length ? ` · ${noteAnns.length} 条批注待发送` : ' · 打开后划一段即可加批注');
}
function renderTodo(): void {
  const box = $('#aiTodo'); if (!box) return; box.innerHTML = '';
  const items = todoItems();
  if (!items.length) box.innerHTML = '<div class="qempty">待办清单为空。写「本页修改意见」、在「本页 · 配图」加配图、导入图片、或在讲稿里加批注，都会出现在这里。</div>';
  items.forEach((it) => {
    const row = document.createElement('div'); row.className = 'todorow';
    row.innerHTML = `<span class="todochip ${it.cls}">${it.label}</span>` + (it.page ? `<span class="todopg">第 ${it.page} 页</span>` : '')
      + `<span class="tododesc" title="${esc(it.desc)}">${esc(it.desc)}</span><button class="todo-del" title="从待办移除此项（不影响页面内容）" aria-label="移除">✕</button>`;
    row.querySelector('.todo-del')!.addEventListener('click', it.remove);
    box.appendChild(row);
  });
  const photo = items.some((it) => it.cls === 'photo');
  const btn = $('#aiSendAll') as HTMLButtonElement | null;
  if (btn) { btn.disabled = items.length === 0; btn.textContent = items.length ? `一键发送给 AI · ${items.length} 项` : '一键发送给 AI'; }
  const note = $('#aiSendNote'); if (note) (note as HTMLElement).style.display = photo ? '' : 'none';
}

// ---- 图片库 panel: browse / re-insert / delete the generated-image library ----
interface LibEntry { file: string; slideId?: string; slideTitle?: string; prompt?: string; style?: string; createdAt?: string }
function libBase(): string { return location.origin; }
async function openLibrary(): Promise<void> {
  if (!bridge.connected) { toast('图片库需要先连接 Claude（桥接模式）', true); return; }
  const m = $('#libModal'); if (m) (m as HTMLElement).style.display = 'flex';
  await loadLibrary();
}
function closeLibrary(): void { const m = $('#libModal'); if (m) (m as HTMLElement).style.display = 'none'; }
async function loadLibrary(): Promise<void> {
  const grid = $('#libGrid'); if (!grid) return;
  grid.innerHTML = '<div class="qempty">加载中…</div>';
  try {
    const r = await fetch(`${libBase()}/api/library?deck=${encodeURIComponent(fileBase)}`);
    if (!r.ok) { // older bridge without /api/library → tell the user to restart, don't crash on non-JSON
      grid.innerHTML = '<div class="qempty">图片库接口未就绪。请重启桥接（新开一个 /slidesmith 会话或重新 slidesmith serve）后再打开。</div>'; return;
    }
    const j = await r.json(); const imgs: LibEntry[] = (j && j.images) || [];
    const cnt = $('#libCount'); if (cnt) cnt.textContent = imgs.length ? `${imgs.length} 张` : '';
    if (!imgs.length) { grid.innerHTML = '<div class="qempty">图片库还没有图片。在「本页 · 配图」加配图（矢量 / 照片）→「一键发送给 AI」生成后，成品会进这里。</div>'; return; }
    grid.innerHTML = '';
    imgs.forEach((im) => {
      const cell = document.createElement('div'); cell.className = 'lib-cell';
      const src = `${libBase()}/api/library/file?deck=${encodeURIComponent(fileBase)}&file=${encodeURIComponent(im.file)}`;
      cell.innerHTML = `<div class="lib-thumb"><img loading="lazy" alt="" src="${src}"></div>`
        + `<div class="lib-meta" title="${esc(im.prompt || im.file)}">${esc(im.prompt || im.file)}</div>`
        + `<div class="lib-sub">${esc(im.slideId ? slideLabel(im.slideId) : '')}</div>`
        + `<div class="oprow"><button class="lib-ins primary-mini">插入到该页</button><button class="lib-del">删除</button></div>`;
      cell.querySelector('.lib-ins')!.addEventListener('click', () => libReinsert(im));
      cell.querySelector('.lib-del')!.addEventListener('click', () => libDelete(im.file));
      grid.appendChild(cell);
    });
  } catch (e) { grid.innerHTML = '<div class="qempty">加载失败：' + (e as Error).message + '</div>'; }
}
async function libReinsert(im: LibEntry): Promise<void> {
  try {
    const r = await fetch(`${libBase()}/api/library/file?deck=${encodeURIComponent(fileBase)}&file=${encodeURIComponent(im.file)}&as=dataurl`);
    const j = await r.json(); if (!j || !j.dataUrl) throw new Error('no data');
    if (im.slideId) { const idx = htmlSlides.findIndex((s) => s.id === im.slideId); if (idx >= 0) selectHtmlSlide(idx); }
    placeImage(j.dataUrl); closeLibrary(); toast('已插入图片到当前页');
  } catch (e) { toast('插入失败：' + (e as Error).message, true); }
}
async function libDelete(file: string): Promise<void> {
  if (!confirm('确定从图片库删除这张图片？（不影响已插入到 deck 里的副本）')) return;
  try { await fetch(`${libBase()}/api/library/remove?deck=${encodeURIComponent(fileBase)}&file=${encodeURIComponent(file)}`, { method: 'POST' }); await loadLibrary(); toast('已从图片库删除'); }
  catch (e) { toast('删除失败：' + (e as Error).message, true); }
}
// ---- 搜图: stock photo search (via bridge) → pick → 暂存盘 (tray) ----
interface SearchImage { id: string; thumb: string; full: string; w: number; h: number; author: string; authorUrl: string; license: string; pageUrl: string; source: string; alt: string }
function openImageSearch(): void {
  const m = $('#searchModal'); if (!m) return;
  m.style.display = 'flex';
  const q = $('#imgSearchQ') as HTMLInputElement | null;
  if (q) { if (!q.value.trim()) q.value = (mode === 'html' && htmlSlides[cur]) ? htmlSlides[cur].title : ''; q.focus(); q.select(); }
}
function closeImageSearch(): void { const m = $('#searchModal'); if (m) m.style.display = 'none'; }
async function runImageSearch(): Promise<void> {
  const q = ($('#imgSearchQ') as HTMLInputElement).value.trim();
  const src = ($('#imgSearchSrc') as HTMLSelectElement).value;
  const grid = $('#imgSearchGrid'); if (!grid) return;
  if (!q) { grid.innerHTML = '<div class="qempty">先输入关键词，再点搜索。</div>'; return; }
  grid.innerHTML = '<div class="qempty">搜索中…</div>';
  try {
    const r = await fetch(`${libBase()}/api/image-search?q=${encodeURIComponent(q)}${src ? `&source=${src}` : ''}`);
    if (!r.ok && r.status === 404) { grid.innerHTML = '<div class="qempty">搜图接口未就绪。请重启桥接（新开一个 /slidesmith 会话或重新 slidesmith serve）后再试。</div>'; return; }
    const j = await r.json() as { ok: boolean; source?: string; hasPexels?: boolean; hasGoogle?: boolean; images?: SearchImage[]; error?: string };
    if (!j.ok) {
      const err = j.error || '未知错误';
      let extra = '';
      if (/google|no-google-config/i.test(err)) extra = '<br>（未配置 Google：在 <code>~/.slidesmith/config.json</code> 填 <code>googleApiKey</code> 与 <code>googleSearchCx</code> 后重启桥接；或先用其它图源）';
      else if (/pexels/i.test(err)) extra = '<br>（未配置 Pexels key：改用其它图源，或在 <code>~/.slidesmith/config.json</code> 填 <code>pexelsApiKey</code> 后重启桥接）';
      grid.innerHTML = `<div class="qempty">搜索失败：${esc(err)}${extra}</div>`;
      return;
    }
    const imgs = j.images || [];
    const hint = $('#imgSearchHint');
    const srcLabel = j.source === 'pexels' ? 'Pexels（免费可商用·无需署名）'
      : j.source === 'baidu' ? '百度图片（中文·网络来源，自行确认版权）'
        : j.source === 'wikimedia' ? '维基共享（多为 CC/公有领域·会带署名）'
          : j.source === 'google' ? 'Google 图片（网络来源·自行确认版权）'
            : 'Openverse（CC·会自动带上署名）';
    if (hint) hint.innerHTML = `来自 <b>${srcLabel}</b> · 点缩略图即加入暂存盘。`;
    if (!imgs.length) { grid.innerHTML = '<div class="qempty">没找到相关图片，换个关键词或图源试试。</div>'; return; }
    grid.innerHTML = '';
    imgs.forEach((im) => {
      const cell = document.createElement('div'); cell.className = 'lib-cell searchcell';
      cell.innerHTML = `<div class="lib-thumb"><img loading="lazy" alt="" src="${esc(im.thumb)}"></div>`
        + `<div class="lib-meta">${esc(im.author || im.alt || '—')}</div>`
        + `<div class="searchlic">${esc(im.license || '')}</div>`
        + `<span class="searchbadge">已加入 ✓</span>`;
      cell.addEventListener('click', () => pickSearchImage(im, cell));
      grid.appendChild(cell);
    });
  } catch (e) { grid.innerHTML = '<div class="qempty">搜索失败：' + esc(String((e as Error).message || e)) + '</div>'; }
}
async function pickSearchImage(im: SearchImage, cell: HTMLElement): Promise<void> {
  if (cell.classList.contains('picking') || cell.classList.contains('picked')) return;
  cell.classList.add('picking');
  try {
    const r = await fetch(`${libBase()}/api/image-fetch?url=${encodeURIComponent(im.full || im.thumb)}`);
    const j = await r.json() as { ok: boolean; dataUrl?: string; error?: string };
    if (!j.ok || !j.dataUrl) { toast('下载失败：' + (j.error || '未知'), true); cell.classList.remove('picking'); return; }
    const name = ((im.alt || im.author || 'photo').slice(0, 40).replace(/[^\w一-鿿]+/g, '-').replace(/^-+|-+$/g, '')) || 'photo';
    const credit = im.source === 'pexels' ? `Pexels / ${im.author}` : (im.author ? `${im.author}（${im.license}）` : im.license);
    addTrayImage(name, j.dataUrl, credit);
    cell.classList.remove('picking'); cell.classList.add('picked');
    toast('已加入暂存盘：' + name + '（在「导入图片」下方，含署名）');
  } catch (e) { cell.classList.remove('picking'); toast('下载失败：' + String((e as Error).message || e), true); }
}
// after an AI patch lands, swap placeholder <img data-img-id> for the real staged image.
// Runs on the parsed <section> (parent doc) before its outerHTML is harvested.
function backfillTrayImages(root: Element): number {
  let n = 0;
  root.querySelectorAll('img[data-img-id]').forEach((el) => {
    const im = el as HTMLImageElement; const tid = im.getAttribute('data-img-id');
    const t = tid ? trayImages.find((x) => x.id === tid) : null;
    if (t) { im.setAttribute('src', t.dataUrl); if (!im.getAttribute('alt')) im.setAttribute('alt', t.name); t.placed = true; n++; }
  });
  return n;
}

// ---- move / resize the selected element directly on the canvas (Keynote-style gizmo) ----
// Move = inline transform translate (keeps the flow-layout slot, never breaks the contract);
// resize = inline width/height (images keep aspect via height:auto). Both persist via harvest.
function parseTranslate(el: HTMLElement): { x: number; y: number } {
  const m = (el.style.transform || '').match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
}
function setTranslate(el: HTMLElement, x: number, y: number): void {
  const rest = (el.style.transform || '').replace(/translate\([^)]*\)/, '').trim();
  el.style.transform = ('translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px) ' + rest).trim();
}
function deckScale(el: HTMLElement): number { const r = el.getBoundingClientRect(); const w = el.offsetWidth || 1; return (r.width / w) || 1; }
function nudgeSelected(dxDeck: number, dyDeck: number): void {
  if (!htmlSelEl) return; const el = htmlSelEl as HTMLElement; const t = parseTranslate(el); setTranslate(el, t.x + dxDeck, t.y + dyDeck);
}
function resizeSelected(wDeck: number, hDeck?: number): void {
  if (!htmlSelEl) return; const el = htmlSelEl as HTMLElement;
  if (wDeck > 0) el.style.width = Math.max(20, Math.round(wDeck)) + 'px'; else el.style.removeProperty('width');
  if (el.tagName === 'IMG') el.style.height = 'auto';
  else if (hDeck != null && hDeck > 0) el.style.height = Math.max(20, Math.round(hDeck)) + 'px';
}
// inspector / hook entry points (also used by the drag handlers' commit)
function commitMove(dx: number, dy: number): void { if (!htmlSelEl) return; pushHistory('box'); nudgeSelected(dx, dy); harvestAll(); markDirty(); positionGizmo(); }
function commitResize(w: number, h?: number): void { if (!htmlSelEl) return; pushHistory('box'); resizeSelected(w, h); harvestAll(); markDirty(); positionGizmo(); }
function resetSelectedBox(): void {
  if (!htmlSelEl) return; pushHistory('box'); const el = htmlSelEl as HTMLElement;
  el.style.removeProperty('transform'); el.style.removeProperty('width'); el.style.removeProperty('height');
  harvestAll(); markDirty(); positionGizmo(); showHtmlSel(true, el);
}
function ensureGizmoStyle(d: Document): void {
  if (d.getElementById('sm-gizmo-css')) return;
  const st = d.createElement('style'); st.id = 'sm-gizmo-css';
  st.textContent = '.sm-gizmo{position:fixed;z-index:2147483000;border:1.5px solid #3a86ff;pointer-events:none;box-sizing:border-box}'
    + '.sm-gizmo .h{position:absolute;width:15px;height:15px;background:#fff;border:1.5px solid #3a86ff;border-radius:3px;pointer-events:auto}'
    + '.sm-gizmo .se{right:-8px;bottom:-8px;cursor:nwse-resize}'
    + '.sm-gizmo .mv{position:absolute;left:50%;top:-32px;transform:translateX(-50%);min-width:28px;height:24px;padding:0 6px;background:#3a86ff;color:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;pointer-events:auto;cursor:move;box-shadow:0 2px 6px rgba(0,0,0,.3)}';
  d.head.appendChild(st);
}
function hideGizmo(): void { if (gizmoEl) { gizmoEl.remove(); gizmoEl = null; } }
function positionGizmo(): void {
  if (!gizmoEl || !htmlSelEl) return;
  const r = (htmlSelEl as HTMLElement).getBoundingClientRect();
  gizmoEl.style.left = r.left + 'px'; gizmoEl.style.top = r.top + 'px';
  gizmoEl.style.width = r.width + 'px'; gizmoEl.style.height = r.height + 'px';
}
function showGizmo(el: HTMLElement): void {
  const d = el.ownerDocument; if (!d || !d.body) return;
  hideGizmo(); ensureGizmoStyle(d);
  const g = d.createElement('div'); g.className = 'sm-gizmo';
  g.innerHTML = '<div class="mv" title="拖动移动本元素">✥</div><div class="h se" title="拖动改变大小"></div>';
  d.body.appendChild(g); gizmoEl = g; positionGizmo();
  (g.querySelector('.mv') as HTMLElement).addEventListener('mousedown', (e) => startGizmoDrag(e as MouseEvent, 'move'));
  (g.querySelector('.se') as HTMLElement).addEventListener('mousedown', (e) => startGizmoDrag(e as MouseEvent, 'resize'));
}
function startGizmoDrag(e: MouseEvent, mode: 'move' | 'resize'): void {
  if (!htmlSelEl) return; e.preventDefault(); e.stopPropagation();
  const el = htmlSelEl as HTMLElement; const d = el.ownerDocument; if (!d) return;
  const scale = deckScale(el); const t = parseTranslate(el);
  const sx = e.clientX, sy = e.clientY, baseTx = t.x, baseTy = t.y, baseW = el.offsetWidth, baseH = el.offsetHeight;
  pushHistory('box');
  const onMove = (ev: MouseEvent): void => {
    const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
    if (mode === 'move') setTranslate(el, baseTx + dx, baseTy + dy);
    else resizeSelected(baseW + dx, baseH + dy);
    positionGizmo();
  };
  const onUp = (): void => {
    d.removeEventListener('mousemove', onMove, true); d.removeEventListener('mouseup', onUp, true);
    harvestAll(); markDirty(); showHtmlSel(true, el);
  };
  d.addEventListener('mousemove', onMove, true); d.addEventListener('mouseup', onUp, true);
}

function applyHtmlStyle(prop: string, val: string): void {
  if (!htmlSelEl) return; pushHistory('style:' + prop); const s = (htmlSelEl as HTMLElement).style;
  if (val) s.setProperty(prop, val); else s.removeProperty(prop);
  markDirty(); positionGizmo();
}
function setHtmlAnim(val: string): void {
  if (!htmlSelEl) return; pushHistory('anim');
  if (val && val !== 'none') htmlSelEl.setAttribute('data-anim', val); else htmlSelEl.removeAttribute('data-anim');
  markDirty();
}
function setHtmlMotion(val: string): void {
  if (!htmlSelEl) return; pushHistory('motion');
  if (val && val !== 'none') htmlSelEl.setAttribute('data-motion', val); else htmlSelEl.removeAttribute('data-motion');
  markDirty();
}
function setHtmlAnimOut(val: string): void {
  if (!htmlSelEl) return; pushHistory('animout');
  if (val && val !== 'none') htmlSelEl.setAttribute('data-anim-out', val); else htmlSelEl.removeAttribute('data-anim-out');
  markDirty();
}
function setHtmlEmph(val: string): void {
  if (!htmlSelEl) return; pushHistory('emph');
  if (val && val !== 'none') htmlSelEl.setAttribute('data-emph', val); else htmlSelEl.removeAttribute('data-emph');
  markDirty();
}

// ── 动画库子窗口（picker）：把 gallery/animations.html 当效果浏览器开成子窗口，
//    点某效果的「应用到选中」→ postMessage 回来 → 落到当前选中元素 + 当场预览。──
let animGalleryWin: Window | null = null;
let pendingMorphId: string | null = null;
let morphSeq = 0;
function openAnimGallery(): void {
  if (animGalleryWin && !animGalleryWin.closed) { animGalleryWin.focus(); return; }
  let url = '';
  try { url = URL.createObjectURL(new Blob([galleryHtml], { type: 'text/html' })) + '#picker'; } catch { url = ''; }
  animGalleryWin = url ? window.open(url, 'smfx-gallery', 'width=960,height=920,menubar=no,toolbar=no') : null;
  if (!animGalleryWin) setMorphHint('弹窗被拦截，请允许本页弹窗后再点击「打开动画库」。');
}
function setMorphHint(msg: string): void {
  const h = $('#hMorphHint'); if (!h) return;
  (h as HTMLElement).style.display = msg ? '' : 'none'; h.textContent = msg;
}
function applyPicked(d: { code?: string; name?: string; spec?: Record<string, unknown> }): void {
  if (mode !== 'html') { setMorphHint('请先导入一个 HTML deck，再添加动画。'); return; }
  const spec = (d.spec || {}) as { mode?: string; attr?: string; val?: string; add?: string[]; scope?: string };
  if (spec.mode === 'morph') { applyMorph(d.name || '神奇移动'); return; }
  if (!htmlSelEl) { setMorphHint('请先在预览中点选一个元素，再选择效果。'); return; }
  const el = htmlSelEl as HTMLElement;
  const slide = el.closest('#deck .slide') as HTMLElement | null;
  const target = spec.scope === 'slide' ? (slide || el) : el;
  pushHistory('anim-pick');
  if (spec.mode === 'attr' && spec.attr) {
    if (spec.val) target.setAttribute(spec.attr, spec.val); else target.removeAttribute(spec.attr);
  } else if (spec.mode === 'class' && spec.add) {
    spec.add.forEach((c) => target.classList.add(c));
  }
  markDirty();
  showHtmlSel(true, el);
  previewPlayFx();
  if (spec.attr === 'data-fx') setMorphHint('已为本页添加 Canvas 特效「' + (d.name || '') + '」，在导出后的 deck 放映时生效，Studio 预览暂不渲染 Canvas。');
  else setMorphHint('已为选中元素应用「' + (d.name || d.code || '') + '」。');
}
function applyMorph(name: string): void {
  if (!htmlSelEl) { setMorphHint('请先选中要进行「神奇移动」的元素。'); return; }
  const el = htmlSelEl as HTMLElement;
  pushHistory('morph');
  if (!pendingMorphId) {
    pendingMorphId = 'm' + (++morphSeq);
    el.setAttribute('data-morph', pendingMorphId);
    setMorphHint('已标记神奇移动起点（' + pendingMorphId + '）。翻到下一页选中对应元素，再次点击「' + name + '」即可配对。');
  } else {
    el.setAttribute('data-morph', pendingMorphId);
    setMorphHint('神奇移动已配对（' + pendingMorphId + '）。放映或导出后翻动这两页时，元素将平滑过渡。');
    pendingMorphId = null;
  }
  markDirty();
  showHtmlSel(true, el);
}
// the "当前动画" chips under the selected element — show what's applied, with ✕ to remove
function renderAnimChips(el: Element): void {
  const box = $('#hAnimChips'); if (!box) return;
  box.innerHTML = '';
  const items: Array<{ label: string; clear: () => void }> = [];
  const attr = (name: string, label: string) => { const v = el.getAttribute(name); if (v) items.push({ label: label + '·' + v, clear: () => el.removeAttribute(name) }); };
  attr('data-anim', '入场'); attr('data-emph', '强调'); attr('data-motion', '持续');
  attr('data-anim-out', '消失'); attr('data-transition', '转场'); attr('data-morph', '神奇移动');
  Array.from(el.classList).forEach((c) => {
    if (c === 'fragment') items.push({ label: '分步·fragment', clear: () => ['fragment', 'up', 'down', 'left', 'right', 'grow', 'shrink', 'strike', 'highlight', 'current-visible', 'semi-out'].forEach((v) => el.classList.remove(v)) });
    else if (c.startsWith('smfx-')) items.push({ label: '点睛·' + c, clear: () => el.classList.remove(c) });
  });
  if (!items.length) { box.innerHTML = '<span class="achint">尚未添加动画。点击上方「打开动画库」选择一个。</span>'; return; }
  items.forEach((it) => {
    const chip = document.createElement('span'); chip.className = 'achip'; chip.textContent = it.label;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕';
    x.addEventListener('click', () => { pushHistory('anim-rm'); it.clear(); markDirty(); showHtmlSel(true, el as HTMLElement); previewPlayFx(); });
    chip.appendChild(x); box.appendChild(chip);
  });
}
// pick a typeface for the selected element; load the webfont into the live preview now
function setHtmlFont(id: string): void {
  const f = FONT_BY_ID[id]; if (!f) return;
  applyHtmlStyle('font-family', f.stack);
  if (f.google) { usedFontIds.add(f.id); ensureFontLoaded(f); }
}
function ensureFontLoaded(f: FontDef): void {
  if (!f.google) return;
  const d = previewFrame()?.contentDocument; if (!d) return;
  const lid = 'sm-font-' + f.id; if (d.getElementById(lid)) return;
  const l = d.createElement('link'); l.id = lid; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
  d.head.appendChild(l);
}
// bold / italic / underline as Keynote-style toggles on the selected element's inline style
function toggleHtmlStyle(prop: string, onVal: string, isOn: () => boolean): void {
  if (!htmlSelEl) return; pushHistory('style:' + prop); const s = (htmlSelEl as HTMLElement).style;
  if (isOn()) s.removeProperty(prop); else s.setProperty(prop, onVal);
  showHtmlSel(true, htmlSelEl as HTMLElement); markDirty();
}
// drive the FX engine inside the live preview iframe (defined by FX_JS)
function previewFrame(): HTMLIFrameElement | null { return document.getElementById('preview') as HTMLIFrameElement | null; }
function previewFxCall(name: '__SM_FX_PLAY__' | '__SM_FX_REARM__'): void {
  const w = previewFrame()?.contentWindow as unknown as Record<string, (() => void) | undefined> | undefined;
  const fn = w && w[name]; if (typeof fn === 'function') fn();
}
function previewPlayFx(): void { previewFxCall('__SM_FX_PLAY__'); }
function previewPlayFxOut(): void {
  const w = previewFrame()?.contentWindow as unknown as { __SM_FX_PLAY_OUT__?: () => void } | undefined;
  if (w && typeof w.__SM_FX_PLAY_OUT__ === 'function') w.__SM_FX_PLAY_OUT__();
}
// high-frequency direct edits on the selected element, straight in the live DOM
// (no AI, no re-render). harvestAll() snapshots the change so export/patch keep it.
function moveHtmlEl(dir: number): void {
  if (!htmlSelEl) return; pushHistory('move'); const el = htmlSelEl as HTMLElement; const p = el.parentElement; if (!p) return;
  if (dir < 0) { const prev = el.previousElementSibling; if (prev) p.insertBefore(el, prev); }
  else { const next = el.nextElementSibling; if (next) p.insertBefore(next, el); }
  harvestAll(); markDirty(); positionGizmo();
}
function delHtmlEl(): void {
  if (!htmlSelEl) return; pushHistory('del'); const el = htmlSelEl as HTMLElement;
  htmlSelEl = null; el.remove(); hideGizmo(); showHtmlSel(false); harvestAll(); markDirty();
  toast('已删除该元素，可按 Ctrl/⌘+Z 撤销');
}
function setHtmlToken(name: string, val: string): void {
  pushHistory('token:' + name);
  H.overrides[name] = val;
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  if (d) d.documentElement.style.setProperty(name, val);
  markDirty();
}
// —— 设计旋钮（deck 级）：字体 / 字号 / 留白，全部落到 H.overrides（与配色同一条覆盖通道，
// 经 htmlOpenTag 烘焙进导出）。字号 / 留白按「设计令牌整体缩放」实现：从当前皮肤（或 deck 原始）
// 的 :root 基准值乘以系数，对所有用令牌的文本一致生效，可逆、可撤销、可导出。
const TWEAK_TYPE_TOKENS = ['--t-display', '--t-h1', '--t-h2', '--t-h3', '--t-h4', '--t-lead', '--t-body', '--t-small', '--t-eyebrow'];
const TWEAK_PAD_TOKENS = ['--pad-x', '--pad-y'];
function scaleLen(v: string, f: number): string | null {
  const m = String(v).trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  if (!m) return null;
  return (Math.round(parseFloat(m[1]) * f * 100) / 100) + m[2];
}
// 缩放基准 = 当前皮肤 bundle 的 :root 令牌（合并所有 :root 块，后者覆盖前者）；无皮肤时用 deck 原始 baseTokens。
function tweakBaseMap(): Record<string, string> {
  const css = (H.skin && (SKINS as Record<string, { css: string }>)[H.skin]) ? (SKINS as Record<string, { css: string }>)[H.skin].css : '';
  if (!css) return H.baseTokens;
  const out: Record<string, string> = {};
  const re = /:root[^{]*\{([^}]*)\}/g; let m: RegExpExecArray | null;
  while ((m = re.exec(css))) m[1].split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) { const k = d.slice(0, i).trim(); if (k.startsWith('--')) out[k] = d.slice(i + 1).trim(); } });
  return out;
}
function setHtmlTokenFont(token: string, id: string): void {
  const f = FONT_BY_ID[id];
  if (!id || !f) { // 默认（回到皮肤字体）
    pushHistory('token:' + token);
    delete H.overrides[token];
    const d = ($('#preview') as HTMLIFrameElement).contentDocument;
    if (d) d.documentElement.style.removeProperty(token);
    markDirty(); return;
  }
  setHtmlToken(token, f.stack);
  if (f.google) { usedFontIds.add(f.id); ensureFontLoaded(f); }
}
function writeTweakScale(kind: 'type' | 'pad', f: number): void {
  const base = tweakBaseMap();
  const toks = kind === 'type' ? TWEAK_TYPE_TOKENS : TWEAK_PAD_TOKENS;
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  toks.forEach((T) => {
    const b = base[T]; if (!b) return;
    if (Math.abs(f - 1) < 0.005) { delete H.overrides[T]; if (d) d.documentElement.style.removeProperty(T); return; }
    const v = scaleLen(b, f); if (!v) return;
    H.overrides[T] = v; if (d) d.documentElement.style.setProperty(T, v);
  });
}
function applyTweakScale(kind: 'type' | 'pad', f: number): void {
  pushHistory('tweak:' + kind); // 同 tag 700ms 内合并 → 整次拖动只占一步撤销
  writeTweakScale(kind, f);
  markDirty();
}
// 换皮时调用：保持「当前缩放比例」不变，按新皮的 :root 基准重算字号/留白的绝对值（否则旧皮算出的
// 绝对 px 相对新皮基准比例会失真）。在 pushHistory('skin') 之后、与换皮同属一步撤销。
function reapplyTweaksForSkin(typeF: number, padF: number): void {
  writeTweakScale('type', typeF);
  writeTweakScale('pad', padF);
}
function tweakFactor(repToken: string): number {
  const b = tweakBaseMap()[repToken]; const ov = H.overrides[repToken];
  if (!b || !ov) return 1;
  const nb = parseFloat(b), no = parseFloat(ov);
  return nb ? no / nb : 1;
}
function resetDesignKnobs(): void {
  pushHistory('tweak:reset');
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  ['--accent', '--accent-2', '--paper', '--ink', '--font-display', '--font-sans'].concat(TWEAK_TYPE_TOKENS, TWEAK_PAD_TOKENS)
    .forEach((T) => { delete H.overrides[T]; if (d) d.documentElement.style.removeProperty(T); });
  refreshHtmlInspector(); markDirty();
}
function refreshHtmlInspector(): void {
  // theme switching is handled by the deck's OWN control (visible in full-deck view),
  // so we don't duplicate it here (avoids a localStorage tug-of-war).
  const wrap = $('#hThemeWrap'); if (wrap) wrap.style.display = 'none';
  const skinSel = $('#hSkin') as HTMLSelectElement | null; if (skinSel) skinSel.value = H.skin || '';
  // 设计旋钮 tab：颜色镜像 H.overrides，字体下拉按覆盖的字体栈反查，字号/留白滑块按基准比值反推
  refreshDeckTokenInputs();
  const fontSel = (id: string, name: string) => { const s = $(id) as HTMLSelectElement | null; if (s) s.value = fontIdForStack(H.overrides[name] || ''); };
  fontSel('#dFontDisplay', '--font-display'); fontSel('#dFontSans', '--font-sans');
  const rng = (id: string, out: string, rep: string) => {
    const s = $(id) as HTMLInputElement | null; const o = $(out) as HTMLElement | null;
    const pct = Math.round(tweakFactor(rep) * 100);
    if (s) s.value = String(Math.max(70, Math.min(130, pct)));
    if (o) o.textContent = pct + '%';
  };
  rng('#dType', '#dTypeOut', '--t-body'); rng('#dPad', '#dPadOut', '--pad-x');
  syncSwatches();
}
function exportHtmlDeck(): string {
  harvestAll();
  return assembleDeck(false);
}
// ---- offline-portable export: inline used Google fonts as subset @font-face data URIs ----
function embedFontsChecked(): boolean { return !!($('#embedFonts') as HTMLInputElement | null)?.checked; }
// every character the deck actually shows → we only download those glyphs (CJK stays tiny)
function deckChars(): string {
  const raw = htmlSlides.map((s) => s.html).join(' ').replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ');
  const set = new Set<string>();
  for (const ch of raw) if (ch.charCodeAt(0) > 32) set.add(ch);
  for (let c = 32; c < 127; c++) set.add(String.fromCharCode(c)); // keep ASCII so numbers/punct render
  return Array.from(set).join('');
}
function abToBase64(buf: ArrayBuffer): string {
  let bin = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(bin);
}
// fetch with a hard timeout so an offline/slow embed fails fast instead of hanging
async function fetchTimeout(url: string, ms = 15000): Promise<Response> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); }
}
// fetch a Google Fonts CSS (subset to deckChars) and inline every gstatic woff2 as a data URI.
// woff2 files are downloaded in PARALLEL (Promise.all) — embedding a CJK family is many faces.
async function inlineGoogleCss(cssUrl: string, chars: string): Promise<string> {
  const url = cssUrl.replace(/&amp;/g, '&') + '&text=' + encodeURIComponent(chars);
  const css = await (await fetchTimeout(url)).text();
  const urls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)).map((m) => m[1]);
  const pairs = await Promise.all(urls.map(async (u) => {
    try { return [u, 'data:font/woff2;base64,' + abToBase64(await (await fetchTimeout(u)).arrayBuffer())]; }
    catch { return [u, u]; } // leave remote if a single file fails
  }));
  let out = css;
  for (const [orig, rep] of pairs) if (orig !== rep) out = out.split(orig).join(rep);
  return out;
}
// rewrite an assembled deck so every Google font becomes a self-contained @font-face block
async function embedFonts(html: string): Promise<string> {
  // gather Google Fonts CSS URLs from both <link> tags and @import rules
  const urls = new Set<string>();
  for (const m of html.matchAll(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"[^>]*>/g)) urls.add(m[1]);
  for (const m of html.matchAll(/@import\s+url\((['"]?)(https:\/\/fonts\.googleapis\.com\/css2[^'")]+)\1\)/g)) urls.add(m[2]);
  if (!urls.size) return html;
  const chars = deckChars();
  // all font families resolved in parallel (each also parallelizes its woff2 downloads)
  const faces = await Promise.all(Array.from(urls).map((u) => inlineGoogleCss(u, chars)));
  const out = html
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, '') // drop remote links/preconnects
    .replace(/@import\s+url\((['"]?)https:\/\/fonts\.googleapis\.com\/css2[^'")]+\1\)\s*;?/g, '') // and @imports
    ;
  return insertBeforeHeadEnd(out, '<style id="sm-embedded-fonts">\n' + faces.join('\n') + '\n</style>\n');
}
// the bytes we save/download: assembled deck, optionally with fonts inlined for offline use
async function buildExportHtml(): Promise<string> {
  const html = exportHtmlDeck();
  if (!embedFontsChecked()) return html;
  setBusy('正在下载并嵌入字体子集，首次稍慢…');
  try { const out = await embedFonts(html); setBusy(null); toast('已嵌入字体，离线可用'); return out; }
  catch (e) { setBusy(null); toast('嵌入字体失败（需联网下载），已改为不嵌入字体导出：' + (e as Error).message, true); return html; }
}

// ======================= N3: Submit-to-AI single-slide loop =======================
// the target slide for a request = the slide of the selected element, else the deck's
// active slide, else the left-list selection.
function currentHtmlSlideIndex(): number {
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  if (d) {
    const all = Array.prototype.slice.call(d.querySelectorAll('#deck .slide')) as Element[];
    if (htmlSelEl) { const sec = (htmlSelEl as HTMLElement).closest('#deck .slide'); const i = sec ? all.indexOf(sec) : -1; if (i >= 0) return i; }
    const active = d.querySelector('#deck .slide.active'); if (active) { const i = all.indexOf(active); if (i >= 0) return i; }
  }
  return Math.max(0, Math.min(cur, htmlSlides.length - 1));
}
let aiCurId = ''; // slide id the comment textarea currently maps to
let aiDeckInstruction = ''; // the deck-level ask ("对整份 deck 说…"), one task for the whole deck
function saveAiInstruction(): void {
  // persist the textarea into the current page's comment. Does NOT touch the
  // applied-state — only an explicit user edit (input handler) re-queues a page.
  if (!aiCurId) return;
  const v = (($('#aiInstruction') as HTMLTextAreaElement | null)?.value || '').trim();
  if (v) aiInstructions[aiCurId] = v; else delete aiInstructions[aiCurId];
}
// the user actually typed in the comment box → it's a fresh request for this page
function onAiInput(): void { saveAiInstruction(); if (aiCurId) { aiApplied.delete(aiCurId); aiSent.delete(aiCurId); } refreshTasks(); }
// pending pages = pages with a comment that is neither sent-and-waiting nor applied
function aiPendingCount(): number { return Object.keys(aiInstructions).filter((k) => aiInstructions[k] && !aiApplied.has(k) && !aiSent.has(k)).length; }
// pages sent to Claude and still waiting for a patch back
function aiWaitingCount(): number { return [...aiSent].filter((id) => !aiApplied.has(id) && aiInstructions[id]).length; }
// the animated reminder banner: shows while tasks are out with Claude
function refreshSentBanner(): void {
  const el = $('#aiSentBanner'); if (!el) return;
  const n = aiWaitingCount();
  if (n > 0) { el.style.display = ''; el.innerHTML = `<span class="aisent-dot">●</span><span>已发送 ${n} 个任务，Claude 正在修改，完成后将自动更新</span>`; }
  else el.style.display = 'none';
}
// one call to re-sync everything that depends on comments/config/status
function refreshTasks(): void { renderLeft(); renderTodo(); refreshSentBanner(); refreshNotesStatus(); }
/**
 * 把「现在选中的是哪一页」报给桥。
 *
 * 这样 app 里的 Claude 面板就能自己知道你在看哪页，不用你每次打字说「第 12 页」。
 * 报的是**页码 + data-id + 标题**：id 给工具用，页码和标题给人看。
 * 发不出去就算了（没连桥 / 网页版直接开的），这只是个增强。
 */
let lastSelectionKey = '';
function tellBridge(payload: Record<string, unknown>): void {
  const ws = bridge.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;   // 网页版直接开的没有桥
  try { ws.send(JSON.stringify(payload)); } catch { /* 发不出去就算了，这只是增强 */ }
}
function reportSelection(index: number, slide: { id: string; title: string } | undefined): void {
  const key = index + '|' + (slide ? slide.id : '');
  if (key === lastSelectionKey) return;         // 同一页别反复发
  lastSelectionKey = key;
  tellBridge({
    type: 'selection', index: index + 1, total: htmlSlides.length,
    id: slide ? slide.id : '', title: slide ? slide.title : '',
  });
}
/**
 * 深浅色也报给桥。
 *
 * app 里其实有**两个**主题开关：Studio 顶栏这个 ◐（管网页那半边）和系统外观
 * （管原生的 Claude 面板）。用户点了 ◐ 之后左边黑了右边还白着，看着像坏了。
 * 报上去之后由 app 把整个窗口的外观跟着切，一个开关管两边。
 */
function reportTheme(): void {
  tellBridge({ type: 'theme', dark: document.body.classList.contains('dark') });
}
function updateAiTarget(): void {
  if (mode !== 'html') return;
  saveAiInstruction(); // persist the page we're leaving
  const i = Math.max(0, Math.min(cur, htmlSlides.length - 1)); const s = htmlSlides[i];
  const el = $('#aiTargetTxt'); if (el) el.textContent = s ? `本页：第 ${i + 1} 页 · ${s.title}` : '本页：—';
  const applied = !!(s && aiApplied.has(s.id));
  const chip = $('#aiAppliedChip'); if (chip) chip.style.display = applied ? '' : 'none';
  const rev = $('#aiRevertOne'); if (rev) rev.style.display = (applied && aiBefore[s!.id] !== undefined) ? '' : 'none';
  aiCurId = s ? s.id : '';
  reportSelection(i, s);
  const box = $('#aiInstruction') as HTMLTextAreaElement | null;
  if (box) box.value = aiCurId ? (aiInstructions[aiCurId] || '') : '';
  updateTrayTarget();
  renderTodo();
}
// the active slide as the DECK sees it (ignores any stale element selection), so
// navigating with the deck's own nav reliably moves the comment box to that page.
function activeSlideIndex(): number {
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  if (d) {
    const all = Array.prototype.slice.call(d.querySelectorAll('#deck .slide')) as Element[];
    const a = d.querySelector('#deck .slide.active'); if (a) { const i = all.indexOf(a); if (i >= 0) return i; }
  }
  return Math.max(0, Math.min(cur, htmlSlides.length - 1));
}
let navSyncTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncIdx = -1;
function startHtmlNavSync(): void {
  if (navSyncTimer) clearInterval(navSyncTimer);
  lastSyncIdx = -1;
  navSyncTimer = setInterval(() => {
    if (mode !== 'html') { if (navSyncTimer) clearInterval(navSyncTimer); navSyncTimer = null; return; }
    const idx = activeSlideIndex();
    if (idx === lastSyncIdx) return;
    lastSyncIdx = idx; cur = idx;
    // a selection from another page no longer applies → drop it so the comment follows the page
    if (htmlSelEl) {
      const d = ($('#preview') as HTMLIFrameElement).contentDocument;
      const all = d ? Array.prototype.slice.call(d.querySelectorAll('#deck .slide')) as Element[] : [];
      if (all.indexOf((htmlSelEl as HTMLElement).closest('#deck .slide') as Element) !== idx) {
        deselectHtml();
      }
    }
    renderLeft(); updateAiTarget();
  }, 300);
}
function tokensForRequest(): string {
  const keys = ['--accent', '--accent-2', '--paper', '--ink', '--ink-2', '--font-display', '--font-sans', '--t-display', '--t-h1', '--t-h2', '--t-body', '--pad-x', '--pad-y'];
  const out: string[] = [];
  keys.forEach((k) => { const v = H.overrides[k] || H.baseTokens[k]; if (v) out.push('- `' + k + '`: ' + v); });
  return out.join('\n') || '（未解析到令牌）';
}
const FENCE = '```';
// This file IS the prompt handed to an AI. It frames the role/task and (critically)
// tells the AI to PRODUCE a Slidesmith-importable patch file.
function aiRequestHeader(scope: string): string {
  return `# Slidesmith 修改任务 — 给 AI 的 prompt (${scope})

你是 Slidesmith 的幻灯片修改助手。请**读完本文件**，按下面每一页的「修改要求」改写对应页，
遵守 Deck 契约（见仓库 \`AGENTS.md\` / \`docs/DECK-CONTRACT.md\`：颜色/字号走令牌、勿内联硬值），
然后**生成一个 Slidesmith 可直接导入的补丁文件**（格式见文末「输出要求」）。

- deck: \`${fileBase}\`

## 设计令牌（改写时沿用，保持风格一致）
${tokensForRequest()}

---
`;
}
// the deck-level ask (the human's "对整份 deck 说…") + a structure overview so the
// AI can decide *which* pages to touch and return their <section data-id>.
function aiDeckBlock(): string {
  return `## 对整份 deck 的要求（你来挑相关页改，返回这些页的 \`<section data-id>\`）
${aiDeckInstruction.trim()}

### deck 结构总览（页号 · data-id · 标题）
${htmlSlides.map((s, i) => `- 第 ${i + 1} 页 · \`${s.id}\` · ${s.title}`).join('\n')}

---
`;
}
function aiOutputSpec(): string {
  return `
---

## 输出要求（务必照做）
把所有改写后的页拼进**一个文件**，文件名用 **\`${fileBase}.patch.html\`**，内容**只**是若干 \`<section>\`：

${FENCE}html
<section class="slide …" data-id="<原样保留的 id>">…改写后的整页…</section>
<section class="slide …" data-id="<另一页的 id>">…</section>
${FENCE}

规则：
1. **每改一页输出一个 \`<section>\`，且必须保留原来的 \`data-id\`**（Slidesmith 靠它精准替换对应页）。
2. 不要输出 \`<html>\`/\`<head>\`、不要整份 deck、不要解释文字——文件里只有这些 \`<section>\`。
3. 通常你（Claude Code）会直接用 \`slidesmith_apply_patch\` 把这些 \`<section>\` 回写到 Studio，当场只替换对应页、其它页不动。
4. **动画**：**优先**用声明式标准标签落在 slide 元素上——入场 \`data-anim\` · 强调 \`data-emph\` · 持续 \`data-motion\` · 退场 \`data-anim-out\` · canvas 特效 \`data-fx\` · 分步 \`class="fragment"\` · 神奇移动相邻两页同名 \`data-morph\`（编号 A–J → 属性值见技能内 \`references/animations.md\`，用户对你说编号即照表落）。
   用标准标签的好处：Studio 渲染时自动注入引擎播放、选中元素时「快速设置」下拉能读回并继续微调、换肤与一键关闭都正常——所以**能用标签就别自己写 keyframes**。
   **但你保留灵活性**：库里没有的新效果，可用页内 scoped \`<style>\` 自定义（务必 scope 到 \`[data-id="…"]\` 且加 \`@media (prefers-reduced-motion:reduce)\` 降级）。代价：自定义部分快速设置读不到（显示「无」），但仍能播。
   提示：用户也可在 Studio「动画效果 → 打开动画库」里**可视化挑选直接套用**，那条路不经过你。
`;
}
function applyAiPatch(text: string, preview = false): void {
  if (mode !== 'html') { toast('请先导入 HTML deck', true); return; }
  let html = text;
  const m = text.match(/```html\s*([\s\S]*?)```/i); if (m) html = m[1];
  let secs: Element[];
  try { secs = Array.prototype.slice.call(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('section.slide')) as Element[]; }
  catch (e) { toast('补丁解析失败: ' + (e as Error).message, true); return; }
  if (!secs.length) { toast('补丁里没找到 <section class="slide">', true); return; }
  pushHistory('ai'); // so the user can Ctrl/⌘+Z an AI change too
  harvestAll(); // preserve other slides' manual edits before re-render
  let applied = 0, firstIdx = -1, imgs = 0; const ids: string[] = [];
  secs.forEach((sec) => {
    let id = sec.getAttribute('data-id');
    let idx = id ? htmlSlides.findIndex((s) => s.id === id) : -1;
    if (idx < 0 && secs.length === 1) { idx = currentHtmlSlideIndex(); id = htmlSlides[idx]?.id || null; } // lenient fallback
    if (idx >= 0 && htmlSlides[idx]) { if (id) { sec.setAttribute('data-id', id); if (aiBefore[id] === undefined) aiBefore[id] = htmlSlides[idx].html; aiApplied.add(id); aiSent.delete(id); ids.push(id); if (preview) proposed.add(id); } imgs += backfillTrayImages(sec); htmlSlides[idx].html = sec.outerHTML; applied++; if (firstIdx < 0) firstIdx = idx; }
  });
  if (!applied) { toast('补丁的 data-id 不匹配任何页', true); return; }
  if (imgs) renderTray(); // mark just-placed tray images
  htmlGotoAfterRender = firstIdx; // stay on the patched slide after re-render
  renderHtmlEdit(); refreshTasks(); markDirty();
  if (preview) { refreshProposalBar(); toast('AI 提议修改 ' + applied + ' 页，请在顶部「保留 / 还原」'); }
  else toast('AI 已修改 ' + applied + ' 页（左侧带勾标记），如不满意可使用「还原本页」');
}
// the proposal bar (改前先问我 mode): AI's patch is applied but flagged. The user
// keeps all (dismiss) or reverts all (back to pre-AI). Reuses aiBefore for revert.
function refreshProposalBar(): void {
  const bar = $('#aiProposalBar'); if (!bar) return;
  if (!proposed.size) { bar.style.display = 'none'; return; }
  const txt = $('#aiProposalTxt'); if (txt) txt.textContent = `AI 提议了 ${proposed.size} 页改动，请确认`;
  bar.style.display = '';
}
function keepProposed(): void { proposed.clear(); refreshProposalBar(); toast('已保留 AI 的改动'); }
function revertProposed(): void {
  const ids = [...proposed]; proposed.clear();
  ids.forEach((id) => { if (aiBefore[id] !== undefined) revertSlide(id); });
  refreshProposalBar(); toast('已还原 AI 提议的改动');
}
// revert one slide to the version it had right before AI changed it. The page's
// comment stays, so it goes back to 待发送 (you can edit + re-send).
function revertSlide(id: string): void {
  if (aiBefore[id] === undefined) return;
  const idx = htmlSlides.findIndex((s) => s.id === id); if (idx < 0) return;
  pushHistory('revert');
  harvestAll(); // keep other slides' current state
  htmlSlides[idx].html = aiBefore[id];
  delete aiBefore[id]; aiApplied.delete(id); aiSent.delete(id);
  htmlGotoAfterRender = idx;
  renderHtmlEdit(); refreshTasks(); markDirty();
  toast('已还原第 ' + (idx + 1) + ' 页到 AI 改之前');
}

// ======================= N4: in-Studio visual audit (M8 for humans) =======================
interface DeckFinding { index: number; id: string; level: 'error' | 'warn'; code: string; msg: string }
function parseRgb(s: string): [number, number, number, number] | null {
  const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
}
function relLum(c: number[]): number {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrastRatio(a: number[], b: number[]): number {
  const la = relLum(a), lb = relLum(b), hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05);
}
function effBg(win: Window, el: Element): [number, number, number, number] {
  let n: Element | null = el;
  while (n && n !== win.document.documentElement) { const c = parseRgb(win.getComputedStyle(n).backgroundColor); if (c && c[3] > 0.1) return c; n = n.parentElement; }
  const b = parseRgb(win.getComputedStyle(win.document.body).backgroundColor); return b && b[3] > 0.1 ? b : [12, 13, 17, 1];
}
// Measure the RENDERED deck (what the IR-level checks can't see): content clipped by
// the fixed 1920x1080 frame, unreadable contrast, broken images. Layout metrics
// (scrollHeight/clientHeight, computed styles) are transform-immune, so the 0.55 fit
// scale doesn't matter.
function auditImportedDeck(): DeckFinding[] {
  const ifr = $('#preview') as HTMLIFrameElement; const d = ifr.contentDocument; const win = ifr.contentWindow;
  if (!d || !win) return [];
  const out: DeckFinding[] = [];
  (Array.prototype.slice.call(d.querySelectorAll('#deck .slide')) as HTMLElement[]).forEach((slide, idx) => {
    const id = htmlSlides[idx]?.id || ('#' + (idx + 1));
    const vOver = slide.scrollHeight - slide.clientHeight, hOver = slide.scrollWidth - slide.clientWidth;
    if (vOver > 6) out.push({ index: idx + 1, id, level: 'error', code: 'overflow-y', msg: `内容超出页面高度约 ${Math.round(vOver)}px，底部会被裁掉` });
    if (hOver > 6) out.push({ index: idx + 1, id, level: 'error', code: 'overflow-x', msg: `内容超出页面宽度约 ${Math.round(hOver)}px，右侧会被裁掉` });
    let cc = 0;
    const els = Array.prototype.slice.call(slide.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,cite,td,th,figcaption,.title,.lead,.body,.eyebrow,.callout,.keyline')) as HTMLElement[];
    for (const el of els) {
      if (cc >= 2) break;
      const tx = (el.textContent || '').trim(); if (!tx) continue;
      if (el.querySelector('div,section,ul,ol,figure,table,svg,img')) continue; // skip containers
      const cs = win.getComputedStyle(el); const fg = parseRgb(cs.color); if (!fg || fg[3] < 0.1) continue;
      const cr = contrastRatio(fg, effBg(win, el.parentElement || el));
      const fpx = parseFloat(cs.fontSize) || 16; const wt = parseInt(cs.fontWeight, 10) || 400;
      const min = (fpx >= 24 || (fpx >= 18.66 && wt >= 700)) ? 3 : 4.5;
      if (cr < min) { out.push({ index: idx + 1, id, level: cr < 3 ? 'error' : 'warn', code: 'contrast', msg: `文字对比度仅 ${cr.toFixed(1)}:1（建议 ≥${min}）——“${tx.slice(0, 12)}…”` }); cc++; }
    }
    (Array.prototype.slice.call(slide.querySelectorAll('img')) as HTMLImageElement[]).forEach((img) => {
      if (img.complete && img.naturalWidth === 0) out.push({ index: idx + 1, id, level: 'error', code: 'image-broken', msg: `图片加载失败：${img.getAttribute('src') || '(空)'}` });
    });
  });
  return out;
}
function renderAuditReport(findings: DeckFinding[]): void {
  const box = $('#auditOut'); if (!box) return; box.innerHTML = '';
  const e = findings.filter((f) => f.level === 'error').length;
  const sum = document.createElement('div'); sum.className = 'audit-sum';
  sum.textContent = findings.length ? `${e} 处问题 · ${findings.length - e} 处提醒（点击条目可跳转到对应页）` : '未发现明显的溢出 / 对比度 / 坏图问题';
  box.appendChild(sum);
  findings.forEach((f) => {
    const r = document.createElement('div'); r.className = 'audit-row ' + f.level;
    r.innerHTML = `<b>第${f.index}页</b> ${esc(f.msg)}`;
    r.addEventListener('click', () => selectHtmlSlide(f.index - 1));
    box.appendChild(r);
  });
}

// ======================= N4: PDF export (browser print, offline) =======================
function pdfPrintHtml(): string {
  const printCss = '<style id="sm-print-fix">@media print{@page{size:1920px 1080px;margin:0}'
    + '.topbar,.segnav,.progress,.hint,.sm-nav,.sm-topbar,.sm-sidebar{display:none!important}'
    + 'html,body{background:#fff!important;margin:0!important;padding:0!important;overflow:visible!important}'
    + '.deck{display:block!important;margin:0!important;padding:0!important;gap:0!important}'
    + '.slide-wrap{width:1920px!important;height:1080px!important;margin:0!important}'
    + '.slide{position:relative!important;display:flex!important;transform:none!important;width:1920px!important;height:1080px!important;box-shadow:none!important;page-break-after:always;break-after:page}'
    + '.slide:last-child{page-break-after:auto;break-after:auto}'
    + '.slide [data-anim],.slide [data-anim] *,.slide [data-motion]{opacity:1!important;animation:none!important}}</style>';
  const full = mode === 'html' ? (harvestAll(), assembleDeck(false)) : renderDeckHtml(deck);
  return insertBeforeHeadEnd(full, printCss);
}
// Fallback: the old browser-print path (for standalone file:// use, no bridge). The
// user must pick 另存为 PDF + Margins:None — and even then Chrome leaves white margins
// because Save-as-PDF ignores @page{size} unless preferCSSPageSize is set, which only
// the bridge route below can do. So this is the lesser path, used only when no bridge.
function exportPdfViaPrint(): void {
  const w = window.open('', '_blank'); if (!w) { toast('请允许弹窗以导出 PDF', true); return; }
  w.document.open(); w.document.write(pdfPrintHtml()); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 700);
  toast('已打开打印窗口：目标选「另存为 PDF」、边距选「无」（连上 Claude 后可一键满版导出）');
}
async function exportPdf(): Promise<void> {
  // Preferred: when Studio is served by the bridge, render the PDF there with
  // preferCSSPageSize → pixel-exact full-bleed 16:9, one click, no dialog fiddling.
  if (location.protocol.startsWith('http')) {
    const btn = $('#expPdf') as HTMLButtonElement | null;
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }
    toast('正在生成满版 PDF…');
    try {
      const r = await fetch(`${libBase()}/api/export-pdf?name=${encodeURIComponent(fileBase)}.html`, {
        method: 'POST', headers: { 'content-type': 'text/html;charset=utf-8' }, body: pdfPrintHtml(),
      });
      const j = await r.json() as { ok: boolean; path?: string; error?: string };
      if (j.ok && j.path) { toast('✅ 已导出满版 PDF：' + j.path + '（已自动打开）'); return; }
      toast('PDF 导出失败：' + (j.error || '未知错误') + '，改用打印窗口', true);
    } catch {
      // older bridge without the endpoint, or network hiccup → fall through to print
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }
  exportPdfViaPrint();
}
const RAIL_KEY = 'slidesmith-rail-collapsed';
/** 折叠 / 展开右栏。窄条上的 tab 名字按当前模式（HTML / Markdown）现建。 */
function setRightCollapsed(on: boolean): void {
  document.body.classList.toggle('panelcollapsed', on);
  try { localStorage.setItem(RAIL_KEY, on ? '1' : '0'); } catch { /* noop */ }
  if (on) renderRailStrip();
}
// 折叠窄条只有 34px 宽。原先竖排汉字（writing-mode:vertical-rl）在这个宽度下
// 「动/画/效/果」变成一字一行，几乎读不出来 → 改成图标 + tooltip（悬停给全名）。
const RAIL_ICON_WRAP = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const RAIL_ICONS: Record<string, string> = {
  ai: RAIL_ICON_WRAP + '<path d="M7.4 2.2l1.3 3.5 3.5 1.3-3.5 1.3-1.3 3.5-1.3-3.5L2.6 7l3.5-1.3z" fill="currentColor" stroke="none"/><path d="M13.2 10.4l.75 2 2 .75-2 .75-.75 2-.75-2-2-.75 2-.75z" fill="currentColor" stroke="none"/></svg>',
  script: RAIL_ICON_WRAP + '<rect x="3.4" y="2.4" width="11.2" height="13.2" rx="1.7"/><path d="M6.1 6.1h5.8M6.1 9h5.8M6.1 11.9h3.8"/></svg>',
  fmt: RAIL_ICON_WRAP + '<path d="M4.3 14.8L9 3.2l4.7 11.6"/><path d="M6.2 10.6h5.6"/></svg>',
  anim: RAIL_ICON_WRAP + '<circle cx="6.6" cy="9" r="3.1"/><path d="M11.6 4.9a6 6 0 010 8.2"/><path d="M14.1 2.6a9.3 9.3 0 010 12.8"/></svg>',
  design: RAIL_ICON_WRAP + '<path d="M9 2.3c-3.7 0-6.7 2.9-6.7 6.6 0 3.7 3 6.7 6.7 6.7 1 0 1.7-.7 1.7-1.5 0-.4-.15-.7-.4-1a1.3 1.3 0 01.95-2.2h1.4c1.9 0 3.05-1.5 3.05-3.4 0-3-2.95-5.2-6.7-5.2z"/><circle cx="5.9" cy="7.6" r=".95" fill="currentColor" stroke="none"/><circle cx="9" cy="5.6" r=".95" fill="currentColor" stroke="none"/><circle cx="12.2" cy="7.6" r=".95" fill="currentColor" stroke="none"/></svg>',
};
function renderRailStrip(): void {
  const box = $('#railStripTabs'); if (!box) return;
  // 哪条 tab 栏正开着就抄哪条 —— 两种模式的 tab 不一样，写死一份迟早对不上
  const htmlOn = ($('#htmlpanel') as HTMLElement | null)?.style.display !== 'none';
  const tabs = Array.from(document.querySelectorAll(htmlOn ? '.htab' : '.tab')) as HTMLElement[];
  box.innerHTML = '';
  tabs.forEach((t) => {
    const label = (t.textContent || '').trim();
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'striptab' + (t.classList.contains('active') ? ' active' : '');
    b.innerHTML = RAIL_ICONS[t.dataset.icon || ''] || '<span class="stlabel">' + esc(label.slice(0, 1)) + '</span>';
    b.title = t.getAttribute('title') || label;   // 折叠时名字靠 tooltip 给
    b.setAttribute('aria-label', label);
    // 点窄条上的图标 = 展开 + 直接切到那一页，不用展开后再找一次
    b.addEventListener('click', () => { setRightCollapsed(false); t.click(); });
    box.appendChild(b);
  });
}

function setHtmlMode(on: boolean): void {
  const p = $('#htmlpanel'); if (p) p.style.display = on ? '' : 'none';
  // hide only the IR tabs + IR panes (the inspector has its own .pane w/o data-pane)
  document.querySelectorAll('.tabs,[data-pane]').forEach((el) => ((el as HTMLElement).style.display = on ? 'none' : ''));
  const lbar = document.querySelector('.lbar') as HTMLElement | null; if (lbar) lbar.style.display = on ? 'none' : '';
  // undo/redo + autosave only apply to HTML mode → show/hide their chrome
  ['#undoBtn', '#redoBtn'].forEach((s) => { const b = $(s); if (b) b.style.display = on ? '' : 'none'; });
  updateDirtyBadge();
  // keep the slide list visible in html mode too — it's now the task navigator
  // (per-slide comment badges live on it). The user can still collapse via ☰.
  if (!on) document.body.classList.remove('navcollapsed');
  if (document.body.classList.contains('panelcollapsed')) renderRailStrip();
}
// offer to restore a draft saved before a refresh/crash (HTML mode only)
function maybeOfferDraftRestore(): void {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch { return; }
  if (!raw) return;
  let d: { name?: string; ts?: number; html?: string };
  try { d = JSON.parse(raw); } catch { return; }
  if (!d || !d.html) return;
  const bar = $('#restoreBar'); const txt = $('#restoreTxt'); if (!bar || !txt) return;
  const when = d.ts ? new Date(d.ts).toLocaleString('zh-CN', { hour12: false }) : '';
  txt.innerHTML = '发现未保存的草稿 <b>' + esc(d.name || 'deck') + '</b>' + (when ? ' · ' + when : '');
  bar.style.display = '';
  $('#restoreGo').onclick = () => { bar.style.display = 'none'; importFile((d.name || 'deck') + '.html', d.html as string); toast('已恢复草稿，保存前请重新选择目标文件以覆盖'); };
  $('#restoreDrop').onclick = () => { bar.style.display = 'none'; clearDraft(); };
}

let toastT: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string, bad = false): void {
  const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (bad ? ' bad' : '');
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(() => (el.className = 'toast'), 2200);
}
// persistent busy line for multi-second jobs (e.g. font embedding); pass null to hide
function setBusy(msg: string | null): void {
  const el = $('#busy'); if (!el) return;
  if (msg) { const t = $('#busyTxt'); if (t) t.textContent = msg; el.classList.add('show'); } else el.classList.remove('show');
}
// dark / light Studio chrome, remembered across sessions
const THEME_KEY = 'sm-studio-theme';
function applyStudioTheme(dark: boolean): void {
  document.body.classList.toggle('dark', dark);
  const b = $('#themeTog'); if (b) b.title = dark ? '切换为浅色界面' : '切换为深色界面';
}
/**
 * 在 app 壳里跑的时候，把顶栏上重复的那两样收掉。
 *
 * app 的标题栏已经有一颗「● deck 文件名」的药丸，菜单栏上也写着 Slidesmith Studio；
 * 顶栏再写一遍就是同一个字符串在屏幕上出现两次，白占地方。网页版单开时它们是
 * 必要的（那时候没有别的地方写），所以只在 `?host=app` 时藏。
 */
function markAppHost(): void {
  try {
    if (new URLSearchParams(location.search).get('host') === 'app') {
      document.body.classList.add('inapp');
    }
  } catch { /* noop */ }
}
function initStudioTheme(): void {
  let dark = false; try { dark = localStorage.getItem(THEME_KEY) === 'dark'; } catch { /* noop */ }
  applyStudioTheme(dark);
}
function toggleStudioTheme(): void {
  const dark = !document.body.classList.contains('dark');
  applyStudioTheme(dark);
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* noop */ }
  reportTheme();          // app 里的原生面板跟着切，一个开关管两边
}

// ======================= bridge: connected mode =======================
function updateBridgeBadge(): void {
  const b = $('#bridgeBadge');
  if (b) {
    // once handshook, name the session + port so it's unambiguous which Claude is on
    // the other end (no more "did my request land in the right session?").
    let label = '';
    if (bridge.connected) {
      label = '● 已连接 Claude';
      if (bridge.owner && bridge.owner.label) label += ' · 会话 ' + bridge.owner.label;
      if (bridge.port) label += ' · 端口 ' + bridge.port;
    }
    b.textContent = label; b.className = 'bridge-badge' + (bridge.connected ? ' on' : '');
    b.title = bridge.connected
      ? (bridge.owner ? '已与 Claude 握手：' + bridge.owner.label + '（端口 ' + bridge.port + '）。修改请求只会发给这个会话。' : '已连接，等待 Claude 握手（运行 /slidesmith）')
      : '与 Claude Code 的连接状态';
  }
  // when NOT connected, offer the one-click "连接 Claude" button (hidden once connected)
  const cb = $('#connectBtn'); if (cb) cb.style.display = bridge.connected ? 'none' : '';
  renderTodo();
}

// ======================= one-click 连接 Claude (offline → connected hand-off) =======================
// A browser page can't launch a server, so this button DETECTS the local bridge and
// jumps you to the connected Studio (carrying your current deck). When the bridge isn't
// up yet it shows dead-simple steps + auto-retries until it appears.
function bridgeUrl(): string { return (window as unknown as { __SM_BRIDGE_URL__?: string }).__SM_BRIDGE_URL__ || 'http://localhost:8765/'; }
let cProbeTimer: ReturnType<typeof setInterval> | null = null;
async function probeBridgeOnce(): Promise<boolean> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(bridgeUrl() + 'healthz', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t); return r.ok;
  } catch { return false; }
}
async function openConnected(): Promise<void> {
  // hand the current deck to the bridge first (best-effort), then open the connected Studio
  if (mode === 'html') {
    try { await fetch(bridgeUrl() + 'api/open?name=' + encodeURIComponent(fileBase + '.html'), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: exportHtmlDeck() }); } catch { /* best effort */ }
  }
  window.location.href = bridgeUrl();
}
function renderConnectState(found: boolean): void {
  const box = $('#cstate'); if (!box) return;
  if (found) {
    box.innerHTML = '<div class="cstatus ok">已检测到本地服务，可以连接 Claude。</div>'
      + '<button id="cgo" class="primary-mini" style="width:100%;margin-top:12px;padding:10px">打开已连接的 Studio（携带当前 deck）</button>'
      + '<div class="cfaint">将在 ' + bridgeUrl() + ' 打开已连接版本并自动连接 Claude，当前的修改会一并带入。</div>';
    const go = $('#cgo'); if (go) go.addEventListener('click', openConnected);
  } else {
    box.innerHTML = '<div class="cstatus">正在检测本地服务，启动 Claude Code 后会自动连接。</div>'
      + '<div class="chint">连接方式</div>'
      + '<ol class="csteps"><li>打开 <b>Claude Code</b></li>'
      + '<li>对它说「<b>用 slidesmith 打开这份 slides</b>」，或输入 <code>/slidesmith</code></li>'
      + '<li>它会自动启动服务并弹出一个<b>已连接</b>的 Studio，在该版本中编辑即可</li></ol>'
      + '<div class="cfaint">检测到服务后，上方会变为绿色并出现「打开已连接版本」按钮。<br>也可在仓库目录运行 <code>npm run sm -- serve</code>。</div>';
  }
}
function openConnectModal(): void {
  const m = $('#connectModal'); if (!m) return; m.style.display = 'flex';
  const tick = async () => renderConnectState(await probeBridgeOnce());
  tick(); if (cProbeTimer) clearInterval(cProbeTimer); cProbeTimer = setInterval(tick, 2000);
}
function closeConnectModal(): void {
  const m = $('#connectModal'); if (m) m.style.display = 'none';
  if (cProbeTimer) { clearInterval(cProbeTimer); cProbeTimer = null; }
}
// push the current full deck html back to the bridge (keeps its copy authoritative)
function syncExportToBridge(): void {
  if (!bridge.connected || !bridge.ws || bridge.ws.readyState !== WebSocket.OPEN || mode !== 'html') return;
  try { bridge.ws.send(JSON.stringify({ type: 'exported', name: fileBase + '.html', html: exportHtmlDeck() })); } catch { /* noop */ }
}
function connectBridge(): void {
  // only when served over http(s) — file:// has no host to dial back to
  if (!/^https?:$/.test(location.protocol) || !location.host) { updateBridgeBadge(); return; }
  let ws: WebSocket;
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); }
  catch { updateBridgeBadge(); return; }
  bridge.ws = ws;
  ws.addEventListener('open', () => {
    bridge.connected = true; bridge.everConnected = true; bridge.tries = 0;
    updateBridgeBadge(); toast('已连接 Claude Code');
    // **桥空手上线时，把我们手里这份报给它。** 桥重启过、或者 deck 是在桥起来之前
    // 就打开的话，桥那边 hasDeck 一直是 false —— AI 看到的是「Studio 里没打开任何
    // deck」，而屏幕上明明开着。
    //
    // 先问一句再推，不能直接推：桥自己有 deck 的话，它在连上这一刻就会推 import
    // 下来，两条消息撞在一起会把用户开着的那份换成桥手里的旧货。
    setTimeout(() => {
      if (mode !== 'html' || !htmlSlides.length) return;
      fetch('/api/status').then((r) => r.json()).then((st: { hasDeck?: boolean }) => {
        if (!st.hasDeck) syncExportToBridge();
      }).catch(() => { /* 老桥没有这个接口就算了 */ });
    }, 700);
  });
  ws.addEventListener('message', (e: MessageEvent) => {
    let m: { type?: string; name?: string; html?: string; text?: string; preview?: boolean; owner?: { label: string; since: number } | null; port?: number;
      cues?: Record<string, string[]>; replace?: boolean; watchJs?: string; replaceWatch?: boolean;
      anchors?: string[]; segments?: Record<string, string> };
    try { m = JSON.parse(String(e.data)); } catch { return; }
    // hello carries the handshake: which session owns this bridge + its port. Re-sent
    // after a handshake, so the badge updates the moment Claude runs /slidesmith.
    if (m.type === 'hello') {
      bridge.owner = m.owner || null; bridge.port = m.port || 0; updateBridgeBadge();
      reportTheme();      // 刚连上就报一次，否则 app 启动时不知道该用深还是浅
    }
    else if (m.type === 'import' && typeof m.html === 'string') { importedFromBridge = true; importFile(m.name || 'deck.html', m.html); importedFromBridge = false; }
    // after applying a patch, sync the updated full deck back so the bridge's
    // in-memory copy stays current (late-joiners / reconnects see the change)
    else if (m.type === 'patch' && typeof m.text === 'string') { applyAiPatch(m.text, !!m.preview); setTimeout(syncExportToBridge, 500); }
    // 桥要一份最新的 deck（AI 读页之前会问一次）。**手打的编辑只有这条路能传上去**——
    // 保存/导出/AI 补丁之外，桥手里那份一直是旧的，AI 照旧内容重写就会盖掉手改。
    else if (m.type === 'sync-request') syncExportToBridge();
    // 手表提词。读走 cues-request，写走 set-cues —— apply_patch 够不着 #deck 之外的
    // __SM_CUES__，所以提词必须有自己的一条道。两条都用 {type:'cues'} 回话。
    else if (m.type === 'cues-request') sendCueReport();
    else if (m.type === 'set-cues' && m.cues && typeof m.cues === 'object') applyCuePatch(m.cues, !!m.replace);
    else if (m.type === 'enable-watch' && typeof m.watchJs === 'string') enableWatchMode(m.watchJs, !!m.replaceWatch);
    // 讲稿。同理：__TXB64__ 也在 #deck 之外，apply_patch 够不着。
    else if (m.type === 'notes-request') sendNotesReport(Array.isArray(m.anchors) ? m.anchors : []);
    else if (m.type === 'set-notes' && m.segments && typeof m.segments === 'object') applyNotesPatch(m.segments);
  });
  ws.addEventListener('close', () => {
    bridge.connected = false; bridge.ws = null; updateBridgeBadge();
    // reconnect only if we had a working link before (bridge restarted) or are
    // still in the first few attempts — avoids hammering when there's no server.
    if (bridge.everConnected || bridge.tries < 3) { bridge.tries++; setTimeout(connectBridge, 1500); }
  });
  ws.addEventListener('error', () => { try { ws.close(); } catch { /* noop */ } });
}

// ---------------- UI ----------------
const CSS = `
/* ===== Studio 界面设计令牌 =====================================================
   「--sm-*」前缀是有意的：deck 自己的令牌叫 --accent / --ink / --paper（换皮和
   调色板在用），两套名字撞上会非常难查。界面的一律 --sm- 开头。
   深色模式只重定义这些变量，不再逐条 body.dark 覆盖。
   ============================================================================ */
:root{
  --sm-bg:#f4f4f5;            /* 窗口底 */
  --sm-surface:#ffffff;       /* 面板 / 卡片 */
  --sm-surface-2:#f7f7f8;     /* 行 hover / 次级底 */
  --sm-surface-3:#f1f1f2;     /* 控件底 / 代码底 */
  --sm-surface-4:#e8e8ea;     /* 控件 hover */
  --sm-line:#ececee;          /* 细分隔线 */
  --sm-line-2:#e2e2e4;        /* 面板 / 控件边框 */
  --sm-line-warm:#d8d6cf;     /* 暖灰边（暂存盘那一族） */
  --sm-ink:#1c1c1f;           /* 正文 */
  --sm-ink-2:#3a3a3e;         /* 次要正文 */
  --sm-ink-3:#6a6a6e;         /* 标签 / 小标题 */
  --sm-ink-4:#9a9a9e;         /* 弱提示 */
  --sm-accent:#B5402A;        /* 强调（文字 / 描边） */
  --sm-accent-solid:#B5402A;  /* 强调实心底（永远配白字，深色下也不换琥珀） */
  --sm-accent-deep:#9c3623;   /* 强调 hover */
  --sm-accent-tint:#fbeae6;   /* 强调淡底 */
  --sm-accent-line:#e7b5aa;   /* 强调淡边 */
  --sm-ok:#1D9E75; --sm-ok-ink:#0f6e56; --sm-ok-tint:#e1f5ee; --sm-ok-line:#b9e3cc;
  --sm-info:#185FA5; --sm-info-2:#378ADD; --sm-info-ink:#0c447c; --sm-info-tint:#e6f1fb; --sm-info-line:#b5d4f4;
  --sm-warn:#D85A30; --sm-warn-ink:#993C1D; --sm-warn-tint:#FAEEDA; --sm-warn-line:#fac775;
  --sm-r-xs:5px; --sm-r-sm:7px; --sm-r-md:9px; --sm-r-lg:12px; --sm-r-pill:999px;
  --sm-warm-1:#faf8f4;        /* 暂存盘 / 图片库那一族暖底 */
  --sm-warm-2:#f1efe9;        /* 暖控件底（缩略图衬底） */
  --sm-warm-line:#e0ded7;
  --sm-warm-ink:#5f5e5a;
  --sm-mark:#ffe9a8;          /* 讲稿划选高亮 */
  --sm-mark-line:#e0c063;
  --sm-mark-ink:#8a6a2a;
  --sm-tip-bg:#2a2a2d;        /* 悬浮提示气泡 */
  --sm-tip-ink:#f1f1f3;
  --sm-shadow-1:0 4px 14px rgba(0,0,0,.10);
  --sm-shadow-2:0 20px 60px rgba(0,0,0,.35);
}
body.dark{
  --sm-bg:#151517;
  --sm-surface:#1b1b1d;
  --sm-surface-2:#242427;
  --sm-surface-3:#2c2c2f;
  --sm-surface-4:#3a3a3d;
  --sm-line:#2c2c2f;
  --sm-line-2:#3a3a3d;
  --sm-line-warm:#3a3a3d;
  --sm-ink:#f0f0f2;
  --sm-ink-2:#e6e6e8;
  --sm-ink-3:#cfd2d8;
  --sm-ink-4:#9a9a9e;
  --sm-accent:#f0b34a;        /* 朱红在深底上发闷，前景强调换琥珀——沿用原来的做法 */
  --sm-accent-deep:#e7714f;
  --sm-accent-tint:#3a2417;
  --sm-accent-line:#7a4a2c;
  --sm-ok:#3fd39b; --sm-ok-ink:#7fe0a0; --sm-ok-tint:#13321f; --sm-ok-line:#2c6b48;
  --sm-info:#5aa2e8; --sm-info-2:#5aa2e8; --sm-info-ink:#9ecbf5; --sm-info-tint:#152738; --sm-info-line:#2b4d70;
  --sm-warn:#e08b4a; --sm-warn-ink:#f0b34a; --sm-warn-tint:#3a2f15; --sm-warn-line:#7a5e22;
  --sm-warm-1:#1e2027; --sm-warm-2:#16181d; --sm-warm-line:#33363d; --sm-warm-ink:#a8a49c;
  --sm-mark:#4a3a12; --sm-mark-line:#8a6a2a; --sm-mark-ink:#f0d49a;
  --sm-tip-bg:#0f0f12; --sm-tip-ink:#f1f1f3;
  --sm-shadow-2:0 20px 60px rgba(0,0,0,.55);
}

*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;color:var(--sm-ink);display:flex;flex-direction:column;background:var(--sm-bg)}
.ehead{height:50px;flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 16px;background:var(--sm-surface);color:var(--sm-ink);border-bottom:1px solid var(--sm-line-2);font-size:14px}
.ehead .brand{font-weight:700}
/* app 壳里这两样是重复的：品牌名菜单栏有，文件名标题栏那颗药丸有 */
body.inapp .ehead .brand,body.inapp .ehead .dn{display:none}.ehead .dn{opacity:.6;font-size:13px}.ehead .grow{flex:1}
.ehead button{background:var(--sm-bg);color:var(--sm-ink);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:7px 13px;font-size:13px;cursor:pointer}
.ehead button:hover{background:var(--sm-surface-4)}.ehead button.primary{background:var(--sm-accent-solid);border-color:var(--sm-accent);color:#fff}.ehead button.primary:hover{background:var(--sm-accent-deep)}
.ehead .iconbtn{padding:6px 10px;font-size:15px;line-height:1}
.ehead .sep{width:1px;height:22px;background:var(--sm-line-2);margin:0 2px;flex:0 0 auto}
.ehead .grp{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.ehead .iconbtn.on{background:var(--sm-accent-tint);border-color:var(--sm-accent-line);color:var(--sm-accent)}
.expwrap{position:relative}
.expmenu{position:absolute;right:0;top:calc(100% + 9px);z-index:80;width:300px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-md);box-shadow:var(--sm-shadow-1);padding:11px 13px 4px;display:none;text-align:left}
.expmenu.show{display:block}
.expmenu .expmenu-t{font-size:11px;font-weight:600;color:var(--sm-ink-4);letter-spacing:.04em;margin-bottom:6px}
.expmenu .embedck{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--sm-ink-2);padding:9px 0;line-height:1.5}
.expmenu .embedck + .embedck{border-top:1px solid var(--sm-line)}
.expmenu .embedck input{margin:3px 0 0;flex:0 0 auto}
.expmenu .ck-sub{display:block;font-size:11px;color:var(--sm-ink-4);margin-top:3px;line-height:1.55}
.ehead .bridge-badge{font-size:12px;padding:3px 10px;border-radius:var(--sm-r-lg);line-height:1.4}
.ehead .bridge-badge.on{background:var(--sm-ok-tint);color:var(--sm-ok-ink);border:1px solid var(--sm-ok-line)}
.ehead .connect-btn{background:var(--sm-info);border-color:var(--sm-info);color:#fff;font-weight:600}
.ehead .connect-btn:hover{background:var(--sm-info-ink)}
.cmodal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100}
.cbox{background:var(--sm-surface);border-radius:var(--sm-r-lg);padding:20px 22px;width:460px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.cbox .ctitle{font-size:16px;font-weight:700;margin-bottom:14px;color:var(--sm-ink)}
.cbox .cstatus{font-size:14px;padding:10px 13px;border-radius:var(--sm-r-md);background:var(--sm-surface-3);color:var(--sm-ink-3)}
.cbox .cstatus.ok{background:var(--sm-ok-tint);color:var(--sm-ok-ink);font-weight:600}
.cbox .chint{font-size:13px;color:var(--sm-ink-3);margin:14px 0 6px;font-weight:600}
.cbox .csteps{margin:0;padding-left:22px;font-size:13px;line-height:1.95;color:var(--sm-ink-2)}
.cbox code{background:var(--sm-surface-3);border-radius:var(--sm-r-xs);padding:1px 6px;font-size:12px;font-family:ui-monospace,Menlo,monospace}
.cfaint{font-size:11.5px;color:var(--sm-ink-4);line-height:1.65;margin:2px 0 9px}
#cueBody .oprow{flex-wrap:wrap}
#cueBody .oprow button{flex:1 1 auto;font-size:12px;padding:6px 8px;white-space:nowrap}
.cbox .cfaint{font-size:12px;color:var(--sm-ink-4);margin-top:14px;line-height:1.7;border-top:1px solid var(--sm-line);padding-top:11px}
.cbox .cclose{margin-top:16px;width:100%}
.emain{flex:1;display:flex;min-height:0}
.left{width:240px;flex:0 0 auto;background:var(--sm-surface);border-right:1px solid var(--sm-line-2);display:flex;flex-direction:column}
body.navcollapsed .left{display:none}
.lbar{display:flex;gap:6px;padding:10px;border-bottom:1px solid var(--sm-line)}
.lbar button{flex:1;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:7px 0;cursor:pointer;font-size:15px}
.lbar button:hover{background:var(--sm-surface-4)}
#slides{flex:1;overflow:auto;padding:8px}
.srow{display:flex;gap:9px;align-items:center;padding:9px 10px;border-radius:var(--sm-r-md);cursor:pointer;border:1px solid transparent}
.srow:hover{background:var(--sm-surface-2)}.srow.active{background:var(--sm-accent-tint);border-color:var(--sm-accent-line)}
.srow .snum{font-variant-numeric:tabular-nums;color:var(--sm-accent);font-weight:700;min-width:1.6em}
.srow .sseg{font-size:10px;color:var(--sm-ink-4);background:var(--sm-surface-3);border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:0 5px;line-height:16px}
.srow .stt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;flex:1}
.srow .sbadge{flex:0 0 auto;font-size:11px;line-height:1;width:17px;height:17px;display:flex;align-items:center;justify-content:center;border-radius:50%}
.srow .sbadge.todo{color:#fff;background:var(--sm-warn);font-size:9px}
.srow .sbadge.sent{color:#fff;background:var(--sm-info-2);font-size:9px;animation:sm-badge-pulse 1.25s ease-out infinite}
.srow .sbadge.done{color:#fff;background:var(--sm-ok);font-weight:700}
@keyframes sm-badge-pulse{0%{box-shadow:0 0 0 0 rgba(55,138,221,.6)}70%,100%{box-shadow:0 0 0 6px rgba(55,138,221,0)}}
@keyframes sm-blink{0%,100%{opacity:1}50%{opacity:.2}}
.aisent-banner{display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px 11px;border-radius:var(--sm-r-md);font-size:12px;line-height:1.4;color:var(--sm-info-ink);background:var(--sm-info-tint);border:1px solid var(--sm-info-line)}
.aisent-banner .aisent-dot{color:var(--sm-info-2);font-size:11px;animation:sm-blink 1.05s ease-in-out infinite}
.confirm-tog{display:flex;align-items:center;gap:7px;margin:2px 0 10px;font-size:12px;color:var(--sm-warm-ink);cursor:pointer;user-select:none}
.confirm-tog input{cursor:pointer}
.proposal-bar{display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px 11px;border-radius:var(--sm-r-md);font-size:12px;line-height:1.4;color:var(--sm-warn-ink);background:var(--sm-warn-tint);border:1px solid var(--sm-warn-line)}
.proposal-bar .proposal-dot{color:var(--sm-warn-ink);font-size:11px;animation:sm-blink 1.05s ease-in-out infinite}
.proposal-bar .grow{flex:1}
#htmlpanel{flex:1;display:flex;flex-direction:column;min-height:0}
.hb-title{font-weight:700;color:var(--sm-ink);font-size:13px;margin-bottom:4px}
.right input[type=color]{padding:2px;height:34px;cursor:pointer}
button.mini{background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:6px 10px;font-size:12px;cursor:pointer;font-family:inherit;margin-top:2px}
button.mini:hover{background:var(--sm-surface-4)}
button.primary-mini{background:var(--sm-accent-solid);color:#fff;border:1px solid var(--sm-accent);border-radius:var(--sm-r-sm);padding:6px 10px;font-size:13px;cursor:pointer;font-family:inherit}
button.primary-mini:hover{background:var(--sm-accent-deep)}
.right h4.sub{font-size:12px;color:var(--sm-ink-3);margin:16px 0 8px;font-weight:600;border-top:1px solid var(--sm-line);padding-top:12px}
.aitarget{font-size:12px;color:var(--sm-ink-3);background:var(--sm-accent-tint);border:1px solid var(--sm-accent-line);border-radius:var(--sm-r-sm);padding:6px 9px;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.applied-chip{margin-left:auto;font-size:11px;color:var(--sm-ok-ink);background:var(--sm-ok-tint);border-radius:var(--sm-r-lg);padding:1px 8px}
.aitarget .mini.revert{margin:0;padding:3px 8px;font-size:11px}
.aitarget .applied-chip + .mini.revert{margin-left:6px}
.aiqueue{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;max-height:190px;overflow:auto}
.aiqueue .qempty{font-size:12px;color:var(--sm-ink-4);padding:6px 2px}
.qrow{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:var(--sm-r-sm);cursor:pointer;border:1px solid var(--sm-line);background:var(--sm-surface)}
.qrow:hover{background:var(--sm-surface-2)}.qrow.active{background:var(--sm-accent-tint);border-color:var(--sm-accent-line)}
.qrow .qnum{font-variant-numeric:tabular-nums;color:var(--sm-accent);font-weight:700;min-width:1.5em;font-size:12px}
.qrow .qtt{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.qrow .qst{flex:0 0 auto;font-size:10px;border-radius:var(--sm-r-lg);padding:1px 8px}
.qrow .qst.todo{color:var(--sm-warn-ink);background:var(--sm-warn-tint)}
.qrow .qst.sent{color:var(--sm-info-ink);background:var(--sm-info-tint);animation:sm-blink 1.4s ease-in-out infinite}
.qrow .qst.done{color:var(--sm-ok-ink);background:var(--sm-ok-tint)}
.tray-drop{margin:6px 0 8px;border:2px dashed var(--sm-line-warm);border-radius:var(--sm-r-lg);background:var(--sm-warm-1);text-align:center;padding:16px 10px;transition:border-color .12s,background .12s}
.tray-drop.over{border-color:var(--sm-accent);background:var(--sm-accent-tint)}
.tray-drop-in{display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--sm-warm-ink);font-size:12px}
.tray-drop-in b{font-size:13px;color:var(--sm-ink-2)}
.tray-empty{font-size:12px;color:var(--sm-ink-4);padding:2px 2px 6px}
.tray-target{font-size:11px;color:var(--sm-ink-3);margin:2px 0 6px}
.tray-target b{color:var(--sm-accent);font-weight:600}
.tray-grid{display:flex;flex-direction:column;gap:12px;margin-bottom:8px}
.tray-group{display:flex;flex-direction:column;gap:6px}
.tray-group-head{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--sm-ink-3);padding:2px 2px 4px;border-bottom:1px solid var(--sm-line)}
.tray-group-head.clickable{cursor:pointer}
.tray-group-head.clickable:hover .tgh-label{color:var(--sm-accent)}
.tgh-label{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.tgh-count{flex:0 0 auto;font-size:10px;color:var(--sm-ink-4);font-variant-numeric:tabular-nums}
.tray-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.tray-cell{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-surface);padding:5px;display:flex;flex-direction:column;gap:4px;min-width:0}
.tray-cell.placed{border-color:var(--sm-ok-line);background:var(--sm-ok-tint)}
.tray-thumb{position:relative;border-radius:var(--sm-r-sm);overflow:hidden;background:var(--sm-warm-2);height:66px;display:flex;align-items:center;justify-content:center}
.tray-thumb img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.tray-move{position:absolute;left:3px;top:3px;width:20px;height:20px;line-height:18px;border-radius:var(--sm-r-lg);border:none;background:rgba(20,20,22,.55);color:#fff;font-size:12px;cursor:pointer;padding:0;opacity:0;transition:opacity .12s}
.tray-cell:hover .tray-move{opacity:1}
.tray-move:hover{background:var(--sm-ok-ink)}
.tray-badge{position:absolute;left:4px;top:4px;font-size:10px;color:var(--sm-ok-ink);background:var(--sm-ok-tint);border-radius:var(--sm-r-lg);padding:1px 7px}
.tray-del{position:absolute;right:3px;top:3px;width:20px;height:20px;line-height:18px;border-radius:var(--sm-r-lg);border:none;background:rgba(20,20,22,.55);color:#fff;font-size:11px;cursor:pointer;padding:0}
.tray-del:hover{background:var(--sm-accent-solid)}
.tray-name{font-size:11px;color:var(--sm-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tray-meta{font-size:10px;color:var(--sm-ink-4);font-variant-numeric:tabular-nums}
.tray-note{font-size:11px;border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:4px 6px;font-family:inherit;color:var(--sm-ink-2);width:100%;box-sizing:border-box}
.tray-note:focus{outline:none;border-color:var(--sm-accent-line)}
.tray-page{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--sm-ink-4)}
.tray-page-sel{flex:1;min-width:0;font-size:10px;border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:3px 4px;font-family:inherit;color:var(--sm-ink-2);background:var(--sm-surface)}
.tray-page-sel:focus{outline:none;border-color:var(--sm-accent-line)}
.oneclick{margin-top:18px;padding-top:14px;border-top:1px solid var(--sm-line)}
button.primary-mini.big{width:100%;padding:11px 10px;font-size:14px;font-weight:600}
.genlist{display:flex;flex-direction:column;gap:6px;margin:6px 0 8px}
.genrow{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-surface);padding:7px 8px;display:flex;flex-direction:column;gap:5px}
.genrow-h{display:flex;align-items:center;gap:7px}
.genrow-h .qtt{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--sm-ink-2)}
.gen-hint{font-size:11px;border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:4px 6px;font-family:inherit;color:var(--sm-ink-2);width:100%;box-sizing:border-box}
.gen-hint:focus{outline:none;border-color:var(--sm-accent-line)}
.genlist .qempty{font-size:12px;color:var(--sm-ink-4);padding:4px 2px}
body.dark .genrow{background:#1b1e25;border-color:#2c323d}
body.dark .genrow-h .qtt{color:#cfd2d8}
body.dark .gen-hint{background:#12151b;border-color:#2c323d;color:#cfd2d8}
.libmodal{position:fixed;inset:0;z-index:60;background:rgba(20,20,24,.55);display:none;align-items:center;justify-content:center}
.notesbox{width:min(1180px,95vw);height:86vh}
.noteswrap{flex:1;display:flex;min-height:0}
.notesframe{flex:1;border:0;background:var(--sm-surface);min-width:0}
.notesempty{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 40px;font-size:13px;line-height:1.9;color:var(--sm-ink-4)}
.noteside{width:320px;flex:0 0 auto;border-left:1px solid var(--sm-line);display:flex;flex-direction:column;min-height:0}
.notepick{padding:12px 14px;border-bottom:1px solid var(--sm-line);background:var(--sm-warm-1)}
.notepickwhere{font-size:11px;color:var(--sm-ink-4);margin-bottom:5px}
.notepickquote{font-size:12px;line-height:1.6;color:var(--sm-ink-2);background:var(--sm-mark);border-radius:var(--sm-r-xs);padding:6px 8px;margin-bottom:8px}
.notelist{flex:1;overflow:auto;padding:10px 14px}
.notelist .qempty{font-size:12px;color:var(--sm-ink-4);line-height:1.7;padding:8px 2px}
.annrow{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);padding:9px 10px;margin-bottom:9px}
.annhead{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.annhead code{font-size:10.5px;color:var(--sm-ink-4)}
.annhead .todo-del{margin-left:auto}
.annquote{font-size:11.5px;line-height:1.6;color:var(--sm-ink-3);border-left:3px solid var(--sm-mark-line);padding-left:7px;margin-bottom:5px;cursor:pointer}
.annquote:hover{color:var(--sm-accent)}
.annnote{font-size:12.5px;line-height:1.6;color:var(--sm-ink)}
.todochip.note{background:var(--sm-mark);color:var(--sm-mark-ink)}
.notes-status{font-size:11.5px;color:var(--sm-ink-4);padding:2px 2px 6px}
body.dark .noteside,body.dark .notepick{border-color:#2c323d}
body.dark .notepick{background:#1d2027}
body.dark .annrow{border-color:#2c323d}
body.dark .annnote{color:#e8e8ea}
.libbox{width:min(900px,92vw);max-height:86vh;display:flex;flex-direction:column;background:var(--sm-surface);border-radius:var(--sm-r-lg);box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.libhead{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--sm-line)}
.libhead .ctitle{font-size:15px;font-weight:600;color:var(--sm-ink-2)}
.lib-count{font-size:12px;color:var(--sm-ink-4);font-variant-numeric:tabular-nums}
.libhint{font-size:12px;color:var(--sm-ink-4);padding:8px 16px 0}
.libgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:14px 16px;overflow:auto}
.libgrid .qempty{grid-column:1/-1;font-size:13px;color:var(--sm-ink-4);padding:30px 0;text-align:center}
.lib-cell{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-surface-2);padding:8px;display:flex;flex-direction:column;gap:5px}
.lib-thumb{height:120px;border-radius:var(--sm-r-sm);overflow:hidden;background:var(--sm-warm-2);display:flex;align-items:center;justify-content:center}
.lib-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.lib-meta{font-size:11px;color:var(--sm-ink-2);line-height:1.35;max-height:2.7em;overflow:hidden}
.lib-sub{font-size:10px;color:var(--sm-ink-4)}
.lib-cell .oprow{margin-top:auto}
.searchq{flex:1;min-width:120px;height:32px;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);padding:0 11px;font-size:13px;font-family:inherit;background:var(--sm-surface);color:var(--sm-ink)}
.searchsrc{height:32px;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);font-size:12px;font-family:inherit;background:var(--sm-surface);color:var(--sm-ink-2)}
.searchcell{position:relative;cursor:pointer;transition:transform .1s,box-shadow .1s}
.searchcell:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.12)}
.searchcell.picked{outline:2px solid var(--sm-ok-ink);outline-offset:1px}
.searchcell .searchbadge{position:absolute;top:12px;right:12px;background:var(--sm-ok-ink);color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:var(--sm-r-lg);opacity:0;transition:opacity .12s}
.searchcell.picked .searchbadge{opacity:1}
.searchcell.picking{opacity:.6;pointer-events:none}
.searchlic{font-size:10px;color:var(--sm-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.dark .searchq,body.dark .searchsrc{background:#12151b;border-color:#333a45;color:#e6e6e8}
body.dark .libbox{background:#181a1f}
body.dark .libhead{border-color:#2c323d}
body.dark .libhead .ctitle{color:#e6e6e8}
body.dark .lib-cell{background:#1b1e25;border-color:#2c323d}
body.dark .lib-meta{color:#cfd2d8}
body.dark .lib-thumb{background:#12151b}
body.dark .tray-drop{background:#1c1f26;border-color:#333a46}
body.dark .tray-drop.over{border-color:#e7714f;background:#2a1f1b}
body.dark .tray-drop-in b{color:#e7e7ea}
body.dark .tray-cell{background:#1b1e25;border-color:#2c323d}
body.dark .tray-cell.placed{background:#16241f;border-color:#2f5a4a}
body.dark .tray-thumb{background:#12151b}
body.dark .tray-name{color:#cfd2d8}
body.dark .tray-note{background:#12151b;border-color:#2c323d;color:#cfd2d8}
body.dark .tray-page-sel{background:#12151b;border-color:#2c323d;color:#cfd2d8}
body.dark .oneclick{border-color:#2c323d}
.sechead{display:flex;align-items:center;gap:6px;margin:17px 0 7px;font-size:12px;font-weight:600;color:var(--sm-ink-3);letter-spacing:.02em}
.sechead.sectop{margin-top:4px}
.sechead .grow{flex:1}
.sechead .confirm-tog{margin:0;font-weight:400;flex:0 0 auto;white-space:nowrap}
.sechead .mini{font-weight:400}
.ihelp{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;padding:0;border-radius:50%;border:1px solid var(--sm-line-warm);background:transparent;color:var(--sm-ink-4);font-size:10px;font-weight:700;line-height:1;cursor:pointer;flex:0 0 auto}
.ihelp:hover{border-color:var(--sm-accent);color:var(--sm-accent);background:var(--sm-accent-tint)}
.sendnote{font-size:10px;color:var(--sm-warn-ink);background:var(--sm-warn-tint);border-radius:var(--sm-r-lg);padding:1px 8px;font-weight:600;letter-spacing:0}
.helppop{position:fixed;z-index:90;max-width:248px;background:var(--sm-tip-bg);color:var(--sm-tip-ink);font-size:12px;line-height:1.55;padding:9px 11px;border-radius:var(--sm-r-md);box-shadow:0 10px 30px rgba(0,0,0,.3);display:none;pointer-events:none}
.helppop.show{display:block}
body.dark .sechead{color:#8a8a8e}
body.dark .ihelp{border-color:#3a3a3d}
body.dark .ihelp:hover{background:#3a2417}
body.dark .helppop{background:#0f0f12;box-shadow:0 10px 30px rgba(0,0,0,.5)}
/* 网页内色板：色块按钮 + 弹层（HSV 方块 + 色相条 + hex + 预设） */
.swatch{display:flex;align-items:center;gap:7px;width:100%;padding:6px 8px;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);cursor:pointer;font-family:inherit;font-size:12px;color:var(--sm-ink-2);text-align:left}
.swatch:hover{border-color:var(--sm-accent-line);background:var(--sm-surface-4)}
.swatch.open{border-color:var(--sm-accent);box-shadow:0 0 0 2px var(--sm-accent-tint)}
.sw-chip{flex:0 0 auto;width:18px;height:18px;border-radius:var(--sm-r-xs);border:1px solid rgba(0,0,0,.18);background:#888;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.sw-hex{font-variant-numeric:tabular-nums;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.swpop{position:fixed;z-index:95;width:238px;padding:11px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);box-shadow:var(--sm-shadow-1),0 18px 46px rgba(0,0,0,.18);display:none}
.swpop.show{display:block}
.sw-area{position:relative;height:112px;border-radius:var(--sm-r-sm);cursor:crosshair;touch-action:none;background-color:#f00;
  background-image:linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,rgba(255,255,255,0))}
.sw-dot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45);pointer-events:none}
.sw-hue{-webkit-appearance:none;appearance:none;width:100%;height:11px;margin:11px 0 9px;border-radius:var(--sm-r-pill);cursor:pointer;border:0;
  background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}
.sw-hue::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.35);box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer}
.sw-row{display:flex;align-items:center;gap:7px}
.sw-prev{flex:0 0 auto;width:24px;height:24px;border-radius:var(--sm-r-xs);border:1px solid var(--sm-line-2)}
.sw-hexin{flex:1;min-width:0;padding:5px 7px;font-family:inherit;font-size:12px;font-variant-numeric:tabular-nums;text-transform:uppercase;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-xs);color:var(--sm-ink)}
.sw-sec{font-size:10px;letter-spacing:.12em;color:var(--sm-ink-4);margin:11px 0 5px;font-weight:700}
.sw-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}
.sw-cell{width:100%;aspect-ratio:1;padding:0;border:1px solid rgba(0,0,0,.14);border-radius:var(--sm-r-xs);cursor:pointer;transition:transform .1s}
.sw-cell:hover{transform:scale(1.15)}
.sw-cell.on{box-shadow:0 0 0 2px var(--sm-accent)}
body.dark .sw-cell,body.dark .sw-chip{border-color:rgba(255,255,255,.16)}
body.dark .swpop{box-shadow:0 18px 46px rgba(0,0,0,.6)}
.illbox{border:0.5px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-warm-1);padding:9px 10px;margin:6px 0 8px}
.illrow{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.illrow:last-child{margin-bottom:0}
.illlabel{font-size:12px;color:var(--sm-ink-3);white-space:nowrap}
.illbox #illHint{width:100%;box-sizing:border-box;resize:vertical;min-height:34px;font-family:inherit;font-size:12px;line-height:1.5;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);padding:6px 8px;background:var(--sm-surface);color:#2a2a2d;margin-bottom:7px}
.illbox #illHint:focus{outline:none;border-color:var(--sm-accent)}
.illrow-act{margin-bottom:0}
.illnote{font-size:11px;color:var(--sm-ok-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.dark .illbox #illHint{background:#202022;color:#e8e8ea;border-color:#3a3a3d}
.seg{display:flex;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);overflow:hidden}
.seg .segbtn{border:0;background:transparent;font-family:inherit;font-size:12px;padding:6px 10px;cursor:pointer;color:var(--sm-ink-3)}
.seg .segbtn.on{background:var(--sm-accent-solid);color:#fff}
#illHintTip{margin-top:2px}
.aitodo{display:flex;flex-direction:column;gap:5px;margin-bottom:8px;max-height:240px;overflow:auto}
.aitodo .qempty{font-size:12px;color:var(--sm-ink-4);padding:8px 2px;line-height:1.5}
.todorow{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:var(--sm-r-sm);border:1px solid var(--sm-line);background:var(--sm-surface)}
.todochip{flex:0 0 auto;font-size:10px;border-radius:var(--sm-r-lg);padding:2px 8px;font-weight:600}
.todochip.deck{color:var(--sm-info-ink);background:var(--sm-info-tint)}
.todochip.edit{color:var(--sm-warm-ink);background:var(--sm-surface-3)}
.todochip.vec{color:var(--sm-ok-ink);background:var(--sm-ok-tint)}
.todochip.chart{color:#2c6e7f;background:#e3f0f3}
.todochip.photo{color:var(--sm-warn-ink);background:var(--sm-warn-tint)}
.todochip.tray{color:var(--sm-warn-ink);background:var(--sm-accent-tint)}
.todopg{flex:0 0 auto;font-size:10px;color:var(--sm-accent);font-weight:700;font-variant-numeric:tabular-nums}
.tododesc{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--sm-ink-2)}
.todo-del{flex:0 0 auto;width:22px;height:22px;line-height:1;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--sm-warm-line);border-radius:var(--sm-r-sm);background:var(--sm-surface-2);color:var(--sm-ink-3);font-size:12px;cursor:pointer;padding:0;transition:background .12s,color .12s,border-color .12s}
.todo-del:hover{background:var(--sm-accent-solid);border-color:var(--sm-accent);color:#fff}
body.dark .todo-del{background:#242832;border-color:#333a45;color:#9a9a9e}
body.dark .todo-del:hover{background:#B5402A;border-color:#B5402A;color:#fff}
body.dark .illbox{background:#1c1f26;border-color:#2c323d}
body.dark .illlabel{color:#9a9a9e}
body.dark .seg{border-color:#333a46}
body.dark .seg .segbtn{color:#9a9a9e}
body.dark .seg .segbtn.on{background:#B5402A;color:#fff}
body.dark .todorow{background:#1b1e25;border-color:#2c323d}
body.dark .tododesc{color:#cfd2d8}
.auditout{margin-top:8px;display:flex;flex-direction:column;gap:5px}
.audit-sum{font-size:12px;color:var(--sm-ink-2);font-weight:600}
.audit-row{font-size:12px;line-height:1.4;padding:6px 8px;border-radius:var(--sm-r-sm);cursor:pointer;border:1px solid transparent}
.audit-row b{color:var(--sm-ink)}
.audit-row.error{background:#fdecea;border-color:var(--sm-accent-line);color:var(--sm-accent-deep)}
.audit-row.warn{background:var(--sm-warn-tint);border-color:var(--sm-warn-line);color:var(--sm-mark-ink)}
.audit-row:hover{filter:brightness(.97)}
.center{flex:1;min-width:0;background:#202022;display:flex;align-items:center;justify-content:center;padding:14px;position:relative}
#preview{width:100%;height:100%;border:0;background:#000;border-radius:var(--sm-r-sm);box-shadow:0 10px 40px rgba(0,0,0,.4)}
.drop{position:absolute;inset:14px;border:2px dashed rgba(255,255,255,.25);border-radius:var(--sm-r-md);display:none;align-items:center;justify-content:center;color:var(--sm-ink-4);font-size:15px;pointer-events:none}
body.dragging .drop{display:flex;background:rgba(181,64,42,.12);border-color:var(--sm-accent);color:#fff}
.right{width:300px;flex:0 0 auto;background:var(--sm-surface);border-left:1px solid var(--sm-line-2);display:flex;flex-direction:column}
/* 折叠 —— **不是整块藏起来**：右栏缩成一条 34px 的窄条，上面还留着各 tab 的名字，
   点哪个就展开到哪个。整块 display:none 的话，想找回来只能去猜哪个按钮能唤回它。 */
.railtog{flex:0 0 22px;background:transparent;border:0;color:var(--sm-ink-4);font-size:15px;cursor:pointer;font-family:inherit;padding:0}
.railtog:hover{color:var(--sm-accent)}
.railstrip{display:none;flex-direction:column;align-items:center;gap:6px;padding:10px 0;height:100%;overflow:hidden}
.railstrip #railStripTabs{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:0;overflow:auto}
.railstrip .railtog{flex:0 0 auto;font-size:16px;padding:2px 0}
.railstrip button.striptab{display:flex;align-items:center;justify-content:center;width:26px;height:26px;flex:0 0 auto;
  background:transparent;border:0;padding:0;color:var(--sm-ink-3);cursor:pointer;border-radius:var(--sm-r-sm);font-family:inherit}
.railstrip button.striptab svg{width:17px;height:17px;display:block}
.railstrip button.striptab .stlabel{font-size:12.5px;font-weight:600}
.railstrip button.striptab:hover{background:var(--sm-surface-2);color:var(--sm-ink)}
.railstrip button.striptab.active{color:var(--sm-accent);background:var(--sm-accent-tint)}
body.panelcollapsed .right{width:34px}
body.panelcollapsed .right>div{display:none!important}
body.panelcollapsed .right>.railstrip{display:flex!important}
body.dark .railstrip button.striptab{color:#9a9a9e}
body.dark .railstrip button.striptab:hover{background:#242427;color:#f0f0f2}
body.dark .railstrip button.striptab.active{color:#f0b34a;background:#3a2417}
.tabs{display:flex;border-bottom:1px solid var(--sm-line-2);flex:0 0 auto}
.tab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 0;font-size:13px;color:var(--sm-ink-3);cursor:pointer;font-family:inherit}
.tab:hover{background:var(--sm-surface-2)}.tab.active{color:var(--sm-accent);border-bottom-color:var(--sm-accent);font-weight:600}
.pane{flex:1;overflow:auto;padding:16px}
.embedck{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--sm-ink-3);cursor:pointer;user-select:none}
.embedck input{margin:0;cursor:pointer}
/* HTML-mode Keynote-style top tabs */
.htabs,.ltabs{display:flex;border-bottom:1px solid var(--sm-line-2);flex:0 0 auto}
.htab,.ltab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 0;font-size:13px;color:var(--sm-ink-3);cursor:pointer;font-family:inherit}
.htab:hover,.ltab:hover{background:var(--sm-surface-2)}.htab.active,.ltab.active{color:var(--sm-accent);border-bottom-color:var(--sm-accent);font-weight:600}
.lpane{flex:1;min-height:0;display:flex;flex-direction:column}.lpane[hidden]{display:none}
.lscroll{flex:1;overflow:auto;padding:10px}
.lpane-soon{color:var(--sm-ink-4);font-size:13px;line-height:1.7;padding:18px 14px;text-align:center}
.skingal{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.skincard{display:flex;flex-direction:column;gap:6px;padding:7px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);cursor:pointer;text-align:left;font-family:inherit}
.skincard:hover{border-color:var(--sm-accent-line);background:var(--sm-accent-tint)}.skincard.on{border-color:var(--sm-accent);box-shadow:0 0 0 1px #B5402A inset}
.skinprev{position:relative;height:52px;border-radius:var(--sm-r-sm);overflow:hidden;display:block;border:1px solid rgba(0,0,0,.06)}
.skinline{position:absolute;left:10px;height:5px;border-radius:var(--sm-r-xs);top:13px;width:62%}
.skinline.short{top:25px;width:40%;opacity:.55}
.skinbar{position:absolute;left:10px;bottom:9px;height:6px;width:34%;border-radius:var(--sm-r-xs)}
.skinmeta{display:flex;align-items:center;justify-content:space-between;gap:6px}
.skinname{font-size:12px;color:var(--sm-ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.skintag{font-size:10px;color:var(--sm-ink-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);padding:0 6px;flex:0 0 auto}
.insgrid{display:flex;flex-direction:column;gap:9px}
.inscard{display:flex;flex-direction:column;gap:3px;padding:12px 13px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);cursor:pointer;text-align:left;font-family:inherit}
.inscard:hover{border-color:var(--sm-accent-line);background:var(--sm-accent-tint)}
.inscard b{font-size:14px;color:var(--sm-ink);font-weight:600}.inscard span{font-size:12px;color:var(--sm-ink-3);line-height:1.5}
.hpane{flex:1;overflow:auto;padding:16px}
#htmlpanel input[type=range]{width:100%;margin:6px 0 2px;accent-color:var(--sm-accent);cursor:pointer}
body.dark #htmlpanel input[type=range]{accent-color:#f0b34a}
.tweakout{font-weight:700;color:var(--sm-accent);font-variant-numeric:tabular-nums;margin-left:4px}
body.dark .tweakout{color:#f0b34a}
.dghint{font-size:11px;color:var(--sm-ink-3);line-height:1.55;margin-top:10px}
.gallery-btn{width:100%;margin:6px 0 10px;padding:11px;border:0;border-radius:var(--sm-r-lg);background:var(--sm-accent-solid);color:#fff;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}
.gallery-btn:hover{background:var(--sm-accent-deep)}.gallery-btn:active{transform:scale(.99)}
body.dark .gallery-btn{background:#f0b34a;color:#1c1c1f}
.animchips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.achip{display:inline-flex;align-items:center;gap:5px;background:var(--sm-warm-2);border:1px solid var(--sm-warm-line);border-radius:var(--sm-r-lg);padding:3px 6px 3px 10px;font-size:12px;color:var(--sm-ink-2)}
.achip button{border:0;background:var(--sm-warm-line);color:var(--sm-warm-ink);border-radius:50%;width:15px;height:15px;line-height:1;font-size:10px;cursor:pointer;padding:0}
.achip button:hover{background:var(--sm-accent-solid);color:#fff}
.achint{font-size:12px;color:var(--sm-warm-ink)}
body.dark .achip{background:#26262a;border-color:#34343a;color:#cfcfd4}body.dark .achip button{background:#3a3a40;color:#bbb}
/* animation sub-tabs (进入 / 动作 / 消失) */
.subtabs{display:flex;gap:5px;margin:6px 0 12px}
.stab{flex:1;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:6px 0;font-size:12px;color:var(--sm-ink-3);cursor:pointer;font-family:inherit}
.stab:hover{background:var(--sm-surface-4)}.stab.active{background:var(--sm-accent-tint);border-color:var(--sm-accent-line);color:var(--sm-accent);font-weight:600}
.spane{margin-bottom:4px}
/* B/I/U + alignment toggle bar */
.btnbar{display:flex;gap:5px;align-items:center}
.tgl{min-width:34px;height:34px;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);font-size:14px;color:var(--sm-ink-2);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;padding:0 8px}
.tgl:hover{background:var(--sm-surface-4)}
.tgl.on{background:var(--sm-accent-solid);border-color:var(--sm-accent);color:#fff}
.bbsep{width:1px;height:22px;background:var(--sm-line-2);margin:0 3px}
.right h3{display:flex;align-items:center;gap:6px;font-size:11px;letter-spacing:.14em;color:var(--sm-ink-4);margin:18px 0 8px;font-weight:700}.pane h3:first-child{margin-top:0}
.right select,.right textarea,.right input{width:100%;padding:8px 10px;border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);font-size:14px;background:var(--sm-surface);font-family:inherit}
.right textarea{resize:vertical;line-height:1.5}
.field{margin-bottom:10px}.field label{display:block;font-size:12px;color:var(--sm-ink-3);margin-bottom:4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tag{display:inline-block;background:var(--sm-accent-tint);border:1px solid var(--sm-accent-line);border-radius:var(--sm-r-xs);padding:2px 8px;font-size:12px;color:var(--sm-accent);font-weight:600}
.nosel{font-size:12px;color:var(--sm-ink-4);line-height:1.6;padding:10px 0}
.addrow{display:flex;flex-wrap:wrap;gap:6px}
.addrow button,.oprow button{background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:6px 10px;font-size:13px;cursor:pointer;font-family:inherit}
.addrow button:hover,.oprow button:hover{background:var(--sm-surface-4)}
.oprow{display:flex;gap:6px;margin-top:6px}.oprow button{flex:1}
.oprow button.danger{color:var(--sm-accent)}.oprow button:disabled{opacity:.4;cursor:not-allowed}
.nbrow{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.nbrow button{background:transparent;border:1px solid var(--sm-line-2);border-radius:var(--sm-r-xs);padding:5px 8px;cursor:pointer;color:var(--sm-ink-4)}
.nbtag{flex:0 0 auto;font-size:11px;padding:3px 7px;border-radius:var(--sm-r-xs);color:#fff;font-weight:700}
.nb-cue{background:#6E6A5E}.nb-golden{background:#A07A3A}.nb-data{background:#1B2B4F}
.hint{font-size:12px;color:var(--sm-ink-4);line-height:1.7;margin-top:18px;border-top:1px solid var(--sm-line);padding-top:12px}.hint b{color:var(--sm-ink-3)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--sm-surface);color:#9bd29b;padding:10px 18px;border-radius:var(--sm-r-sm);font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:50}
.toast.show{opacity:1}.toast.bad{color:#ff8a7a}
.ehead .dirtydot{font-size:12px;color:var(--sm-mark-ink);padding:2px 9px;border-radius:var(--sm-r-lg);background:var(--sm-warn-tint);border:1px solid var(--sm-warn-line);line-height:1.4}
body.dark .ehead .dirtydot{color:#f0b34a;background:#3a2f15;border-color:#7a5e22}
.ehead button:disabled{opacity:.35;cursor:not-allowed}
/* 草稿恢复条挪到右下角。原来横在顶部正中，正好盖住 deck 自己的标题栏、页码和「全屏播放」。 */
.restorebar{position:fixed;right:20px;bottom:20px;z-index:60;width:296px;display:flex;flex-direction:column;gap:11px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-left:4px solid var(--sm-accent);border-radius:var(--sm-r-md);padding:13px 15px;box-shadow:var(--sm-shadow-1);font-size:13px;line-height:1.6;color:var(--sm-ink-2)}
.restorebar b{color:var(--sm-accent)}
.restorebar .rb-acts{display:flex;gap:8px}
.restorebar button{flex:1;border:1px solid var(--sm-line-2);background:var(--sm-surface-3);border-radius:var(--sm-r-sm);padding:7px 12px;font-size:13px;cursor:pointer;font-family:inherit;color:var(--sm-ink-2)}
.restorebar button:hover{background:var(--sm-surface-4)}
.restorebar button.go{background:var(--sm-accent-solid);border-color:var(--sm-accent-solid);color:#fff}
.restorebar button.go:hover{background:var(--sm-accent-deep)}
.busy{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:70;display:none;align-items:center;gap:9px;background:var(--sm-surface);color:var(--sm-ink-2);border-radius:var(--sm-r-md);padding:9px 16px;font-size:13px;box-shadow:0 10px 34px rgba(0,0,0,.3)}
.busy.show{display:flex}
.busy .spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.25);border-top-color:#f0b34a;border-radius:50%;animation:sm-spin .7s linear infinite}
@keyframes sm-spin{to{transform:rotate(360deg)}}
/* ===== dark Studio chrome (toggle 🌙, persisted) ===== */
body.dark{background:#151517;color:#e6e6e8}
body.dark .ehead{background:#1b1b1d;color:#eee;border-bottom-color:#2c2c2f}
body.dark .ehead button{background:#2c2c2f;color:#eee;border-color:#3a3a3d}
body.dark .ehead button:hover{background:#3a3a3d}
body.dark .ehead .sep{background:#3a3a3d}
body.dark .ehead .bridge-badge.on{background:#13321f;color:#7fe0a0;border-color:#2c6b48}
body.dark .left,body.dark .right{background:#1b1b1d;border-color:#2c2c2f}
body.dark .lbar{border-color:#2c2c2f}
body.dark .lbar button{background:#2c2c2f;border-color:#3a3a3d;color:#ddd}
body.dark .lbar button:hover{background:#3a3a3d}
body.dark .srow:hover{background:#242427}
body.dark .srow.active{background:#3a2417;border-color:#7a4a2c}
body.dark .srow .stt{color:#dcdce0}
body.dark .srow .sseg{background:#2c2c2f;border-color:#3a3a3d;color:#aaa}
body.dark .htabs,body.dark .tabs,body.dark .ltabs{border-color:#2c2c2f}
body.dark .htab,body.dark .tab,body.dark .ltab{color:#9a9a9e}
body.dark .htab:hover,body.dark .tab:hover,body.dark .ltab:hover{background:#242427}
body.dark .htab.active,body.dark .tab.active,body.dark .ltab.active{color:#f0b34a;border-bottom-color:#f0b34a}
body.dark .skincard,body.dark .inscard{background:#1b1e25;border-color:#2c323d}
body.dark .skincard:hover,body.dark .inscard:hover{background:#242a36;border-color:#4a3a33}
body.dark .skincard.on{border-color:#f0b34a;box-shadow:0 0 0 1px #f0b34a inset}
body.dark .skinname,body.dark .inscard b{color:#e6e6e8}
body.dark .skintag{color:#9a9a9e;border-color:#3a3a3d}body.dark .inscard span{color:#9a9a9e}
body.dark .right h3{color:#7a7a7e}
body.dark .right select,body.dark .right textarea,body.dark .right input{background:#242427;border-color:#3a3a3d;color:#e6e6e8}
body.dark .right h4.sub{color:#9a9a9e;border-color:#2c2c2f}
body.dark .field label{color:#9a9a9e}
body.dark .addrow button,body.dark .oprow button,body.dark button.mini,body.dark .stab,body.dark .tgl{background:#2c2c2f;border-color:#3a3a3d;color:#ddd}
body.dark .addrow button:hover,body.dark .oprow button:hover,body.dark button.mini:hover,body.dark .stab:hover{background:#3a3a3d}
/* the primary 发送/导出 button keeps its brand brick-red + white text inside .oprow/.addrow,
   in both light and dark — otherwise the generic .oprow button bg (light gray / dark #2c2c2f)
   overrides primary-mini's red while keeping its white text → white-on-light = unreadable. */
.oprow button.primary-mini,.addrow button.primary-mini,body.dark .oprow button.primary-mini,body.dark .addrow button.primary-mini{background:var(--sm-accent-solid);color:#fff;border-color:var(--sm-accent)}
.oprow button.primary-mini:hover,.addrow button.primary-mini:hover,body.dark .oprow button.primary-mini:hover,body.dark .addrow button.primary-mini:hover{background:var(--sm-accent-deep)}
body.dark .stab.active{background:#3a2417;border-color:#7a4a2c;color:#f0b34a}
body.dark .tgl.on{background:#B5402A;border-color:#B5402A;color:#fff}
body.dark .nosel,body.dark .hint{color:#8a8a8e}
body.dark .hint b{color:#bdbdc2}
body.dark .tag{background:#3a2417;border-color:#7a4a2c;color:#f0b34a}
body.dark .aitarget{background:#26201a;border-color:#5a4326;color:#cfcfd2}
body.dark .qrow{background:#242427;border-color:#33333a}
body.dark .qrow:hover{background:#2c2c2f}
body.dark .qrow.active{background:#3a2417;border-color:#7a4a2c}
body.dark .restorebar{background:#242427;color:#e6e6e8;border-color:#7a4a2c}
body.dark .cbox{background:#1b1b1d;color:#e6e6e8}
body.dark .cbox .ctitle{color:#e6e6e8}
body.dark .cbox code{background:#2c2c2f}
`;

function buildUI(): void {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  document.body.innerHTML = `
<div class="ehead">
  <span class="grp">
    <button id="navtog" class="iconbtn" title="折叠 / 展开左侧页面列表">☰</button>
    <button id="deckNavTog" class="iconbtn" aria-pressed="false" title="在预览里显示 deck 自带的段导航（缩略图）。默认关——左侧页面列表做的是同一件事，关掉能把 300px 还给幻灯片">▦</button>
    <button id="themeTog" class="iconbtn" title="切换深色 / 浅色界面">◐</button>
  </span>
  <span class="sep"></span>
  <span class="grp">
    <button id="undoBtn" class="iconbtn" title="撤销（⌘/Ctrl+Z）" disabled>↶</button>
    <button id="redoBtn" class="iconbtn" title="重做（⌘/Ctrl+⇧+Z）" disabled>↷</button>
  </span>
  <span class="sep"></span>
  <span class="brand">Slidesmith Studio</span>
  <span class="dn" id="deckname">${esc(fileBase)}</span>
  <span class="dirtydot" id="dirtyDot" title="有未保存的修改，已自动保存草稿，按 ⌘/Ctrl+S 写回文件" style="display:none">● 未保存</span>
  <span id="bridgeBadge" class="bridge-badge" title="与 Claude Code 的连接状态"></span>
  <button id="connectBtn" class="connect-btn" title="连接本地 Claude Code">连接 Claude Code</button>
  <span class="grow"></span>
  <button id="imp">导入 HTML</button>
  <span class="sep"></span>
  <span class="grp expwrap">
    <button id="expOpts" class="iconbtn" aria-expanded="false" title="导出选项">⚙</button>
    <div class="expmenu" id="expMenu">
      <div class="expmenu-t">导出 / 保存选项</div>
      <label class="embedck"><input id="embedFonts" type="checkbox"> <span>嵌入字体<span class="ck-sub">把用到的字体子集写进 HTML，换台电脑或离线也不走样，文件略大</span></span></label>
      <label class="embedck"><input id="embedRemote" type="checkbox"> <span>嵌入手机遥控<span class="ck-sub">导出的 HTML 里多一个「📱 手机遥控」按钮，扫码即可用手机翻页</span></span></label>
      <label class="embedck" id="newRoomWrap" style="display:none"><input id="newRoom" type="checkbox"> <span>换新房间号<span class="ck-sub">默认沿用这份 deck 原有的房间号，手机不用重新扫码；勾上才铸新号，旧二维码作废</span></span></label>
    </div>
    <button id="expPdf">导出 PDF</button>
    <button id="expHtml" title="另存为：下载一份新的 HTML 副本，不覆盖原文件">另存为</button>
    <button id="saveHtml" class="primary" title="保存：覆盖导入的源 HTML；首次保存会让你选一次文件，之后一键覆盖">保存</button>
  </span>
  <input id="file" type="file" accept=".html,.htm" style="display:none">
</div>
<div class="emain">
  <aside class="left">
    <div class="ltabs">
      <button class="ltab active" data-ltab="pages" title="页面缩略图导航">页面</button>
      <button class="ltab" data-ltab="skins" title="换一套皮肤风格，整份 deck 立刻变样">换装</button>
      <button class="ltab" data-ltab="insert" title="插入新页 / 图片 / 图表 / 引用等">插入</button>
    </div>
    <div class="lpane" data-lpane="pages">
      <div class="lbar"><button id="add" title="新增页">＋</button><button id="del" title="删除当前页">－</button><button id="up" title="上移">↑</button><button id="down" title="下移">↓</button></div>
      <div id="slides"></div>
    </div>
    <div class="lpane" data-lpane="skins" hidden>
      <div id="skinGallery" class="lscroll"><div class="lpane-soon">换装画廊加载中…</div></div>
    </div>
    <div class="lpane" data-lpane="insert" hidden>
      <div id="insertPane" class="lscroll"><div class="lpane-soon">插入面板加载中…</div></div>
    </div>
  </aside>
  <main class="center">
    <iframe id="preview"></iframe>
    <div class="drop">松开即可导入 HTML</div>
  </main>
  <aside class="right">
    <div class="railstrip">
      <button class="railtog" type="button" title="展开面板">‹</button>
      <div id="railStripTabs"></div>
    </div>
    <div id="htmlpanel" style="display:none">
      <!-- tab 顺序＝使用频率：AI 修改 / 讲稿最常用，排前面；deck 级设计旋钮不常动，垫底。 -->
      <div class="htabs">
        <button class="htab active" data-htab="ai" data-icon="ai" title="AI 修改 —— 模糊的重活交给 Claude">AI</button>
        <button class="htab" data-htab="script" data-icon="script" title="讲稿 / 提词 —— 副屏讲稿与手表提词">讲稿</button>
        <button class="htab" data-htab="fmt" data-icon="fmt" title="格式 —— 选中元素的字体 / 颜色 / 位置">格式</button>
        <button class="htab" data-htab="anim" data-icon="anim" title="动画 —— 选中元素的进入 / 强调 / 动作 / 消失">动画</button>
        <button class="htab" data-htab="design" data-icon="design" title="设计 —— 整份 deck 的皮肤 / 配色 / 字体 / 字号">设计</button>
        <button class="railtog" type="button" title="折叠面板，把地方让给预览">›</button>
      </div>

      <!-- ===== AI 修改 ===== -->
      <div class="pane hpane" data-hpane="ai">
        <div class="sechead sectop">交给 AI<button class="ihelp" type="button" data-help="人做细活（点字、换色、动画）；复杂的交给 AI——写修改意见、为页面配图，凑成一个待办，一键发送。">?</button><span class="grow"></span><label class="confirm-tog" title="开启后 AI 的改动先以「提议」呈现，点保留才算数；关闭则改完直接生效"><input id="aiConfirmTog" type="checkbox"> 先问我</label></div>
        <div class="proposal-bar" id="aiProposalBar" style="display:none"><span class="proposal-dot">●</span><span id="aiProposalTxt">AI 提议了改动，请确认</span><span class="grow"></span><button id="aiKeep" class="mini">保留</button><button id="aiRevertAll" class="mini revert">还原</button></div>

        <div class="sechead">整份 deck<button class="ihelp" type="button" data-help="对整份 deck 的统一要求，AI 自动挑相关页改。例：统一标题字号；精简过长的页。">?</button></div>
        <div class="field"><textarea id="aiDeckInstruction" rows="2" placeholder="对整份 deck 的统一要求（可留空）"></textarea></div>

        <div class="sechead">本页<button class="ihelp" type="button" data-help="给当前页写修改意见，或为它配图。切换页会自动保存。">?</button></div>
        <div class="aitarget" id="aiTarget"><span id="aiTargetTxt">本页：—</span><span class="applied-chip" id="aiAppliedChip" style="display:none">AI 已修改</span><button id="aiRevertOne" class="mini revert" style="display:none">还原本页</button></div>
        <div class="field"><textarea id="aiInstruction" rows="3" placeholder="这一页想怎么改？例：三个要点改成左右两栏。"></textarea></div>
        <div class="oprow"><button id="aiClearOne" title="清空本页的修改意见">清空</button></div>
        <div class="illbox">
          <div class="illrow"><span class="illlabel">配图<button class="ihelp" type="button" data-help="矢量＝Claude 直接画 SVG（免费、可编辑）；图表＝按数据/描述画 SVG 图表（柱/折线/饼/雷达/散点…）；照片＝本机 codex 生成（按张计额度）。成品都进图片库。">?</button></span>
            <div class="seg" id="illSeg"><button type="button" class="segbtn on" data-illtype="vector">矢量</button><button type="button" class="segbtn" data-illtype="chart">图表</button><button type="button" class="segbtn" data-illtype="photo">照片</button></div>
          </div>
          <textarea id="illHint" rows="2" placeholder="想要什么画面（可留空）"></textarea>
          <div class="illrow illrow-act"><button id="illDataPick" class="mini" title="导入 CSV / 数字 / 文本数据文件，内容会填进上面的框" style="display:none">导入数据文件</button><span id="illDataNote" class="illnote"></span><span class="grow"></span><button id="illAdd" class="primary-mini" title="把本页 + 所选配图类型加入待办">＋ 加入</button></div>
        </div>
        <div class="aisent-banner" id="aiSentBanner" style="display:none"></div>

        <div class="sechead">导入图片<button class="ihelp" type="button" data-help="流程：先在左侧点你要配图的那一页 → 再导入 / 搜图，图片就自动归到那一页 → 多页都配好后一键发给 AI 排版。放错了？点缩略图角上的「⤴」即可移到当前选中页。">?</button><span class="grow"></span><button id="imgSearchOpen" class="mini" title="从免费图库搜图，点一下即加入暂存盘（无需手动下载导入）">搜图</button></div>
        <div class="tray-target" id="trayTarget">导入 / 搜图将加到：<b id="trayTargetTxt">（先在左侧选一页）</b></div>
        <div id="trayDrop" class="tray-drop"><div class="tray-drop-in"><b>拖拽图片到此处</b><span>或</span><button id="trayPick" class="mini">导入图片</button></div></div>
        <div id="trayEmpty" class="tray-empty">暂存盘为空</div>
        <div id="trayGrid" class="tray-grid"></div>

        <div class="sechead">待办<button class="ihelp" type="button" data-help="上面的「改字 / 配图 / 导入图」和「讲稿」里的批注都汇总在这里。点「一键发送给 AI」一次全部交给 Claude。">?</button><span class="grow"></span><span class="sendnote" id="aiSendNote" style="display:none">含照片·计费</span></div>
        <div id="aiTodo" class="aitodo"></div>
        <div class="oprow"><button id="aiSendAll" class="primary-mini big" disabled>一键发送给 AI</button></div>

        <div class="sechead">图片库<button class="ihelp" type="button" data-help="AI 生成过的矢量 / 图表 / 照片都存在这里（~/.slidesmith/library/），可重新插入到对应页或删除。">?</button><span class="grow"></span><button id="genOpenLib" class="mini">打开</button></div>

        <div class="sechead">视觉自检<button class="ihelp" type="button" data-help="检查每页的内容溢出、文字对比度、坏图，点结果可跳到对应页。">?</button><span class="grow"></span><button id="auditRun" class="mini">检查</button></div>
        <div id="auditOut" class="auditout"></div>
      </div>

      <!-- ===== 讲稿 / 提词（原先讲稿只是 AI tab 里的一个按钮，提词是独立 tab；
             两者是同一件事的两半——讲给人听的和抬腕看的——合并提到一级） ===== -->
      <div class="pane hpane" data-hpane="script" hidden>
        <div class="sechead sectop">内嵌讲稿<button class="ihelp" type="button" data-help="讲稿不给直接编辑——它带着锚点和讲法/金句/数据块，手改必然弄漂，副屏同步和手表提词会一起坏。改法是：打开讲稿、划一段、加一条批注，交给 Claude 在守住结构的前提下改写。批注会进「AI」tab 的待办。">?</button><span class="grow"></span><button id="notesOpen" class="mini">打开讲稿</button></div>
        <div class="notes-status" id="notesStatus">—</div>

        <div class="sechead">本页提词<button class="ihelp" type="button" data-help="Apple Watch 上会显示的提词。抬腕零点几秒要能读完，所以每条不超过 10 个汉字，而且要是内容锚点（「无缝嵌入」）而不是结构标签（「第一部分」）。表盘放得下 5 行——skill 出品以 5 条为上限，这里可以再手动加，但手表上会变成要翻页。">?</button></div>
        <div id="cueBody"></div>
      </div>

      <!-- ===== 格式（选中元素） ===== -->
      <div class="pane hpane" data-hpane="fmt" hidden>
        <div class="nosel hseloff" id="hNoSel">在预览中<b>点选文字</b>即可直接编辑。<button class="ihelp" type="button" data-help="选中后可调整字体、字号、颜色、粗细与位置。打字时空格 / 方向键归输入，按 Esc 退出文本框即可继续用键盘翻页。">?</button></div>
        <div id="hSel" class="hselon" style="display:none">
          <div class="tag" id="hSelTag">—</div>
          <div class="field"><label>字体</label><select id="hFont"></select></div>
          <div class="grid2">
            <div class="field"><label>字号(px)</label><input id="hFs" type="number" min="8" placeholder="默认"></div>
            <div class="field"><label>颜色</label><input id="hColor" type="hidden"><button class="swatch" type="button" data-for="hColor"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
          </div>
          <div class="field"><label>样式</label>
            <div class="btnbar">
              <button id="hBold" class="tgl" title="加粗"><b>B</b></button>
              <button id="hItalic" class="tgl" title="斜体"><i>I</i></button>
              <button id="hUnder" class="tgl" title="下划线"><span style="text-decoration:underline">U</span></button>
              <span class="bbsep"></span>
              <button id="hAlignL" class="tgl" title="左对齐">左</button>
              <button id="hAlignC" class="tgl" title="居中">中</button>
              <button id="hAlignR" class="tgl" title="右对齐">右</button>
            </div>
          </div>
          <div class="field"><label>粗细</label><select id="hWeight"><option value="">默认</option><option>300</option><option>400</option><option>500</option><option>600</option><option>700</option><option>900</option></select></div>
          <div class="grid2">
            <div class="field"><label>宽度(px)</label><input id="hElW" type="number" min="20" placeholder="自动"></div>
            <div class="field"><label>位置 / 大小<button class="ihelp" type="button" data-help="拖动选框上方的 ✥ 可移动，拖动右下角的 ◢ 可调整大小；「复位」清除拖动产生的位移与尺寸。">?</button></label><button id="hBoxReset" class="mini" title="清除拖动产生的位移与尺寸">复位</button></div>
          </div>
          <div class="oprow"><button id="hElUp" title="次序上移">↑ 次序</button><button id="hElDown" title="次序下移">↓ 次序</button><button id="hElDel" class="danger" title="删除该元素">删除</button></div>
        </div>

        <div class="sechead">插入<button class="ihelp" type="button" data-help="图片以内联方式写入 HTML，导出后离线可用。也可在预览中直接粘贴图片；若已选中元素，将插入其后。">?</button></div>
        <div class="oprow"><button id="hInsertImg">插入图片</button></div>
      </div>

      <!-- ===== 动画效果 ===== -->
      <div class="pane hpane" data-hpane="anim" hidden>
        <div class="nosel hseloff">在预览中<b>点选一个元素</b>，再为其添加动画。</div>
        <div class="hselon" style="display:none">
          <div class="tag" id="hSelTag2">—</div>
          <button id="hOpenGallery" class="gallery-btn" type="button">打开动画库</button>
          <div id="hAnimChips" class="animchips"></div>
          <div class="hint" id="hMorphHint" style="display:none"></div>
          <h3 class="sub">快速设置</h3>
          <div class="subtabs">
            <button class="stab active" data-stab="in">进入</button>
            <button class="stab" data-stab="emph">强调</button>
            <button class="stab" data-stab="motion">动作</button>
            <button class="stab" data-stab="out">消失</button>
          </div>
          <div class="spane" data-spane="in">
            <div class="field"><label title="翻到本页时播放一次">进入动画</label><select id="hAnim"></select></div>
            <div class="oprow"><button id="hAnimPlay" title="在本页重放进入 / 动作">▶ 预览</button></div>
          </div>
          <div class="spane" data-spane="emph" hidden>
            <div class="field"><label title="翻到本页时，对已显示的元素做一次手势强调">强调动画</label><select id="hEmph"></select></div>
            <div class="oprow"><button id="hAnimPlayE" title="在本页重放强调">▶ 预览</button></div>
          </div>
          <div class="spane" data-spane="motion" hidden>
            <div class="field"><label title="一直循环播放，如呼吸灯、流光">持续动作</label><select id="hMotion"></select></div>
            <div class="oprow"><button id="hAnimPlay2" title="在本页重放进入 / 动作">▶ 预览</button></div>
          </div>
          <div class="spane" data-spane="out" hidden>
            <div class="field"><label title="离开本页时播放一次">消失动画<button class="ihelp" type="button" data-help="放映翻页时自动播放消失动画；编辑时可用「▶ 预览」看效果。">?</button></label><select id="hAnimOut"></select></div>
            <div class="oprow"><button id="hAnimPlayOut" title="在本页预览消失动画">▶ 预览</button></div>
          </div>
          <h3>触发方式<button class="ihelp" type="button" data-help="触发方式作用于本 deck 的进入与动作动画；放映时按 B 可关闭全部动画。">?</button></h3>
          <div class="field"><select id="hFxMode"><option value="auto">自动 · 进入页面即播放</option><option value="manual">手动 · 点击页面才播放</option></select></div>
        </div>
      </div>

      <!-- ===== 设计（deck 级 · 即时生效 · 零 token）
             皮肤和配色原先在「格式」里又有一份（#hAccent/#hPaper/#hInk 和这里的
             #dAccent/#dPaper/#dInk 写的是同一批令牌），现已合并到这里，只留一份。 ===== -->
      <div class="pane hpane" data-hpane="design" hidden>
        <div class="sechead sectop">整份 deck 的设计旋钮<button class="ihelp" type="button" data-help="对整份 deck 生效的「全局旋钮」：皮肤 / 配色 / 字体 / 字号 / 留白。拖一下立刻变、零 token、不经过 AI——人手高频细活就在这里调。所有改动都写入 HTML，导出后离线一致。">?</button></div>
        <div class="field"><label>皮肤</label><select id="hSkin"></select></div>
        <div class="field" id="hThemeWrap" style="display:none"><label>主题</label><select id="hTheme"></select></div>
        <h3>配色</h3>
        <div class="grid2">
          <div class="field"><label>主色</label><input id="dAccent" type="hidden"><button class="swatch" type="button" data-for="dAccent"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
          <div class="field"><label>强调色 2</label><input id="dAccent2" type="hidden"><button class="swatch" type="button" data-for="dAccent2"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
        </div>
        <div class="grid2">
          <div class="field"><label>背景色</label><input id="dPaper" type="hidden"><button class="swatch" type="button" data-for="dPaper"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
          <div class="field"><label>文字色</label><input id="dInk" type="hidden"><button class="swatch" type="button" data-for="dInk"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
        </div>
        <h3>字体</h3>
        <div class="field"><label>标题字体</label><select id="dFontDisplay"></select></div>
        <div class="field"><label>正文字体</label><select id="dFontSans"></select></div>
        <h3>字号 / 留白<button class="ihelp" type="button" data-help="字号 / 留白按设计令牌整体缩放，对正文、引言、说明等一致生效；少数皮肤的封面巨标题用固定字号，不随此旋钮变化。">?</button></h3>
        <div class="field"><label>字号 <span class="tweakout" id="dTypeOut">100%</span></label><input id="dType" type="range" min="70" max="130" step="1" value="100"></div>
        <div class="field"><label>留白 <span class="tweakout" id="dPadOut">100%</span></label><input id="dPad" type="range" min="70" max="130" step="1" value="100"></div>
        <div class="oprow"><button id="dReset" class="mini">复原设计旋钮</button></div>
      </div>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="format" data-icon="fmt" title="格式">格式</button>
      <button class="tab" data-tab="anim" data-icon="anim" title="动画效果">动画效果</button>
      <button class="tab" data-tab="doc" data-icon="script" title="文稿">文稿</button>
      <button class="railtog" type="button" title="折叠面板，把地方让给预览">›</button>
    </div>
    <div class="pane" data-pane="format">
      <h3>主题（配色）</h3><div class="field"><select id="theme"></select></div>
      <h3>本页布局</h3><div class="field"><select id="layout"></select></div>
      <h3>添加元素</h3><div class="addrow" id="addrow"></div>
      <div class="nosel">在中间预览中<b>点选一个元素</b>，即可调整其字体与位置。</div>
      <h3 class="needsel" style="display:none">选中元素 · <span class="tag" id="blktype">—</span></h3>
      <div class="needsel" style="display:none">
        <div class="field"><label>字号</label><select id="fsize"></select></div>
        <div class="field"><label>颜色</label><select id="fcolor"></select></div>
        <div class="grid2"><div class="field"><label>粗细</label><select id="fweight"></select></div><div class="field"><label>对齐</label><select id="falign"></select></div></div>
        <h3>元素操作</h3>
        <div class="oprow"><button id="elUp">↑ 上移</button><button id="elDown">↓ 下移</button><button id="elDel" class="danger">删除</button></div>
      </div>
    </div>
    <div class="pane" data-pane="anim" hidden>
      <div class="nosel">在预览中<b>点选一个元素</b>，再为其添加动画。</div>
      <div class="needsel" style="display:none">
        <h3 title="翻到本页时播放一次">入场动画</h3><div class="field"><select id="anim"></select></div>
        <h3 title="一直循环播放，如呼吸灯">持续动效</h3><div class="field"><select id="motion"></select></div>
        <div class="hint">动效在预览与投屏中持续播放；放映时按 <b>B</b> 可关闭全部动画。</div>
      </div>
    </div>
    <div class="pane" data-pane="doc" hidden>
      <h3>本页讲稿</h3>
      <div class="field"><textarea id="notes" rows="6" placeholder="这一页要讲的内容，可用 **关键词** 标注提词。"></textarea></div>
      <h3>讲稿块</h3>
      <div id="noteblocks"></div>
      <div class="oprow"><button id="addCue">＋ 讲法</button><button id="addGolden">＋ 金句</button><button id="addData">＋ 数据</button></div>
      <div class="hint">讲稿仅用于逐字稿与演讲者视图，不显示在幻灯片上。</div>
    </div>
  </aside>
</div>
<div class="toast" id="toast"></div>
<div class="busy" id="busy"><span class="spin"></span><span id="busyTxt">处理中…</span></div>
<div class="restorebar" id="restoreBar" style="display:none">
  <span id="restoreTxt">发现未保存的草稿</span>
  <div class="rb-acts">
    <button class="go" id="restoreGo">恢复</button>
    <button id="restoreDrop">丢弃</button>
  </div>
</div>
<div class="cmodal" id="connectModal" style="display:none">
  <div class="cbox">
    <div class="ctitle">连接 Claude Code</div>
    <div id="cstate"></div>
    <button class="mini cclose" id="cclose">关闭</button>
  </div>
</div>
<div class="libmodal" id="notesModal" style="display:none">
  <div class="libbox notesbox">
    <div class="libhead"><span class="ctitle">讲稿 · 批注</span><span id="noteCount" class="lib-count"></span><span class="grow"></span><button id="notesUndoBtn" class="mini" style="display:none">撤销 Claude 的改写</button><button id="notesClose" class="mini cclose">关闭</button></div>
    <div class="noteswrap">
      <iframe id="notesFrame" class="notesframe"></iframe>
      <div id="notesEmpty" class="notesempty" style="display:none">
        这份 deck 里没有内嵌讲稿。<br><br>
        一体版（<code>slides-presenter-mode</code> 缝出来的单文件）会把整份讲稿 base64 嵌在
        <code>window.__TXB64__</code> 里，Studio 才读得到；三文件联动版的讲稿在隔壁文件，这里看不见。
      </div>
      <div class="noteside">
        <div class="notepick" id="notePickBox" style="display:none">
          <div class="notepickwhere" id="notePickWhere"></div>
          <div class="notepickquote" id="notePickQuote"></div>
          <textarea id="noteText" rows="3" placeholder="这段要怎么改？例：太长了，砍一半；这里要更口语。"></textarea>
          <div class="oprow"><button id="noteAdd" class="primary-mini">加批注</button><button id="noteCancel" class="mini">取消</button></div>
        </div>
        <div id="noteList" class="notelist"></div>
      </div>
    </div>
  </div>
</div>
<div class="libmodal" id="libModal" style="display:none">
  <div class="libbox">
    <div class="libhead"><span class="ctitle">图片库</span><span id="libCount" class="lib-count"></span><span class="grow"></span><button id="libReload" class="mini">刷新</button><button id="libClose" class="mini cclose">关闭</button></div>
    <div class="libhint">本 deck 用 codex 生成过的图片（存于 ~/.slidesmith/library/）。可重新插入到对应页，或删除以便管理。</div>
    <div id="libGrid" class="libgrid"></div>
  </div>
</div>
<div class="libmodal" id="searchModal" style="display:none">
  <div class="libbox">
    <div class="libhead">
      <span class="ctitle">搜图</span>
      <input id="imgSearchQ" class="searchq" type="text" placeholder="描述画面，例：森林 晨雾 / teamwork office">
      <!-- Google 源已隐藏：其「搜索整个网络」被 Google 弃用、Custom Search API 将于 2027-01 停用。
           bridge 仍支持 source=google（需 googleApiKey+googleSearchCx），要用把该 option 加回即可。 -->
      <select id="imgSearchSrc" class="searchsrc" title="图源"><option value="">默认</option><option value="baidu">百度 · 中文最多</option><option value="wikimedia">维基共享 · 中文文化</option><option value="pexels">Pexels · 精美英文</option><option value="openverse">Openverse · 免密 CC</option></select>
      <button id="imgSearchGo" class="primary-mini">搜索</button>
      <button id="imgSearchClose" class="mini cclose">关闭</button>
    </div>
    <div class="libhint" id="imgSearchHint">点缩略图即下载并加入「暂存盘」，随后在待办里交给 AI 排版；图片内联进 HTML，导出后离线可用。默认走 Pexels（需一次性免费 key），未配置则自动用 Openverse（免密·CC，需署名）。</div>
    <div id="imgSearchGrid" class="libgrid"></div>
  </div>
</div>
<div class="helppop" id="helpPop"></div>
<div class="swpop" id="swPop">
  <div class="sw-area" id="swArea"><i class="sw-dot" id="swDot"></i></div>
  <input class="sw-hue" id="swHue" type="range" min="0" max="360" step="1" value="0" aria-label="色相">
  <div class="sw-row"><i class="sw-prev" id="swPrev"></i><input class="sw-hexin" id="swHex" maxlength="7" spellcheck="false" aria-label="十六进制颜色"></div>
  <div id="swDeckWrap"><div class="sw-sec">本 DECK 在用</div><div class="sw-grid"></div></div>
  <div class="sw-sec">常用</div>
  <div class="sw-grid" id="swGrid"></div>
</div>`;

  function fillSel(id: string, values: readonly string[], labels?: Record<string, string>, defaultLabel?: string): HTMLSelectElement {
    const sel = $(id) as HTMLSelectElement; sel.innerHTML = '';
    if (defaultLabel != null) { const o = document.createElement('option'); o.value = ''; o.textContent = defaultLabel; sel.appendChild(o); }
    values.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = (labels && labels[v]) || v; sel.appendChild(o); });
    return sel;
  }
  const onChange = (id: string, fn: (v: string) => void) =>
    ($(id) as HTMLSelectElement).addEventListener('change', (e) => fn((e.target as HTMLSelectElement).value));

  // --- 格式: theme + layout + font + element ops ---
  const th = fillSel('#theme', meta.themes);
  th.value = deck.theme || 'editorial';
  th.addEventListener('change', () => { deck.theme = th.value; reloadPreview(); });
  // editorial-slides 换皮（html 模式）：选一套皮，叠加注入其 bundle 重新着皮
  const skinLabels: Record<string, string> = {};
  SKIN_ORDER.forEach((n) => { skinLabels[n] = (SKINS[n].label || n) + ' · ' + n + (SKINS[n].dark ? ' · 暗' : ' · 浅'); });
  fillSel('#hSkin', SKIN_ORDER, skinLabels, '保持原样（不换皮）');
  onChange('#hSkin', (v) => { const tf = tweakFactor('--t-body'), pf = tweakFactor('--pad-x'); harvestAll(); pushHistory('skin'); H.skin = v; applySkinLive(); reapplyTweaksForSkin(tf, pf); refreshHtmlInspector(); markDirty(); });
  ($('#layout') as HTMLSelectElement).addEventListener('change', () => { deck.slides[cur].layout = ($('#layout') as HTMLSelectElement).value; reloadPreview(); });

  fillSel('#fsize', meta.sizes, undefined, '默认'); onChange('#fsize', (v) => setStyle('size', v));
  fillSel('#fcolor', meta.colors, undefined, '默认'); onChange('#fcolor', (v) => setStyle('color', v));
  fillSel('#fweight', meta.weights, undefined, '默认'); onChange('#fweight', (v) => setStyle('weight', v));
  fillSel('#falign', meta.aligns, undefined, '默认'); onChange('#falign', (v) => setStyle('align', v));

  const addrow = $('#addrow');
  NEW_BLOCKS.forEach((nb) => { const b = document.createElement('button'); b.textContent = '+' + nb.label; b.addEventListener('click', () => addElement(nb.make)); addrow.appendChild(b); });
  $('#elUp').addEventListener('click', () => moveElement(-1));
  $('#elDown').addEventListener('click', () => moveElement(1));
  $('#elDel').addEventListener('click', delElement);

  // --- 动画效果: entrance + motion ---
  fillSel('#anim', meta.anims, ANIM_LABEL); onChange('#anim', (v) => setAnim(v));
  fillSel('#motion', meta.motions, MOTION_LABEL); onChange('#motion', (v) => setMotion(v));

  // --- v2 HTML 模式 inspector: tokens / theme / selected element ---
  const onInput = (id: string, fn: (v: string) => void) =>
    ($(id) as HTMLInputElement).addEventListener('input', (e) => fn((e.target as HTMLInputElement).value));
  // —— 设计旋钮 tab：deck 级配色 / 字体 / 字号 / 留白（即时生效、零 token、写入 H.overrides 一并导出）
  onInput('#dAccent', (v) => setHtmlToken('--accent', v));
  onInput('#dAccent2', (v) => setHtmlToken('--accent-2', v));
  onInput('#dPaper', (v) => setHtmlToken('--paper', v));
  onInput('#dInk', (v) => setHtmlToken('--ink', v));
  populateFontSelect('#dFontDisplay'); onChange('#dFontDisplay', (v) => setHtmlTokenFont('--font-display', v));
  populateFontSelect('#dFontSans'); onChange('#dFontSans', (v) => setHtmlTokenFont('--font-sans', v));
  onInput('#dType', (v) => { const f = (parseInt(v, 10) || 100) / 100; const o = $('#dTypeOut'); if (o) o.textContent = Math.round(f * 100) + '%'; applyTweakScale('type', f); });
  onInput('#dPad', (v) => { const f = (parseInt(v, 10) || 100) / 100; const o = $('#dPadOut'); if (o) o.textContent = Math.round(f * 100) + '%'; applyTweakScale('pad', f); });
  $('#dReset').addEventListener('click', resetDesignKnobs);
  onChange('#hTheme', (v) => { harvestAll(); H.theme = v; renderHtmlEdit(); refreshHtmlInspector(); });
  populateFontSelect('#hFont'); onChange('#hFont', (v) => setHtmlFont(v));
  onInput('#hFs', (v) => applyHtmlStyle('font-size', v ? v + 'px' : ''));
  onInput('#hColor', (v) => applyHtmlStyle('color', v));
  onChange('#hWeight', (v) => { applyHtmlStyle('font-weight', v); if (htmlSelEl) showHtmlSel(true, htmlSelEl as HTMLElement); });
  // Keynote-style toggles: bold / italic / underline + alignment
  $('#hBold').addEventListener('click', () => toggleHtmlStyle('font-weight', '700', () => { const w = parseInt((htmlSelEl as HTMLElement | null)?.style.fontWeight || '', 10); return w >= 600; }));
  $('#hItalic').addEventListener('click', () => toggleHtmlStyle('font-style', 'italic', () => (htmlSelEl as HTMLElement | null)?.style.fontStyle === 'italic'));
  $('#hUnder').addEventListener('click', () => toggleHtmlStyle('text-decoration', 'underline', () => /underline/.test((htmlSelEl as HTMLElement | null)?.style.textDecoration || '')));
  const setAlign = (a: string) => { if (!htmlSelEl) return; const cur = (htmlSelEl as HTMLElement).style.textAlign; applyHtmlStyle('text-align', cur === a ? '' : a); showHtmlSel(true, htmlSelEl as HTMLElement); };
  $('#hAlignL').addEventListener('click', () => setAlign('left'));
  $('#hAlignC').addEventListener('click', () => setAlign('center'));
  $('#hAlignR').addEventListener('click', () => setAlign('right'));
  fillSel('#hAnim', meta.anims, ANIM_LABEL); onChange('#hAnim', (v) => { setHtmlAnim(v); previewPlayFx(); });
  fillSel('#hEmph', meta.emphs, EMPH_LABEL); onChange('#hEmph', (v) => { setHtmlEmph(v); previewPlayFx(); });
  fillSel('#hMotion', meta.motions, MOTION_LABEL); onChange('#hMotion', (v) => { setHtmlMotion(v); previewPlayFx(); });
  fillSel('#hAnimOut', meta.animOuts, ANIM_OUT_LABEL); onChange('#hAnimOut', (v) => { setHtmlAnimOut(v); previewPlayFxOut(); });
  ($('#hFxMode') as HTMLSelectElement).value = fxMode;
  onChange('#hFxMode', (v) => {
    fxMode = v === 'manual' ? 'manual' : 'auto';
    const d = previewFrame()?.contentDocument; if (d) d.documentElement.setAttribute('data-smfx', fxMode);
    previewFxCall('__SM_FX_REARM__');
  });
  $('#hAnimPlay').addEventListener('click', previewPlayFx);
  $('#hAnimPlayE').addEventListener('click', previewPlayFx);
  $('#hAnimPlay2').addEventListener('click', previewPlayFx);
  $('#hAnimPlayOut').addEventListener('click', previewPlayFxOut);
  // 动画库子窗口：开 + 接收回传的效果
  $('#hOpenGallery').addEventListener('click', openAnimGallery);
  window.addEventListener('message', (e) => {
    const d = e.data as { type?: string };
    if (d && d.type === 'smfx-pick') applyPicked(d as { code?: string; name?: string; spec?: Record<string, unknown> });
  });
  $('#hElUp').addEventListener('click', () => moveHtmlEl(-1));
  $('#hElDown').addEventListener('click', () => moveHtmlEl(1));
  $('#hElDel').addEventListener('click', delHtmlEl);
  $('#hInsertImg').addEventListener('click', insertImageFromFile);
  onInput('#hElW', (v) => { commitResize(v ? parseInt(v, 10) : 0); });
  $('#hBoxReset').addEventListener('click', resetSelectedBox);
  // undo / redo (buttons + keyboard); autosave lifecycle
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#restoreBar'); // (handlers attached in maybeOfferDraftRestore)
  document.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (meta) {
      if (k === 's') { e.preventDefault(); void saveHtmlInPlace(); }
      else if (k === 'z' && !e.shiftKey) { if (mode === 'html') { e.preventDefault(); undo(); } }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { if (mode === 'html') { e.preventDefault(); redo(); } }
      return;
    }
    // bare-key shortcuts only in HTML mode, and never while typing in a Studio field
    if (mode !== 'html') return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
    if (e.key === 'Escape') { if (htmlSelEl) { deselectHtml(); e.preventDefault(); } }
    else if (e.key === 'Delete') { if (htmlSelEl) { delHtmlEl(); e.preventDefault(); } }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const step = e.shiftKey ? 1 : 10;
      if (htmlSelEl) { // nudge the selected element (Keynote-style)
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commitMove(dx, dy); e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { // no selection → page through slides
        selectHtmlSlide(cur + (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault();
      }
    }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) autosaveDraft(); });
  // HTML-mode top tabs (格式 / 动画效果 / AI 修改) + animation sub-tabs (进入 / 动作 / 消失)
  document.querySelectorAll('.htab').forEach((tb) => tb.addEventListener('click', () => {
    const name = (tb as HTMLElement).dataset.htab;
    document.querySelectorAll('.htab').forEach((x) => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.hpane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.hpane !== name));
    if (name === 'script') { renderCuePane(); refreshNotesStatus(); }
    if (name === 'design') refreshDeckTokenInputs();
    else if (name === 'ai') refreshNotesStatus();
  }));
  // 讲稿批注
  $('#notesOpen').addEventListener('click', openNotes);
  $('#notesClose').addEventListener('click', closeNotes);
  $('#noteAdd').addEventListener('click', addNoteAnn);
  $('#noteCancel').addEventListener('click', () => {
    notePick = null;
    const b = $('#notePickBox'); if (b) (b as HTMLElement).style.display = 'none';
  });
  $('#notesUndoBtn').addEventListener('click', undoNotesPatch);
  // 讲稿 iframe 里点了「加批注」
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; anchor?: string; quote?: string } | null;
    if (!d || d.type !== 'sm-note-pick' || typeof d.quote !== 'string') return;
    onNotePick(d.anchor || '', d.quote);
  });
  // 左栏多功能 tab：页面（缩略图导航）/ 换装（皮肤画廊，就地换肤）/ 插入（添加中枢）
  document.querySelectorAll('.ltab').forEach((tb) => tb.addEventListener('click', () => {
    const name = (tb as HTMLElement).dataset.ltab;
    document.querySelectorAll('.ltab').forEach((x) => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.lpane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.lpane !== name));
    if (name === 'skins') renderSkinGallery();
    else if (name === 'insert') renderInsertPane();
  }));
  document.querySelectorAll('.stab').forEach((tb) => tb.addEventListener('click', () => {
    const name = (tb as HTMLElement).dataset.stab;
    document.querySelectorAll('.stab').forEach((x) => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.spane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.spane !== name));
    if (name === 'out') previewPlayFxOut(); else previewPlayFx();
  }));

  // --- Submit-to-AI: per-page memory + batch send (apply comes back over the bridge) ---
  ($('#aiInstruction') as HTMLTextAreaElement).addEventListener('input', onAiInput);
  ($('#aiDeckInstruction') as HTMLTextAreaElement).addEventListener('input', (e) => { aiDeckInstruction = (e.target as HTMLTextAreaElement).value; renderTodo(); });
  // unified send: one button does text edits + 配图(矢量/照片) + 导入图 for the whole deck
  $('#aiSendAll').addEventListener('click', submitAll);
  // 本页 配图: pick type (segmented) + add to the 配图清单
  document.querySelectorAll('#illSeg .segbtn').forEach((b) => b.addEventListener('click', () => {
    illType = ((b as HTMLElement).dataset.illtype as 'vector' | 'chart' | 'photo') || 'vector';
    document.querySelectorAll('#illSeg .segbtn').forEach((x) => x.classList.toggle('on', x === b));
    const hint = $('#illHint') as HTMLTextAreaElement | null;
    if (hint) hint.placeholder = illType === 'chart' ? '粘贴数据或描述，例：方法A 78、方法B 88…分组柱状图；或点「导入数据文件」' : '想要什么画面（可留空）';
    const dp = $('#illDataPick'); if (dp) (dp as HTMLElement).style.display = illType === 'chart' ? '' : 'none';
  }));
  $('#illAdd').addEventListener('click', addIllustToQueue);
  $('#illDataPick').addEventListener('click', illDataPicker);
  // image tray: import + the dedicated drop-zone highlight (drop handled at window level)
  $('#trayPick').addEventListener('click', trayFilesPicker);
  $('#genOpenLib').addEventListener('click', openLibrary);
  $('#libClose').addEventListener('click', closeLibrary);
  $('#libReload').addEventListener('click', loadLibrary);
  $('#libModal').addEventListener('click', (e) => { if (e.target === $('#libModal')) closeLibrary(); });
  $('#imgSearchOpen').addEventListener('click', openImageSearch);
  $('#imgSearchClose').addEventListener('click', closeImageSearch);
  $('#imgSearchGo').addEventListener('click', () => { void runImageSearch(); });
  $('#imgSearchSrc').addEventListener('change', () => { if (($('#imgSearchQ') as HTMLInputElement).value.trim()) void runImageSearch(); });
  $('#imgSearchQ').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); void runImageSearch(); } });
  $('#searchModal').addEventListener('click', (e) => { if (e.target === $('#searchModal')) closeImageSearch(); });
  wireHelp();
  wireSwatches();
  renderTodo();
  { const z = $('#trayDrop'); if (z) {
    z.addEventListener('dragenter', (e) => { e.preventDefault(); setTrayOver(true); });
    z.addEventListener('dragover', (e) => { e.preventDefault(); setTrayOver(true); });
    z.addEventListener('dragleave', () => setTrayOver(false));
  } }
  $('#aiClearOne').addEventListener('click', () => {
    const box = $('#aiInstruction') as HTMLTextAreaElement; box.value = ''; onAiInput();
  });
  $('#aiRevertOne').addEventListener('click', () => { if (aiCurId) revertSlide(aiCurId); });
  const confirmTog = $('#aiConfirmTog') as HTMLInputElement | null;
  if (confirmTog) { confirmTog.checked = aiConfirm; confirmTog.addEventListener('change', () => { aiConfirm = confirmTog.checked; try { localStorage.setItem(CONFIRM_KEY, aiConfirm ? '1' : '0'); } catch { /* noop */ } }); }
  $('#aiKeep').addEventListener('click', keepProposed);
  $('#aiRevertAll').addEventListener('click', revertProposed);
  $('#auditRun').addEventListener('click', () => renderAuditReport(auditImportedDeck()));
  $('#expPdf').addEventListener('click', exportPdf);
  const remoteTog = $('#embedRemote') as HTMLInputElement | null;
  const newRoomTog = $('#newRoom') as HTMLInputElement | null;
  const newRoomWrap = $('#newRoomWrap') as HTMLElement | null;
  const syncRoomTog = () => { if (newRoomWrap) newRoomWrap.style.display = embedPhoneRemote ? '' : 'none'; };
  if (remoteTog) { remoteTog.checked = embedPhoneRemote; remoteTog.addEventListener('change', () => { embedPhoneRemote = remoteTog.checked; syncRoomTog(); if (embedPhoneRemote) toast('导出的 HTML 将带「📱 手机遥控」按钮'); }); }
  if (newRoomTog) { newRoomTog.checked = newRoomOnExport; newRoomTog.addEventListener('change', () => { newRoomOnExport = newRoomTog.checked; if (newRoomOnExport) toast('导出时会铸新房间号 —— 手机要重扫码'); }); }
  syncRoomTog();

  // --- 文稿: notes + note blocks ---
  ($('#notes') as HTMLTextAreaElement).addEventListener('input', (e) => {
    const v = (e.target as HTMLTextAreaElement).value;
    deck.slides[cur].notes = v ? v : undefined;
  });
  $('#addCue').addEventListener('click', () => addNoteBlock('cue'));
  $('#addGolden').addEventListener('click', () => addNoteBlock('golden'));
  $('#addData').addEventListener('click', () => addNoteBlock('data'));

  // --- tabs ---
  document.querySelectorAll('.tab').forEach((tb) =>
    tb.addEventListener('click', () => {
      const name = (tb as HTMLElement).dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === tb));
      document.querySelectorAll('.pane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.pane !== name));
    }),
  );

  // --- slide ops ---
  $('#add').addEventListener('click', addSlide);
  $('#del').addEventListener('click', delSlide);
  $('#up').addEventListener('click', () => moveSlide(-1));
  $('#down').addEventListener('click', () => moveSlide(1));

  $('#navtog').addEventListener('click', () => document.body.classList.toggle('navcollapsed'));
  $('#deckNavTog').addEventListener('click', () => {
    deckChromeOn = !deckChromeOn;
    try { localStorage.setItem('sm-deckchrome', deckChromeOn ? 'on' : 'off'); } catch { /* 无痕模式，忘掉就忘掉 */ }
    applyDeckChrome();
    toast(deckChromeOn ? '预览里显示 deck 自带的段导航' : '已收起段导航，宽度还给幻灯片');
  });
  applyDeckChrome();   // 开机把按钮状态和当前选择对上
  const expMenu = $('#expMenu'), expOpts = $('#expOpts');
  const closeExp = () => { expMenu?.classList.remove('show'); expOpts?.setAttribute('aria-expanded', 'false'); };
  expOpts?.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !expMenu?.classList.contains('show');
    expMenu?.classList.toggle('show', on);
    expOpts.setAttribute('aria-expanded', String(on));
  });
  expMenu?.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeExp);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeExp(); });
  document.querySelectorAll('.railtog').forEach((b) => b.addEventListener('click', () => setRightCollapsed(!document.body.classList.contains('panelcollapsed'))));
  try { if (localStorage.getItem(RAIL_KEY) === '1') setRightCollapsed(true); } catch { /* noop */ }
  $('#themeTog').addEventListener('click', toggleStudioTheme);
  initStudioTheme();
  markAppHost();
  $('#connectBtn').addEventListener('click', openConnectModal);
  $('#cclose').addEventListener('click', closeConnectModal);
  $('#connectModal').addEventListener('click', (e) => { if (e.target === $('#connectModal')) closeConnectModal(); });
  // import via the File System Access picker when available (captures a writable handle
  // so 保存 HTML can later overwrite in place); else fall back to the classic <input>.
  $('#imp').addEventListener('click', async () => {
    const w = window as unknown as { showOpenFilePicker?: (o?: unknown) => Promise<FsFileHandle[]> };
    if (w.showOpenFilePicker) {
      try {
        const [h] = await w.showOpenFilePicker({
          types: [{ description: 'HTML deck', accept: { 'text/html': ['.html', '.htm'] } }],
        });
        const file = await h.getFile();
        importFile(file.name, await file.text()); // clears fileHandle…
        fileHandle = h;                            // …then remember this one for overwrite-save
        return;
      } catch (e) { if ((e as Error).name === 'AbortError') return; /* else fall back */ }
    }
    ($('#file') as HTMLInputElement).click();
  });
  ($('#file') as HTMLInputElement).addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    f.text().then((t) => importFile(f.name, t)); // no handle from a plain <input> → save will prompt once
  });
  $('#saveHtml').addEventListener('click', () => { void saveHtmlInPlace(); });
  // 另存为：导出一份新的 HTML 副本（不覆盖原文件）。三级兜底，避免「闪一下找不到文件」：
  //   ① 连了 Claude（bridge）→ 存到 deck 同目录并在访达高亮（最稳，不靠浏览器下载）
  //   ② 原生「保存到…」对话框（能自己选文件夹）
  //   ③ 退回 blob 下载，并明确告知落到「下载」文件夹
  $('#expHtml').addEventListener('click', async () => {
    const html = mode === 'html' ? await buildExportHtml() : renderDeckHtml(deck);
    // 在 app 壳里：交给原生弹真正的「另存为」面板，用户自己挑位置和文件名。
    //
    // **这条以前没有，后果是「另存为」根本没在另存**：它走桥写盘，而桥只会写到
    // deck 旁边的同名文件——桥一旦知道原文件路径，那就是原文件本身，
    // 「另存为」等于变成了第二个「保存」，而且不弹任何窗口。
    const native = (window as unknown as {
      webkit?: { messageHandlers?: { smSaveAs?: { postMessage(m: unknown): Promise<string | null> } } };
    }).webkit?.messageHandlers?.smSaveAs;
    if (native) {
      try {
        const saved = await native.postMessage({ name: fileBase + '.html', html });
        if (saved) toast('✅ 已另存为：' + saved + '（已在访达高亮）');
        return;                       // 用户取消也到此为止，别再往下走
      } catch (e) {
        toast('另存为失败：' + ((e as Error).message || e), true);
        return;
      }
    }
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch(`${libBase()}/api/export-html?name=${encodeURIComponent(fileBase)}.html`, {
          method: 'POST', headers: { 'content-type': 'text/html;charset=utf-8' }, body: html,
        });
        const j = await r.json() as { ok: boolean; path?: string; error?: string };
        if (j.ok && j.path) {
          toast('✅ 已另存为：' + j.path + '（已在访达高亮）'
            + (embedPhoneRemote ? (newRoomOnExport ? ' · 已换新房间号，手机需重扫码' : ' · 沿用原房间号，手机不用重扫') : ''));
          return;
        }
      } catch { /* bridge 不可用 → 往下走 */ }
    }
    const w = window as unknown as { showSaveFilePicker?: (o?: unknown) => Promise<FsFileHandle> };
    if (w.showSaveFilePicker) {
      try {
        const h = await w.showSaveFilePicker({
          suggestedName: fileBase + '.html',
          types: [{ description: 'HTML deck', accept: { 'text/html': ['.html', '.htm'] } }],
        });
        const ws = await h.createWritable();
        await ws.write(html); await ws.close();
        toast('已保存：' + (h.name || fileBase + '.html'));
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // 用户取消对话框
        /* 其它错误 → 退回下载 */
      }
    }
    download(fileBase + '.html', html, 'text/html');
    toast('已下载到「下载」文件夹：' + fileBase + '.html', false);
  });

  // drag & drop import anywhere
  let dragN = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragN++; document.body.classList.add('dragging'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => { if (--dragN <= 0) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragN = 0; document.body.classList.remove('dragging'); setTrayOver(false);
    const dt = e.dataTransfer; if (!dt) return;
    // image files → stage them in the tray (AI-first: don't import an image as a deck).
    // Needs an open HTML deck to place into; otherwise tell the user to import one first.
    const imgFiles = Array.prototype.filter.call(dt.files || [], (f: File) => f.type.indexOf('image/') === 0) as File[];
    if (imgFiles.length && (!dt.files || imgFiles.length === dt.files.length)) {
      if (mode !== 'html') { toast('请先导入 HTML deck，再拖入图片素材', true); return; }
      imgFiles.forEach((f) => { const r = new FileReader(); r.onload = () => addTrayImage(f.name, String(r.result)); r.readAsDataURL(f); });
      toast(`已暂存 ${imgFiles.length} 张图片到「图片素材」，备齐后交给 AI 排版`);
      return;
    }
    // prefer a file-system handle (drag-drop on Chromium) so 保存 HTML can overwrite in place
    const item = dt.items && dt.items[0];
    const getH = item && (item as unknown as { getAsFileSystemHandle?: () => Promise<FsFileHandle | null> }).getAsFileSystemHandle;
    if (getH) {
      try {
        const h = await (item as unknown as { getAsFileSystemHandle(): Promise<FsFileHandle | null> }).getAsFileSystemHandle();
        if (h && h.kind !== 'directory' && h.getFile) {
          const file = await h.getFile();
          importFile(file.name, await file.text()); // clears fileHandle…
          fileHandle = h;                            // …then remember the dropped file
          return;
        }
      } catch { /* fall through to plain file read */ }
    }
    const f = dt.files?.[0]; if (f) f.text().then((t) => importFile(f.name, t));
  });

  // automation hooks: agents / verification can drive Studio programmatically
  (window as unknown as { __SM_IMPORT__: typeof importFile }).__SM_IMPORT__ = importFile;
  (window as unknown as { __SM_EXPORT_HTML__: () => string }).__SM_EXPORT_HTML__ = () =>
    mode === 'html' ? exportHtmlDeck() : renderDeckHtml(deck);
  (window as unknown as { __SM_BUILD_EXPORT__: () => Promise<string> }).__SM_BUILD_EXPORT__ = buildExportHtml;
  (window as unknown as { __SM_SAVE_HTML__: typeof saveHtmlInPlace }).__SM_SAVE_HTML__ = saveHtmlInPlace;
  (window as unknown as { __SM_HAS_FILE_HANDLE__: () => boolean }).__SM_HAS_FILE_HANDLE__ = () => !!fileHandle;
  (window as unknown as { __SM_SET_INSTR__: (id: string, t: string) => void }).__SM_SET_INSTR__ = (id, t) => { if (t) { aiInstructions[id] = t; aiApplied.delete(id); } else { delete aiInstructions[id]; } if (mode === 'html') refreshTasks(); };
  (window as unknown as { __SM_APPLY_PATCH__: typeof applyAiPatch }).__SM_APPLY_PATCH__ = applyAiPatch;
  // image-tray hooks (for automation / headless verification)
  (window as unknown as { __SM_TRAY_ADD__: typeof addTrayImage }).__SM_TRAY_ADD__ = addTrayImage;
  (window as unknown as { __SM_TRAY_SET_NOTE__: (id: string, n: string) => void }).__SM_TRAY_SET_NOTE__ = (id, n) => { const t = trayImages.find((x) => x.id === id); if (t) { t.note = n; renderTray(); } };
  (window as unknown as { __SM_TRAY_SET_PAGE__: (id: string, slideId: string) => void }).__SM_TRAY_SET_PAGE__ = (id, slideId) => { const t = trayImages.find((x) => x.id === id); if (t) { t.slideId = slideId; renderTray(); } };
  (window as unknown as { __SM_TRAY_LIST__: () => { id: string; name: string; note: string; placed: boolean; slideId: string }[] }).__SM_TRAY_LIST__ = () => trayImages.map((t) => ({ id: t.id, name: t.name, note: t.note, placed: t.placed, slideId: t.slideId }));
  // unified 配图清单 + 待办 + send hooks
  (window as unknown as { __SM_GEN_MARK__: (id: string, type?: 'vector' | 'chart' | 'photo', hint?: string) => void }).__SM_GEN_MARK__ = (id, type, hint) => { genQueue[id] = { type: type || 'vector', hint: hint || '' }; if (mode === 'html') refreshTasks(); };
  (window as unknown as { __SM_ILL_DATA__: (text: string, name?: string) => void }).__SM_ILL_DATA__ = (text, name) => applyIllData(text, name || 'data.csv');
  (window as unknown as { __SM_GEN_LIST__: () => { id: string; type: string; hint: string }[] }).__SM_GEN_LIST__ = () => Object.keys(genQueue).map((id) => ({ id, type: genQueue[id].type, hint: genQueue[id].hint }));
  (window as unknown as { __SM_TODO__: () => { label: string; page: number; cls: string }[] }).__SM_TODO__ = () => todoItems().map((it) => ({ label: it.label, page: it.page, cls: it.cls }));
  (window as unknown as { __SM_ALL_REQUEST__: typeof buildAllRequest }).__SM_ALL_REQUEST__ = buildAllRequest;
  (window as unknown as { __SM_SEND_ALL__: () => void }).__SM_SEND_ALL__ = submitAll;
  (window as unknown as { __SM_OPEN_LIBRARY__: () => Promise<void> }).__SM_OPEN_LIBRARY__ = openLibrary;
  (window as unknown as { __SM_AUDIT__: typeof auditImportedDeck }).__SM_AUDIT__ = auditImportedDeck;
  (window as unknown as { __SM_PDF_HTML__: typeof pdfPrintHtml }).__SM_PDF_HTML__ = pdfPrintHtml;
  // 预览里的 window.open shim 回头找它要一份「副屏能直接跑」的 deck HTML。
  // 用导出态（不带 contenteditable / 选中框 / keyguard 这些编辑脚手架），但**必须把手机遥控关掉**：
  // 房间号烘死在 deck 里，副屏再连一次就是同一房间的第二个放映端，会把主窗口顶掉（evicted）。
  (window as unknown as { __SM_PRESENTER_HTML__: () => string }).__SM_PRESENTER_HTML__ = () => {
    const saved = embedPhoneRemote;
    embedPhoneRemote = false;
    try { return assembleDeck(false); } finally { embedPhoneRemote = saved; }
  };
  // bridge hooks (for automation / headless verification)
  (window as unknown as { __SM_BRIDGE__: () => { connected: boolean; owner: { label: string; since: number } | null; port: number } }).__SM_BRIDGE__ = () => ({ connected: bridge.connected, owner: bridge.owner, port: bridge.port });
  // permission mode + proposal state (for verification)
  (window as unknown as { __SM_SET_CONFIRM__: (v: boolean) => void }).__SM_SET_CONFIRM__ = (v) => { aiConfirm = v; const t = $('#aiConfirmTog') as HTMLInputElement | null; if (t) t.checked = v; };
  (window as unknown as { __SM_PROPOSAL__: () => { count: number; visible: boolean } }).__SM_PROPOSAL__ = () => ({ count: proposed.size, visible: ($('#aiProposalBar')?.style.display !== 'none') });
  // resilience hooks (autosave / undo / image) for verification
  (window as unknown as { __SM_UNDO__: () => void }).__SM_UNDO__ = undo;
  (window as unknown as { __SM_REDO__: () => void }).__SM_REDO__ = redo;
  (window as unknown as { __SM_STATE__: () => { dirty: boolean; undo: number; redo: number; draft: boolean } }).__SM_STATE__ = () => {
    let draft = false; try { draft = !!localStorage.getItem(DRAFT_KEY); } catch { /* noop */ }
    return { dirty, undo: undoStack.length, redo: redoStack.length, draft };
  };
  (window as unknown as { __SM_PLACE_IMAGE__: (u: string) => void }).__SM_PLACE_IMAGE__ = placeImage;
  (window as unknown as { __SM_MOVE_SEL__: (dx: number, dy: number) => void }).__SM_MOVE_SEL__ = commitMove;
  (window as unknown as { __SM_RESIZE_SEL__: (w: number, h?: number) => void }).__SM_RESIZE_SEL__ = commitResize;
  (window as unknown as { __SM_GIZMO_ON__: () => boolean }).__SM_GIZMO_ON__ = () => !!gizmoEl;

  // edits from the preview iframe
  window.addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d !== 'object') return;
    if (d.type === 'sm-edit') applyEdit(d.bid, d.field, d.value);
    else if (d.type === 'sm-select') { selBid = d.bid; showBlock(d.bid, d.btype); }
    else if (d.type === 'sm-ready') gotoPreview(cur);
  });

  renderLeft(); refreshSlidePanel(); renderDoc(); reloadPreview();
  updateBridgeBadge(); connectBridge();
  maybeOfferDraftRestore();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
else buildUI();
