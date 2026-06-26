// Slidesmith Studio — a fully client-side editor bundled into one HTML file.
// Open it (file:// or http), drag in a contract HTML deck (or deck.json / deck.md),
// edit Keynote-style, then "保存 HTML" to overwrite the opened file in place (File
// System Access API) or "导出 HTML 副本" to download a copy. No server, no CLI.
import {
  validateDeck,
  LAYOUTS,
  ANIM_NAMES,
  ANIM_OUT_NAMES,
  MOTION_NAMES,
  COLOR_TOKENS,
  SIZE_TOKENS,
  ALIGN_TOKENS,
  WEIGHT_TOKENS,
} from '@slidesmith/ir';
import type { Deck, Block, Slide, NoteBlock } from '@slidesmith/ir';
import { parseMarkdownToIR } from '@slidesmith/parser-md';
import {
  renderDeckHtml,
  renderTranscriptHtml,
  renderPresenterHtml,
} from '@slidesmith/engine';
import { listThemes } from '@slidesmith/themes';

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
        { id: 'b5', type: 'list', items: ['拖入 deck.json 或 deck.md', '点文字直接改、右侧换主题', '导出 HTML 投屏'],
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
  colors: COLOR_TOKENS as readonly string[],
  sizes: SIZE_TOKENS as readonly string[],
  aligns: ALIGN_TOKENS as readonly string[],
  weights: WEIGHT_TOKENS as readonly string[],
};

// friendly Chinese labels for the inspector
const MOTION_LABEL: Record<string, string> = {
  none: '无', glow: '呼吸灯（发光）', breathe: '呼吸（缩放）', float: '漂浮', pulse: '闪烁', neon: '霓虹微闪', stress: '强调脉冲', shimmer: '流光溢彩',
};
const ANIM_LABEL: Record<string, string> = {
  none: '无', fade: '淡入', rise: '上升淡入', 'fade-up': '上移淡入', pop: '弹出', 'in-left': '从左进', 'in-right': '从右进', 'stagger-list': '逐条浮现', 'counter-up': '数字滚动', morph: '形变',
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
const bridge = { ws: null as WebSocket | null, connected: false, everConnected: false, tries: 0 };

// ---- v2 HTML-first mode: an imported contract HTML deck is the source of truth ----
type Mode = 'ir' | 'html';
let mode: Mode = 'ir';
interface HtmlSlide { id: string; title: string; seg: string; segName: string; variant: string; html: string }
let htmlSlides: HtmlSlide[] = [];
let htmlSelEl: Element | null = null; // currently selected element inside the edit iframe
let htmlGotoAfterRender = -1; // restore this slide after a re-render (e.g. after applying a patch)
let fxMode: 'auto' | 'manual' = 'auto'; // 动效播放模式：auto=进入页面即播 / manual=点击页面才播（写进导出的 <html data-smfx>）

// ---- never-lose-work: a dirty flag + debounced localStorage draft + undo/redo history.
// All HTML-mode mutations route through markDirty()/pushHistory() so edits survive a
// refresh/crash and are reversible. (Roadmap step 1; see _memory/optimization-roadmap.md) ----
let dirty = false; // true when the deck has edits not yet written to the real file
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
const DRAFT_KEY = 'sm-studio-draft-v1';
interface Snap { slides: string; overrides: Record<string, string>; theme: string; fx: 'auto' | 'manual'; cur: number }
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
// the deck's non-slide skeleton, kept verbatim so export re-emits a clean contract deck
const H = {
  head: '', htmlAttrs: 'lang="zh"', bodyClass: '', prelude: '', trailing: '',
  baseTokens: {} as Record<string, string>, overrides: {} as Record<string, string>,
  themes: [] as string[], theme: '',
};

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

// ---------------- rendering ----------------
function previewHtml(): string {
  return renderDeckHtml(deck).replace('</body>', `<script>${BRIDGE}</script></body>`);
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
      const badge = aiApplied.has(s.id) ? '<span class="sbadge done" title="AI 已改过这一页">✓</span>'
        : aiSent.has(s.id) ? '<span class="sbadge sent" title="已发送，等 Claude 改…">●</span>'
        : aiInstructions[s.id] ? '<span class="sbadge todo" title="有待发送给 AI 的评论">●</span>' : '';
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
  // 1) reuse a known handle → silent overwrite
  if (fileHandle) {
    try {
      const w = await fileHandle.createWritable();
      await w.write(html); await w.close();
      toast('已保存 → ' + (fileHandle.name || fileBase + '.html'));
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
      toast('已保存 → ' + (h.name || fileBase + '.html'));
      clearDraft(); syncExportToBridge();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user cancelled the dialog
      /* fall through to download */
    }
  }
  // 3) browser without File System Access API → download a copy
  download(fileBase + '.html', html, 'text/html');
  toast('当前浏览器不支持原地覆盖，已下载副本', true);
}

// route an imported file by type: contract HTML deck → html mode; json/md → IR mode
function importFile(name: string, text: string): void {
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

  H.head = doc.head.innerHTML;
  H.htmlAttrs = attrsString(doc.documentElement);
  H.bodyClass = doc.body.getAttribute('class') || '';
  H.prelude = prelude; H.trailing = trailing;
  H.baseTokens = base; H.overrides = overrides; H.themes = themes;
  H.theme = doc.documentElement.getAttribute('data-theme') || '';

  mode = 'html'; cur = 0; selBid = null; htmlSelEl = null;
  $('#deckname').textContent = fileBase;
  Object.keys(aiInstructions).forEach((k) => delete aiInstructions[k]); aiApplied.clear(); aiSent.clear(); Object.keys(aiBefore).forEach((k) => delete aiBefore[k]); aiCurId = ''; aiDeckInstruction = ''; usedFontIds.clear();
  undoStack = []; redoStack = []; lastPushTag = ''; dirty = false; updateUndoButtons(); updateDirtyBadge();
  const aiBox = $('#aiInstruction') as HTMLTextAreaElement | null; if (aiBox) aiBox.value = '';
  const aiDeckBox = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (aiDeckBox) aiDeckBox.value = '';
  const fxSel = $('#hFxMode') as HTMLSelectElement | null; if (fxSel) fxSel.value = fxMode; // reflect imported deck's play mode
  renderLeft(); setHtmlMode(true); refreshHtmlInspector(); renderHtmlEdit();
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
function assembleDeck(forEdit = false): string {
  const editCss = forEdit
    ? '<style id="sm-edit-css">[contenteditable]{cursor:text}'
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
  const editAttr = forEdit ? ' data-smfx-edit="1"' : '';
  return `<!DOCTYPE html>\n<html ${htmlOpenTag()} data-smfx="${fxMode}"${editAttr}>\n<head>\n${H.head}${fontLinks}${TYPO_CSS}${FX_CSS}${editCss}\n</head>\n<body class="${H.bodyClass}">\n${H.prelude}\n<div class="deck" id="deck">\n${deckInner}\n</div>\n${H.trailing}\n${FX_JS}\n</body>\n</html>`;
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
  + '@media(prefers-reduced-motion:reduce){#deck .slide [data-motion],#deck .slide [data-anim],#deck .slide [data-anim] *,#deck .slide [data-anim-out]{animation:none!important;opacity:1!important}}'
  + '</style>';
// FX driver — injected into preview + export. Watches which slide is active and, per
// data-smfx mode, plays it (auto) or arms it for a click (manual). Exposes window hooks
// so the Studio's ▶ button / mode switch can drive it live without a re-render.
const FX_JS = '<script id="sm-fx-js">(function(){'
  + 'var root=document.documentElement;var deck=document.getElementById("deck");if(!deck)return;'
  + 'function mode(){return root.getAttribute("data-smfx")||"auto";}'
  + 'function reduce(){try{return matchMedia("(prefers-reduced-motion:reduce)").matches;}catch(e){return false;}}'
  + 'function active(){return deck.querySelector(".slide.active")||deck.querySelector(".slide");}'
  + 'function arm(s){if(!s)return;s.classList.remove("sm-play");s.classList.add("sm-armed");}'
  + 'function play(s){if(!s)return;s.classList.remove("sm-play");s.classList.remove("sm-armed");void s.offsetWidth;s.classList.add("sm-play");}'
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
function isTextLeaf(el: Element): boolean {
  if (el.querySelector('div,section,ul,ol,li,figure,table,svg,img,canvas,iframe,p,h1,h2,h3,h4,h5,h6,blockquote')) return false;
  return (el.textContent || '').trim().length > 0;
}
function wireFullDeckEditing(d: Document): void {
  d.querySelectorAll('#deck .slide').forEach((slide) => {
    slide.querySelectorAll('*').forEach((el) => { if (isTextLeaf(el)) (el as HTMLElement).setAttribute('contenteditable', 'true'); });
  });
  const deckEl = d.querySelector('#deck'); if (!deckEl) return;
  deckEl.addEventListener('click', (e) => {
    let t = e.target as Node | null; while (t && t.nodeType !== 1) t = (t as Node).parentNode;
    const el = t as HTMLElement | null; if (!el || !el.closest('#deck .slide') || el.classList.contains('slide')) return;
    if (htmlSelEl) (htmlSelEl as HTMLElement).classList.remove('sm-sel');
    htmlSelEl = el; el.classList.add('sm-sel'); showHtmlSel(true, el); showGizmo(el);
  }, true);
  // keep the move/resize gizmo aligned when the deck rescales
  try { (d.defaultView as Window).addEventListener('resize', () => positionGizmo()); } catch { /* noop */ }
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
    // never-lose-work + history for text edits done straight in the deck DOM
    d.addEventListener('input', () => markDirty(), true);
    d.addEventListener('focusin', (e) => { if ((e.target as HTMLElement)?.isContentEditable) pushHistory('text'); }, true);
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
}
function selectHtmlSlide(i: number): void {
  cur = Math.max(0, Math.min(htmlSlides.length - 1, i));
  lastSyncIdx = cur; // we are the source of truth now; keep the nav-poll in step
  if (htmlSelEl) { (htmlSelEl as HTMLElement).classList.remove('sm-sel'); htmlSelEl = null; showHtmlSel(false); } // a selection on the old page no longer applies
  [].forEach.call(document.querySelectorAll('.srow'), (r: Element, idx: number) => r.classList.toggle('active', idx === cur));
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
  (($('#hWeight') as HTMLSelectElement)).value = el.style.fontWeight || '';
  // bold / italic / underline toggles reflect the element's current inline style
  const wt = parseInt(el.style.fontWeight || '', 10);
  toggleBtn('#hBold', wt >= 600);
  toggleBtn('#hItalic', el.style.fontStyle === 'italic');
  toggleBtn('#hUnder', /underline/.test(el.style.textDecorationLine || el.style.textDecoration || ''));
  const al = el.style.textAlign || '';
  toggleBtn('#hAlignL', al === 'left'); toggleBtn('#hAlignC', al === 'center'); toggleBtn('#hAlignR', al === 'right');
  (($('#hAnim') as HTMLSelectElement)).value = el.getAttribute('data-anim') || 'none';
  (($('#hMotion') as HTMLSelectElement)).value = el.getAttribute('data-motion') || 'none';
  (($('#hAnimOut') as HTMLSelectElement)).value = el.getAttribute('data-anim-out') || 'none';
  const wInp = $('#hElW') as HTMLInputElement | null; if (wInp) wInp.value = el.style.width ? String(parseInt(el.style.width, 10)) : '';
  positionGizmo();
  updateAiTarget();
}
function toggleBtn(sel: string, on: boolean): void { const b = $(sel); if (b) b.classList.toggle('on', on); }
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
function snapshot(): Snap { return { slides: JSON.stringify(htmlSlides), overrides: { ...H.overrides }, theme: H.theme, fx: fxMode, cur }; }
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
  H.overrides = { ...s.overrides }; H.theme = s.theme; fxMode = s.fx;
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
  toast('已插入图片（拖蓝框上方 ✥ 移动、右下角改大小）');
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
  toast('已删除该元素（可 Ctrl/⌘+Z 撤销）');
}
function setHtmlToken(name: string, val: string): void {
  pushHistory('token:' + name);
  H.overrides[name] = val;
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  if (d) d.documentElement.style.setProperty(name, val);
  markDirty();
}
function refreshHtmlInspector(): void {
  // theme switching is handled by the deck's OWN control (visible in full-deck view),
  // so we don't duplicate it here (avoids a localStorage tug-of-war).
  const wrap = $('#hThemeWrap'); if (wrap) wrap.style.display = 'none';
  const tk = (name: string, id: string) => { const inp = $(id) as HTMLInputElement; if (inp) inp.value = toHex(H.overrides[name] || H.baseTokens[name] || '') || '#888888'; };
  tk('--accent', '#hAccent'); tk('--paper', '#hPaper'); tk('--ink', '#hInk');
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
    .replace('</head>', '<style id="sm-embedded-fonts">\n' + faces.join('\n') + '\n</style>\n</head>');
  return out;
}
// the bytes we save/download: assembled deck, optionally with fonts inlined for offline use
async function buildExportHtml(): Promise<string> {
  const html = exportHtmlDeck();
  if (!embedFontsChecked()) return html;
  setBusy('正在下载并嵌入字体子集…（首次稍慢）');
  try { const out = await embedFonts(html); setBusy(null); toast('已嵌入字体（离线可用）'); return out; }
  catch (e) { setBusy(null); toast('嵌入字体失败（需联网下载），已按不嵌入导出：' + (e as Error).message, true); return html; }
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
// total tasks to send = pending pages + the deck-level ask (if any)
function aiTotalTasks(): number { return aiPendingCount() + (aiDeckInstruction.trim() ? 1 : 0); }
function updateSendButton(): void {
  const n = aiTotalTasks(); const btn = $('#aiExportAll') as HTMLButtonElement | null; if (!btn) return;
  btn.textContent = bridge.connected ? `🚀 发送 ${n} 个任务给 Claude` : `📦 导出 ${n} 个任务`;
  btn.disabled = n === 0;
}
function refreshAiCount(): void {
  const n = aiTotalTasks();
  const h = $('#aiCountHint'); if (h) h.textContent = n ? `${n} 个任务待发送给 Claude。逐页写好评论、或对整份说一句，一次性发送。` : '还没有待发送的任务。选一页写句评论，或在下面对整份 deck 说一句。';
  updateSendButton();
}
// the queue: every page that has a comment, with its status, clickable to jump
function renderAiQueue(): void {
  const box = $('#aiQueue'); if (!box) return; box.innerHTML = '';
  const rows = htmlSlides.map((s, i) => ({ s, i })).filter(({ s }) => aiInstructions[s.id]);
  if (!rows.length) { box.innerHTML = '<div class="qempty">还没有任务。</div>'; return; }
  rows.forEach(({ s, i }) => {
    const st = aiApplied.has(s.id) ? { c: 'done', t: '已改' } : aiSent.has(s.id) ? { c: 'sent', t: '已发送' } : { c: 'todo', t: '待发送' };
    const row = document.createElement('div'); row.className = 'qrow' + (i === cur ? ' active' : '');
    row.innerHTML = `<span class="qnum">${i + 1}</span><span class="qtt">${esc(s.title)}</span><span class="qst ${st.c}">${st.t}</span>`;
    row.addEventListener('click', () => selectHtmlSlide(i));
    box.appendChild(row);
  });
}
// the animated reminder banner: shows while tasks are out with Claude
function refreshSentBanner(): void {
  const el = $('#aiSentBanner'); if (!el) return;
  const n = aiWaitingCount();
  if (n > 0) { el.style.display = ''; el.innerHTML = `<span class="aisent-dot">●</span><span>已发送 ${n} 个任务，Claude 正在改…改好会自动出现</span>`; }
  else el.style.display = 'none';
}
// one call to re-sync everything that depends on comments/status
function refreshTasks(): void { renderLeft(); renderAiQueue(); refreshAiCount(); refreshSentBanner(); }
function updateAiTarget(): void {
  if (mode !== 'html') return;
  saveAiInstruction(); // persist the page we're leaving
  const i = Math.max(0, Math.min(cur, htmlSlides.length - 1)); const s = htmlSlides[i];
  const el = $('#aiTargetTxt'); if (el) el.textContent = s ? `本页：第 ${i + 1} 页 · ${s.title}` : '本页：—';
  const applied = !!(s && aiApplied.has(s.id));
  const chip = $('#aiAppliedChip'); if (chip) chip.style.display = applied ? '' : 'none';
  const rev = $('#aiRevertOne'); if (rev) rev.style.display = (applied && aiBefore[s!.id] !== undefined) ? '' : 'none';
  aiCurId = s ? s.id : '';
  const box = $('#aiInstruction') as HTMLTextAreaElement | null;
  if (box) box.value = aiCurId ? (aiInstructions[aiCurId] || '') : '';
  renderAiQueue(); refreshAiCount();
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
        (htmlSelEl as HTMLElement).classList.remove('sm-sel'); htmlSelEl = null; showHtmlSel(false);
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
function aiSlideBlock(s: HtmlSlide, i: number, instruction: string): string {
  return `### 第 ${i + 1} 页 · ${s.title}  (data-id: \`${s.id}\`)
**修改要求：** ${instruction || '（未填写——可不改这一页）'}

当前 HTML（在此基础上改写）：
${FENCE}html
${s.html}
${FENCE}
`;
}
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
`;
}
// single page (the current target)
function buildAiRequest(): { id: string; name: string; content: string } | null {
  harvestAll(); saveAiInstruction();
  const i = currentHtmlSlideIndex(); const s = htmlSlides[i]; if (!s) return null;
  const content = aiRequestHeader('单页') + '## 需要修改的页\n' + aiSlideBlock(s, i, aiInstructions[s.id] || '') + aiOutputSpec();
  return { id: s.id, name: `${fileBase}.${s.id}.ai-request.md`, content };
}
// all pending page-comments + any deck-level ask (one file, processed in one go)
function buildAllAiRequests(): { count: number; name: string; content: string } | null {
  harvestAll(); saveAiInstruction();
  const blocks: string[] = [];
  htmlSlides.forEach((s, i) => { if (aiInstructions[s.id] && !aiApplied.has(s.id)) blocks.push(aiSlideBlock(s, i, aiInstructions[s.id])); });
  const hasDeck = !!aiDeckInstruction.trim();
  if (!blocks.length && !hasDeck) return null;
  const scope = hasDeck && blocks.length ? `整份 deck + ${blocks.length} 页` : hasDeck ? '整份 deck' : `共 ${blocks.length} 页`;
  let body = aiRequestHeader(scope);
  if (hasDeck) body += aiDeckBlock();
  if (blocks.length) body += '## 需要修改的页（这些页有明确要求；上面的整份要求也请一并考虑）\n' + blocks.join('\n');
  return { count: blocks.length + (hasDeck ? 1 : 0), name: `${fileBase}.all-requests.md`, content: body + aiOutputSpec() };
}
function applyAiPatch(text: string): void {
  if (mode !== 'html') { toast('请先导入 HTML deck', true); return; }
  let html = text;
  const m = text.match(/```html\s*([\s\S]*?)```/i); if (m) html = m[1];
  let secs: Element[];
  try { secs = Array.prototype.slice.call(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('section.slide')) as Element[]; }
  catch (e) { toast('补丁解析失败: ' + (e as Error).message, true); return; }
  if (!secs.length) { toast('补丁里没找到 <section class="slide">', true); return; }
  pushHistory('ai'); // so the user can Ctrl/⌘+Z an AI change too
  harvestAll(); // preserve other slides' manual edits before re-render
  let applied = 0, firstIdx = -1;
  secs.forEach((sec) => {
    let id = sec.getAttribute('data-id');
    let idx = id ? htmlSlides.findIndex((s) => s.id === id) : -1;
    if (idx < 0 && secs.length === 1) { idx = currentHtmlSlideIndex(); id = htmlSlides[idx]?.id || null; } // lenient fallback
    if (idx >= 0 && htmlSlides[idx]) { if (id) { sec.setAttribute('data-id', id); if (aiBefore[id] === undefined) aiBefore[id] = htmlSlides[idx].html; aiApplied.add(id); aiSent.delete(id); } htmlSlides[idx].html = sec.outerHTML; applied++; if (firstIdx < 0) firstIdx = idx; }
  });
  if (!applied) { toast('补丁的 data-id 不匹配任何页', true); return; }
  htmlGotoAfterRender = firstIdx; // stay on the patched slide after re-render
  renderHtmlEdit(); refreshTasks(); markDirty();
  toast('AI 改好了 ' + applied + ' 页（左侧打勾的页，不满意可「还原本页」）');
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
  sum.textContent = findings.length ? `${e} 处问题 · ${findings.length - e} 处提醒（点条目跳到该页）` : '✓ 没发现明显的溢出 / 对比度 / 坏图问题';
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
  return full.replace('</head>', printCss + '</head>');
}
function exportPdf(): void {
  const w = window.open('', '_blank'); if (!w) { toast('请允许弹窗以导出 PDF', true); return; }
  w.document.open(); w.document.write(pdfPrintHtml()); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 700);
  toast('已打开打印窗口：在对话框里把「目标」选为「另存为 PDF」');
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
  $('#restoreGo').onclick = () => { bar.style.display = 'none'; importFile((d.name || 'deck') + '.html', d.html as string); toast('已恢复草稿（保存前请重新选目标文件覆盖）'); };
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
  const b = $('#themeTog'); if (b) b.textContent = dark ? '☀️' : '🌙';
}
function initStudioTheme(): void {
  let dark = false; try { dark = localStorage.getItem(THEME_KEY) === 'dark'; } catch { /* noop */ }
  applyStudioTheme(dark);
}
function toggleStudioTheme(): void {
  const dark = !document.body.classList.contains('dark');
  applyStudioTheme(dark);
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* noop */ }
}

// ======================= bridge: connected mode =======================
function updateBridgeBadge(): void {
  const b = $('#bridgeBadge'); if (b) { b.textContent = bridge.connected ? '● 已连接 Claude' : ''; b.className = 'bridge-badge' + (bridge.connected ? ' on' : ''); }
  // when NOT connected, offer the one-click "连接 Claude" button (hidden once connected)
  const cb = $('#connectBtn'); if (cb) cb.style.display = bridge.connected ? 'none' : '';
  updateSendButton();
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
    box.innerHTML = '<div class="cstatus ok">✅ 检测到本地服务，可以连上 Claude 了！</div>'
      + '<button id="cgo" class="primary-mini" style="width:100%;margin-top:12px;padding:10px">🔗 打开「已连接」的 Studio（带上当前 deck）→</button>'
      + '<div class="cfaint">会在 ' + bridgeUrl() + ' 打开连接版，自动连上 Claude；你当前的改动会一起带过去。</div>';
    const go = $('#cgo'); if (go) go.addEventListener('click', openConnected);
  } else {
    box.innerHTML = '<div class="cstatus">⏳ 正在检测本地服务…（开着 Claude Code 就会自动连上）</div>'
      + '<div class="chint">最简单的连法（小白也行）：</div>'
      + '<ol class="csteps"><li>打开 <b>Claude Code</b></li>'
      + '<li>跟它说「<b>用 slidesmith 打开这份 slides</b>」，或敲 <code>/slidesmith</code></li>'
      + '<li>它会自动把服务跑起来、弹出一个<b>已连接</b>的 Studio —— 在那一版里改就行</li></ol>'
      + '<div class="cfaint">检测到服务后，上面会自动变绿、出现「打开连接版」按钮。<br>技术党也可在仓库目录运行 <code>npm run sm -- serve</code>。</div>';
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
// the action behind the "submit" button: send over the bridge when connected,
// else fall back to downloading the prompt file for the human to hand to an AI.
function submitRequests(): void {
  const r = buildAllAiRequests();
  if (!r) { toast('还没有任务：选一页写句评论，或在「对整份 deck 说」里写一句', true); return; }
  // the pages going out now become "已发送 · 等待" until a patch comes back
  const sentNow = htmlSlides.filter((s) => aiInstructions[s.id] && !aiApplied.has(s.id)).map((s) => s.id);
  if (bridge.connected && bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
    bridge.ws.send(JSON.stringify({ type: 'requests', request: r }));
    toast(`已发送给 Claude（已连接）：${r.count} 个任务，等他改…`);
  } else {
    download(r.name, r.content, 'text/markdown');
    toast(`已导出 ${r.count} 个任务 → ${r.name}`);
  }
  sentNow.forEach((id) => aiSent.add(id));
  // the deck-level ask is one-shot — clear it after sending so it isn't re-sent
  if (aiDeckInstruction.trim()) { aiDeckInstruction = ''; const box = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (box) box.value = ''; }
  refreshTasks();
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
    updateBridgeBadge(); toast('已连接 Claude Code（已连接模式）');
  });
  ws.addEventListener('message', (e: MessageEvent) => {
    let m: { type?: string; name?: string; html?: string; text?: string };
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (m.type === 'import' && typeof m.html === 'string') importFile(m.name || 'deck.html', m.html);
    // after applying a patch, sync the updated full deck back so the bridge's
    // in-memory copy stays current (late-joiners / reconnects see the change)
    else if (m.type === 'patch' && typeof m.text === 'string') { applyAiPatch(m.text); setTimeout(syncExportToBridge, 500); }
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
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;color:#1c1c1f;display:flex;flex-direction:column;background:#f4f4f5}
.ehead{height:50px;flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 16px;background:#1b1b1d;color:#eee;font-size:14px}
.ehead .brand{font-weight:700}.ehead .dn{opacity:.6;font-size:13px}.ehead .grow{flex:1}
.ehead button{background:#2c2c2f;color:#eee;border:1px solid #3a3a3d;border-radius:7px;padding:7px 13px;font-size:13px;cursor:pointer}
.ehead button:hover{background:#3a3a3d}.ehead button.primary{background:#B5402A;border-color:#B5402A}
.ehead .iconbtn{padding:6px 10px;font-size:15px;line-height:1}
.ehead .sep{width:1px;height:22px;background:#3a3a3d;margin:0 2px}
.ehead .bridge-badge{font-size:12px;padding:3px 10px;border-radius:11px;line-height:1.4}
.ehead .bridge-badge.on{background:#13321f;color:#7fe0a0;border:1px solid #2c6b48}
.ehead .connect-btn{background:#185FA5;border-color:#185FA5;color:#fff;font-weight:600}
.ehead .connect-btn:hover{background:#0c447c}
.cmodal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100}
.cbox{background:#fff;border-radius:12px;padding:20px 22px;width:460px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.cbox .ctitle{font-size:16px;font-weight:700;margin-bottom:14px;color:#1c1c1f}
.cbox .cstatus{font-size:14px;padding:10px 13px;border-radius:8px;background:#f1f1f2;color:#555}
.cbox .cstatus.ok{background:#e1f5ee;color:#0f6e56;font-weight:600}
.cbox .chint{font-size:13px;color:#6a6a6e;margin:14px 0 6px;font-weight:600}
.cbox .csteps{margin:0;padding-left:22px;font-size:13px;line-height:1.95;color:#333}
.cbox code{background:#f1f1f2;border-radius:4px;padding:1px 6px;font-size:12px;font-family:ui-monospace,Menlo,monospace}
.cbox .cfaint{font-size:12px;color:#9a9a9e;margin-top:14px;line-height:1.7;border-top:1px solid #eee;padding-top:11px}
.cbox .cclose{margin-top:16px;width:100%}
.emain{flex:1;display:flex;min-height:0}
.left{width:240px;flex:0 0 auto;background:#fff;border-right:1px solid #e2e2e4;display:flex;flex-direction:column}
body.navcollapsed .left{display:none}
.lbar{display:flex;gap:6px;padding:10px;border-bottom:1px solid #eee}
.lbar button{flex:1;background:#f1f1f2;border:1px solid #e0e0e2;border-radius:6px;padding:7px 0;cursor:pointer;font-size:15px}
.lbar button:hover{background:#e8e8ea}
#slides{flex:1;overflow:auto;padding:8px}
.srow{display:flex;gap:9px;align-items:center;padding:9px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.srow:hover{background:#f6f6f7}.srow.active{background:#fbeae6;border-color:#e7b5aa}
.srow .snum{font-variant-numeric:tabular-nums;color:#B5402A;font-weight:700;min-width:1.6em}
.srow .sseg{font-size:10px;color:#9a9a9e;background:#f1f1f2;border:1px solid #e4e4e6;border-radius:4px;padding:0 5px;line-height:16px}
.srow .stt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;flex:1}
.srow .sbadge{flex:0 0 auto;font-size:11px;line-height:1;width:17px;height:17px;display:flex;align-items:center;justify-content:center;border-radius:50%}
.srow .sbadge.todo{color:#fff;background:#D85A30;font-size:9px}
.srow .sbadge.sent{color:#fff;background:#378ADD;font-size:9px;animation:sm-badge-pulse 1.25s ease-out infinite}
.srow .sbadge.done{color:#fff;background:#1D9E75;font-weight:700}
@keyframes sm-badge-pulse{0%{box-shadow:0 0 0 0 rgba(55,138,221,.6)}70%,100%{box-shadow:0 0 0 6px rgba(55,138,221,0)}}
@keyframes sm-blink{0%,100%{opacity:1}50%{opacity:.2}}
.aisent-banner{display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px 11px;border-radius:8px;font-size:12px;line-height:1.4;color:#0c447c;background:#e6f1fb;border:1px solid #b5d4f4}
.aisent-banner .aisent-dot{color:#378ADD;font-size:11px;animation:sm-blink 1.05s ease-in-out infinite}
#htmlpanel{flex:1;display:flex;flex-direction:column;min-height:0}
.hb-title{font-weight:700;color:#1c1c1f;font-size:13px;margin-bottom:4px}
.right input[type=color]{padding:2px;height:34px;cursor:pointer}
button.mini{background:#f1f1f2;border:1px solid #e0e0e2;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;font-family:inherit;margin-top:2px}
button.mini:hover{background:#e8e8ea}
button.primary-mini{background:#B5402A;color:#fff;border:1px solid #B5402A;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;font-family:inherit}
button.primary-mini:hover{background:#9a3623}
.right h4.sub{font-size:12px;color:#6a6a6e;margin:16px 0 8px;font-weight:600;border-top:1px solid #eee;padding-top:12px}
.aitarget{font-size:12px;color:#6a6a6e;background:#fbeae6;border:1px solid #e7b5aa;border-radius:6px;padding:6px 9px;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.applied-chip{margin-left:auto;font-size:11px;color:#0f6e56;background:#e1f5ee;border-radius:999px;padding:1px 8px}
.aitarget .mini.revert{margin:0;padding:3px 8px;font-size:11px}
.aitarget .applied-chip + .mini.revert{margin-left:6px}
.aiqueue{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;max-height:190px;overflow:auto}
.aiqueue .qempty{font-size:12px;color:#9a9a9e;padding:6px 2px}
.qrow{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:7px;cursor:pointer;border:1px solid #ececee;background:#fff}
.qrow:hover{background:#f6f6f7}.qrow.active{background:#fbeae6;border-color:#e7b5aa}
.qrow .qnum{font-variant-numeric:tabular-nums;color:#B5402A;font-weight:700;min-width:1.5em;font-size:12px}
.qrow .qtt{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.qrow .qst{flex:0 0 auto;font-size:10px;border-radius:999px;padding:1px 8px}
.qrow .qst.todo{color:#993C1D;background:#FAEEDA}
.qrow .qst.sent{color:#0c447c;background:#e6f1fb;animation:sm-blink 1.4s ease-in-out infinite}
.qrow .qst.done{color:#0f6e56;background:#e1f5ee}
.auditout{margin-top:8px;display:flex;flex-direction:column;gap:5px}
.audit-sum{font-size:12px;color:#3a3a3e;font-weight:600}
.audit-row{font-size:12px;line-height:1.4;padding:6px 8px;border-radius:6px;cursor:pointer;border:1px solid transparent}
.audit-row b{color:#1c1c1f}
.audit-row.error{background:#fdecea;border-color:#f3b5ad;color:#a3271a}
.audit-row.warn{background:#fff6e6;border-color:#f0d49a;color:#8a5a12}
.audit-row:hover{filter:brightness(.97)}
.center{flex:1;min-width:0;background:#202022;display:flex;align-items:center;justify-content:center;padding:14px;position:relative}
#preview{width:100%;height:100%;border:0;background:#000;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
.drop{position:absolute;inset:14px;border:2px dashed rgba(255,255,255,.25);border-radius:8px;display:none;align-items:center;justify-content:center;color:#bbb;font-size:15px;pointer-events:none}
body.dragging .drop{display:flex;background:rgba(181,64,42,.12);border-color:#B5402A;color:#fff}
.right{width:300px;flex:0 0 auto;background:#fff;border-left:1px solid #e2e2e4;display:flex;flex-direction:column}
.tabs{display:flex;border-bottom:1px solid #e2e2e4;flex:0 0 auto}
.tab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 0;font-size:13px;color:#6a6a6e;cursor:pointer;font-family:inherit}
.tab:hover{background:#f6f6f7}.tab.active{color:#B5402A;border-bottom-color:#B5402A;font-weight:600}
.pane{flex:1;overflow:auto;padding:16px}
.embedck{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#cfcfd2;cursor:pointer;user-select:none}
.embedck input{margin:0;cursor:pointer}
/* HTML-mode Keynote-style top tabs */
.htabs{display:flex;border-bottom:1px solid #e2e2e4;flex:0 0 auto}
.htab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 0;font-size:13px;color:#6a6a6e;cursor:pointer;font-family:inherit}
.htab:hover{background:#f6f6f7}.htab.active{color:#B5402A;border-bottom-color:#B5402A;font-weight:600}
.hpane{flex:1;overflow:auto;padding:16px}
/* animation sub-tabs (进入 / 动作 / 消失) */
.subtabs{display:flex;gap:5px;margin:6px 0 12px}
.stab{flex:1;background:#f1f1f2;border:1px solid #e0e0e2;border-radius:7px;padding:6px 0;font-size:12px;color:#6a6a6e;cursor:pointer;font-family:inherit}
.stab:hover{background:#e8e8ea}.stab.active{background:#fbeae6;border-color:#e7b5aa;color:#B5402A;font-weight:600}
.spane{margin-bottom:4px}
/* B/I/U + alignment toggle bar */
.btnbar{display:flex;gap:5px;align-items:center}
.tgl{min-width:34px;height:34px;background:#f1f1f2;border:1px solid #e0e0e2;border-radius:6px;font-size:14px;color:#3a3a3e;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;padding:0 8px}
.tgl:hover{background:#e8e8ea}
.tgl.on{background:#B5402A;border-color:#B5402A;color:#fff}
.bbsep{width:1px;height:22px;background:#e0e0e2;margin:0 3px}
.right h3{font-size:11px;letter-spacing:.14em;color:#9a9a9e;margin:18px 0 8px;font-weight:700}.pane h3:first-child{margin-top:0}
.right select,.right textarea,.right input{width:100%;padding:8px 10px;border:1px solid #d8d8da;border-radius:6px;font-size:14px;background:#fff;font-family:inherit}
.right textarea{resize:vertical;line-height:1.5}
.field{margin-bottom:10px}.field label{display:block;font-size:12px;color:#6a6a6e;margin-bottom:4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tag{display:inline-block;background:#fbeae6;border:1px solid #e7b5aa;border-radius:4px;padding:2px 8px;font-size:12px;color:#B5402A;font-weight:600}
.nosel{font-size:12px;color:#9a9a9e;line-height:1.6;padding:10px 0}
.addrow{display:flex;flex-wrap:wrap;gap:6px}
.addrow button,.oprow button{background:#f1f1f2;border:1px solid #e0e0e2;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;font-family:inherit}
.addrow button:hover,.oprow button:hover{background:#e8e8ea}
.oprow{display:flex;gap:6px;margin-top:6px}.oprow button{flex:1}
.oprow button.danger{color:#B5402A}.oprow button:disabled{opacity:.4;cursor:not-allowed}
.nbrow{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.nbrow button{background:transparent;border:1px solid #e0e0e2;border-radius:5px;padding:5px 8px;cursor:pointer;color:#999}
.nbtag{flex:0 0 auto;font-size:11px;padding:3px 7px;border-radius:4px;color:#fff;font-weight:700}
.nb-cue{background:#6E6A5E}.nb-golden{background:#A07A3A}.nb-data{background:#1B2B4F}
.hint{font-size:12px;color:#9a9a9e;line-height:1.7;margin-top:18px;border-top:1px solid #eee;padding-top:12px}.hint b{color:#6a6a6e}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1b1b1d;color:#9bd29b;padding:10px 18px;border-radius:7px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:50}
.toast.show{opacity:1}.toast.bad{color:#ff8a7a}
.ehead .dirtydot{font-size:12px;color:#f0b34a;padding:2px 9px;border-radius:11px;background:#3a2f15;border:1px solid #7a5e22;line-height:1.4}
.ehead button:disabled{opacity:.35;cursor:not-allowed}
.restorebar{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e7b5aa;border-left:4px solid #B5402A;border-radius:9px;padding:10px 14px;box-shadow:0 10px 34px rgba(0,0,0,.18);font-size:13px;color:#3a3a3e}
.restorebar b{color:#B5402A}
.restorebar button{border:1px solid #e0e0e2;background:#f1f1f2;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit}
.restorebar button.go{background:#B5402A;border-color:#B5402A;color:#fff}
.busy{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:70;display:none;align-items:center;gap:9px;background:#1b1b1d;color:#eee;border-radius:9px;padding:9px 16px;font-size:13px;box-shadow:0 10px 34px rgba(0,0,0,.3)}
.busy.show{display:flex}
.busy .spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.25);border-top-color:#f0b34a;border-radius:50%;animation:sm-spin .7s linear infinite}
@keyframes sm-spin{to{transform:rotate(360deg)}}
/* ===== dark Studio chrome (toggle 🌙, persisted) ===== */
body.dark{background:#151517;color:#e6e6e8}
body.dark .left,body.dark .right{background:#1b1b1d;border-color:#2c2c2f}
body.dark .lbar{border-color:#2c2c2f}
body.dark .lbar button{background:#2c2c2f;border-color:#3a3a3d;color:#ddd}
body.dark .lbar button:hover{background:#3a3a3d}
body.dark .srow:hover{background:#242427}
body.dark .srow.active{background:#3a2417;border-color:#7a4a2c}
body.dark .srow .stt{color:#dcdce0}
body.dark .srow .sseg{background:#2c2c2f;border-color:#3a3a3d;color:#aaa}
body.dark .htabs,body.dark .tabs{border-color:#2c2c2f}
body.dark .htab,body.dark .tab{color:#9a9a9e}
body.dark .htab:hover,body.dark .tab:hover{background:#242427}
body.dark .htab.active,body.dark .tab.active{color:#f0b34a;border-bottom-color:#f0b34a}
body.dark .right h3{color:#7a7a7e}
body.dark .right select,body.dark .right textarea,body.dark .right input{background:#242427;border-color:#3a3a3d;color:#e6e6e8}
body.dark .right h4.sub{color:#9a9a9e;border-color:#2c2c2f}
body.dark .field label{color:#9a9a9e}
body.dark .addrow button,body.dark .oprow button,body.dark button.mini,body.dark .stab,body.dark .tgl{background:#2c2c2f;border-color:#3a3a3d;color:#ddd}
body.dark .addrow button:hover,body.dark .oprow button:hover,body.dark button.mini:hover,body.dark .stab:hover{background:#3a3a3d}
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
  <button id="navtog" class="iconbtn" title="折叠 / 展开页面列表">☰</button>
  <button id="undoBtn" class="iconbtn" title="撤销 (⌘/Ctrl+Z)" disabled>↶</button>
  <button id="redoBtn" class="iconbtn" title="重做 (⌘/Ctrl+⇧+Z)" disabled>↷</button>
  <button id="themeTog" class="iconbtn" title="深色 / 浅色界面">🌙</button>
  <span class="brand">✎ Slidesmith Studio</span>
  <span class="dn" id="deckname">${esc(fileBase)}</span>
  <span class="dirtydot" id="dirtyDot" title="有未保存的修改（已自动存草稿，按 ⌘/Ctrl+S 写回文件）" style="display:none">●未保存</span>
  <span id="bridgeBadge" class="bridge-badge" title="与 Claude Code 的连接状态"></span>
  <button id="connectBtn" class="connect-btn" title="一键连接 Claude Code">🔌 连接 Claude</button>
  <span class="grow"></span>
  <button id="imp">导入 HTML / deck.json / .md</button>
  <span class="sep"></span>
  <label class="embedck" title="勾选后，导出/保存时把用到的字体子集内嵌进 HTML —— 断网、换电脑也显示正确字体（文件略大）"><input id="embedFonts" type="checkbox"> 嵌入字体</label>
  <button id="expPdf">导出 PDF</button>
  <button id="expHtml">导出 HTML 副本</button>
  <button id="saveHtml" class="primary" title="直接覆盖你导入的那个 HTML 文件">💾 保存 HTML</button>
  <input id="file" type="file" accept=".html,.htm,.json,.md" style="display:none">
</div>
<div class="emain">
  <aside class="left">
    <div class="lbar"><button id="add" title="加页">＋</button><button id="del" title="删页">🗑</button><button id="up" title="上移">↑</button><button id="down" title="下移">↓</button></div>
    <div id="slides"></div>
  </aside>
  <main class="center">
    <iframe id="preview"></iframe>
    <div class="drop">松开即可导入 HTML / deck.json / deck.md</div>
  </main>
  <aside class="right">
    <div id="htmlpanel" style="display:none">
      <div class="htabs">
        <button class="htab active" data-htab="fmt">格式</button>
        <button class="htab" data-htab="anim">动画效果</button>
        <button class="htab" data-htab="ai">AI 修改</button>
      </div>

      <!-- ===== 格式 ===== -->
      <div class="pane hpane" data-hpane="fmt">
        <h3>主题 / 配色</h3>
        <div class="field" id="hThemeWrap" style="display:none"><label>主题</label><select id="hTheme"></select></div>
        <div class="grid2">
          <div class="field"><label>强调色 accent</label><input id="hAccent" type="color"></div>
          <div class="field"><label>背景 paper</label><input id="hPaper" type="color"></div>
        </div>
        <div class="field"><label>文字 ink</label><input id="hInk" type="color"></div>
        <button id="hTokReset" class="mini">↺ 复原配色</button>

        <h3>插入</h3>
        <div class="oprow"><button id="hInsertImg">🖼 插入图片</button></div>
        <div class="hint" style="margin-top:6px">图片会内联进 HTML（导出即带，离线可用）。也可直接在预览里粘贴图片。选中某元素时插在它后面。</div>

        <h3>选中元素</h3>
        <div class="nosel hseloff" id="hNoSel">在预览里<b>点一段文字</b>即可直接改字；选中后可调它的字体 / 字号 / 颜色。</div>
        <div id="hSel" class="hselon" style="display:none">
          <div class="tag" id="hSelTag">—</div>
          <div class="field"><label>字体</label><select id="hFont"></select></div>
          <div class="grid2">
            <div class="field"><label>字号(px)</label><input id="hFs" type="number" min="8" placeholder="默认"></div>
            <div class="field"><label>颜色</label><input id="hColor" type="color"></div>
          </div>
          <div class="field"><label>样式</label>
            <div class="btnbar">
              <button id="hBold" class="tgl" title="加粗"><b>B</b></button>
              <button id="hItalic" class="tgl" title="斜体"><i>I</i></button>
              <button id="hUnder" class="tgl" title="下划线"><span style="text-decoration:underline">U</span></button>
              <span class="bbsep"></span>
              <button id="hAlignL" class="tgl" title="左对齐">⬅</button>
              <button id="hAlignC" class="tgl" title="居中">↔</button>
              <button id="hAlignR" class="tgl" title="右对齐">➡</button>
            </div>
          </div>
          <div class="field"><label>粗细（精细）</label><select id="hWeight"><option value="">默认</option><option>300</option><option>400</option><option>500</option><option>600</option><option>700</option><option>900</option></select></div>
          <div class="grid2">
            <div class="field"><label>宽度(px，空=自动)</label><input id="hElW" type="number" min="20" placeholder="自动"></div>
            <div class="field"><label>位置 / 大小</label><button id="hBoxReset" class="mini" title="清除拖动产生的位移和尺寸">↺ 复位</button></div>
          </div>
          <div class="hint" style="margin-top:0">选中后：拖蓝框上方 <b>✥</b> 移动、拖右下角 <b>◢</b> 改大小。</div>
          <div class="oprow"><button id="hElUp" title="次序上移">↑ 次序</button><button id="hElDown" title="次序下移">↓ 次序</button><button id="hElDel" class="danger" title="删除这个元素">🗑 删除</button></div>
        </div>
      </div>

      <!-- ===== 动画效果 ===== -->
      <div class="pane hpane" data-hpane="anim" hidden>
        <div class="nosel hseloff">在预览里<b>点选一个元素</b>，再给它加动画。</div>
        <div class="hselon" style="display:none">
          <div class="tag" id="hSelTag2">—</div>
          <div class="subtabs">
            <button class="stab active" data-stab="in">进入</button>
            <button class="stab" data-stab="motion">动作</button>
            <button class="stab" data-stab="out">消失</button>
          </div>
          <div class="spane" data-spane="in">
            <div class="field"><label>进入动画（翻到本页时播一次）</label><select id="hAnim"></select></div>
            <div class="oprow"><button id="hAnimPlay" title="在本页重放进入/动作">▶ 预览进入 / 动作</button></div>
          </div>
          <div class="spane" data-spane="motion" hidden>
            <div class="field"><label>持续动作（一直循环，如呼吸灯 / 流光）</label><select id="hMotion"></select></div>
            <div class="oprow"><button id="hAnimPlay2" title="在本页重放进入/动作">▶ 预览进入 / 动作</button></div>
          </div>
          <div class="spane" data-spane="out" hidden>
            <div class="field"><label>消失动画（离开本页时播一次）</label><select id="hAnimOut"></select></div>
            <div class="oprow"><button id="hAnimPlayOut" title="在本页预览消失动画">▶ 预览消失</button></div>
            <div class="hint">放映时翻页会自动播放消失动画；编辑态用此按钮预览。</div>
          </div>
          <h3>触发方式</h3>
          <div class="field"><select id="hFxMode"><option value="auto">自动（进入页面即播）</option><option value="manual">手动（点击页面才播）</option></select></div>
          <div class="hint">触发方式作用于本 deck 的进入 / 动作；放映时按 <b>B</b> 可一键关掉所有动画。</div>
        </div>
      </div>

      <!-- ===== AI 修改 ===== -->
      <div class="pane hpane" data-hpane="ai" hidden>
        <h3>✨ 让 AI 改（复杂 / 模糊的改动）</h3>
        <div class="aitarget" id="aiTarget"><span id="aiTargetTxt">本页：—</span><span class="applied-chip" id="aiAppliedChip" style="display:none">✓ AI 已改过</span><button id="aiRevertOne" class="mini revert" style="display:none">↩︎ 还原本页</button></div>
        <div class="field"><textarea id="aiInstruction" rows="4" placeholder="这一页想让 AI 怎么改？例如：把三个要点改成左右两栏对照，右栏给一个关键数字。写完自动记住，可切到别页继续写。"></textarea></div>
        <div class="oprow"><button id="aiClearOne">清空本页</button></div>
        <div class="hint" id="aiCountHint">还没有待发送的任务。选一页写句评论，或在下面对整份 deck 说一句。</div>
        <div class="aisent-banner" id="aiSentBanner" style="display:none"></div>

        <h4 class="sub">对整份 deck 说…</h4>
        <div class="field"><textarea id="aiDeckInstruction" rows="2" placeholder="对整份 deck 的要求，AI 会挑相关页改。例如：统一所有页的标题字号；给内容过多的页瘦身。"></textarea></div>

        <h4 class="sub">全部任务</h4>
        <div id="aiQueue" class="aiqueue"></div>
        <div class="oprow"><button id="aiExportAll" class="primary-mini" disabled>📦 导出 0 个任务</button></div>

        <h3>视觉自检</h3>
        <div class="oprow"><button id="auditRun">🔍 检查这套 deck（溢出 / 对比度 / 坏图）</button></div>
        <div id="auditOut" class="auditout"></div>
      </div>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="format">格式</button>
      <button class="tab" data-tab="anim">动画效果</button>
      <button class="tab" data-tab="doc">文稿</button>
    </div>
    <div class="pane" data-pane="format">
      <h3>主题（配色）</h3><div class="field"><select id="theme"></select></div>
      <h3>本页布局</h3><div class="field"><select id="layout"></select></div>
      <h3>加元素</h3><div class="addrow" id="addrow"></div>
      <div class="nosel">在中间预览里<b>点选一个元素</b>，即可调它的字体 / 位置。</div>
      <h3 class="needsel" style="display:none">选中元素 · <span class="tag" id="blktype">—</span></h3>
      <div class="needsel" style="display:none">
        <div class="field"><label>字号</label><select id="fsize"></select></div>
        <div class="field"><label>颜色</label><select id="fcolor"></select></div>
        <div class="grid2"><div class="field"><label>粗细</label><select id="fweight"></select></div><div class="field"><label>对齐</label><select id="falign"></select></div></div>
        <h3>元素操作</h3>
        <div class="oprow"><button id="elUp">↑ 上移</button><button id="elDown">↓ 下移</button><button id="elDel" class="danger">🗑 删除</button></div>
      </div>
    </div>
    <div class="pane" data-pane="anim" hidden>
      <div class="nosel">在预览里<b>点选一个元素</b>，再给它加动画。</div>
      <div class="needsel" style="display:none">
        <h3>入场动画（翻到本页时播一次）</h3><div class="field"><select id="anim"></select></div>
        <h3>持续动效（一直循环，如呼吸灯）</h3><div class="field"><select id="motion"></select></div>
        <div class="hint">动效在预览/投屏里持续播放；放映时按 <b>B</b> 可一键关掉所有动画。</div>
      </div>
    </div>
    <div class="pane" data-pane="doc" hidden>
      <h3>本页讲稿（逐字稿正文）</h3>
      <div class="field"><textarea id="notes" rows="6" placeholder="这一页要讲的话…可用 **关键词** 提词"></textarea></div>
      <h3>讲稿块</h3>
      <div id="noteblocks"></div>
      <div class="oprow"><button id="addCue">+讲法</button><button id="addGolden">+金句</button><button id="addData">+数据</button></div>
      <div class="hint">讲稿只进逐字稿 / 演讲者视图，不显示在幻灯片上。</div>
    </div>
  </aside>
</div>
<div class="toast" id="toast"></div>
<div class="busy" id="busy"><span class="spin"></span><span id="busyTxt">处理中…</span></div>
<div class="restorebar" id="restoreBar" style="display:none">
  <span id="restoreTxt">发现未保存的草稿</span>
  <button class="go" id="restoreGo">恢复</button>
  <button id="restoreDrop">丢弃</button>
</div>
<div class="cmodal" id="connectModal" style="display:none">
  <div class="cbox">
    <div class="ctitle">🔌 连接 Claude Code</div>
    <div id="cstate"></div>
    <button class="mini cclose" id="cclose">关闭</button>
  </div>
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
  onInput('#hAccent', (v) => setHtmlToken('--accent', v));
  onInput('#hPaper', (v) => setHtmlToken('--paper', v));
  onInput('#hInk', (v) => setHtmlToken('--ink', v));
  $('#hTokReset').addEventListener('click', () => { harvestAll(); H.overrides = {}; renderHtmlEdit(); refreshHtmlInspector(); });
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
  fillSel('#hMotion', meta.motions, MOTION_LABEL); onChange('#hMotion', (v) => { setHtmlMotion(v); previewPlayFx(); });
  fillSel('#hAnimOut', meta.animOuts, ANIM_OUT_LABEL); onChange('#hAnimOut', (v) => { setHtmlAnimOut(v); previewPlayFxOut(); });
  ($('#hFxMode') as HTMLSelectElement).value = fxMode;
  onChange('#hFxMode', (v) => {
    fxMode = v === 'manual' ? 'manual' : 'auto';
    const d = previewFrame()?.contentDocument; if (d) d.documentElement.setAttribute('data-smfx', fxMode);
    previewFxCall('__SM_FX_REARM__');
  });
  $('#hAnimPlay').addEventListener('click', previewPlayFx);
  $('#hAnimPlay2').addEventListener('click', previewPlayFx);
  $('#hAnimPlayOut').addEventListener('click', previewPlayFxOut);
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
    if (e.key === 'Escape') { if (htmlSelEl) { (htmlSelEl as HTMLElement).classList.remove('sm-sel'); htmlSelEl = null; showHtmlSel(false); e.preventDefault(); } }
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
  }));
  document.querySelectorAll('.stab').forEach((tb) => tb.addEventListener('click', () => {
    const name = (tb as HTMLElement).dataset.stab;
    document.querySelectorAll('.stab').forEach((x) => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.spane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.spane !== name));
    if (name === 'out') previewPlayFxOut(); else previewPlayFx();
  }));

  // --- Submit-to-AI: per-page memory + batch send (apply comes back over the bridge) ---
  ($('#aiInstruction') as HTMLTextAreaElement).addEventListener('input', onAiInput);
  ($('#aiDeckInstruction') as HTMLTextAreaElement).addEventListener('input', (e) => { aiDeckInstruction = (e.target as HTMLTextAreaElement).value; refreshAiCount(); });
  $('#aiExportAll').addEventListener('click', submitRequests);
  $('#aiClearOne').addEventListener('click', () => {
    const box = $('#aiInstruction') as HTMLTextAreaElement; box.value = ''; onAiInput();
  });
  $('#aiRevertOne').addEventListener('click', () => { if (aiCurId) revertSlide(aiCurId); });
  $('#auditRun').addEventListener('click', () => renderAuditReport(auditImportedDeck()));
  $('#expPdf').addEventListener('click', exportPdf);

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
  $('#themeTog').addEventListener('click', toggleStudioTheme);
  initStudioTheme();
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
          types: [{ description: 'Deck', accept: { 'text/html': ['.html', '.htm'], 'application/json': ['.json'], 'text/markdown': ['.md'] } }],
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
  $('#expHtml').addEventListener('click', async () => {
    if (mode === 'html') { download(fileBase + '.html', await buildExportHtml(), 'text/html'); toast('已导出编辑后的 HTML'); return; }
    const tn = fileBase + '.transcript.html', pn = fileBase + '.presenter.html';
    download(fileBase + '.html', renderDeckHtml(deck, { presenterUrl: pn }), 'text/html');
    setTimeout(() => download(tn, renderTranscriptHtml(deck), 'text/html'), 250);
    setTimeout(() => download(pn, renderPresenterHtml(deck, { transcriptUrl: tn }), 'text/html'), 500);
    toast('已导出 投屏HTML + 讲稿 + 演讲者视图');
  });

  // drag & drop import anywhere
  let dragN = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragN++; document.body.classList.add('dragging'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => { if (--dragN <= 0) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragN = 0; document.body.classList.remove('dragging');
    const dt = e.dataTransfer; if (!dt) return;
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
  (window as unknown as { __SM_AI_REQUEST__: typeof buildAiRequest }).__SM_AI_REQUEST__ = buildAiRequest;
  (window as unknown as { __SM_AI_REQUEST_ALL__: typeof buildAllAiRequests }).__SM_AI_REQUEST_ALL__ = buildAllAiRequests;
  (window as unknown as { __SM_SET_INSTR__: (id: string, t: string) => void }).__SM_SET_INSTR__ = (id, t) => { if (t) { aiInstructions[id] = t; aiApplied.delete(id); } else { delete aiInstructions[id]; } if (mode === 'html') refreshTasks(); };
  (window as unknown as { __SM_APPLY_PATCH__: typeof applyAiPatch }).__SM_APPLY_PATCH__ = applyAiPatch;
  (window as unknown as { __SM_AUDIT__: typeof auditImportedDeck }).__SM_AUDIT__ = auditImportedDeck;
  (window as unknown as { __SM_PDF_HTML__: typeof pdfPrintHtml }).__SM_PDF_HTML__ = pdfPrintHtml;
  // bridge hooks (for automation / headless verification)
  (window as unknown as { __SM_BRIDGE__: () => { connected: boolean } }).__SM_BRIDGE__ = () => ({ connected: bridge.connected });
  (window as unknown as { __SM_SEND_ALL__: () => void }).__SM_SEND_ALL__ = submitRequests;
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
