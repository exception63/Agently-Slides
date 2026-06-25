// Slidesmith Studio — a fully client-side editor bundled into one HTML file.
// Open it (file:// or http), drag in a deck.json / deck.md, edit Keynote-style,
// and export the deck.json / deck.md / presentation HTML. No server, no CLI.
import {
  validateDeck,
  LAYOUTS,
  ANIM_NAMES,
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
  irToMarkdown,
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
  motions: MOTION_NAMES as readonly string[],
  colors: COLOR_TOKENS as readonly string[],
  sizes: SIZE_TOKENS as readonly string[],
  aligns: ALIGN_TOKENS as readonly string[],
  weights: WEIGHT_TOKENS as readonly string[],
};

// friendly Chinese labels for the inspector
const MOTION_LABEL: Record<string, string> = {
  none: '无', glow: '呼吸灯（发光）', breathe: '呼吸（缩放）', float: '漂浮', pulse: '闪烁', neon: '霓虹微闪', stress: '强调脉冲',
};
const ANIM_LABEL: Record<string, string> = {
  none: '无', fade: '淡入', rise: '上升淡入', 'fade-up': '上移淡入', pop: '弹出', 'in-left': '从左进', 'in-right': '从右进', 'stagger-list': '逐条浮现', 'counter-up': '数字滚动', morph: '形变',
};
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

// route an imported file by type: contract HTML deck → html mode; json/md → IR mode
function importFile(name: string, text: string): void {
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
  Object.keys(aiInstructions).forEach((k) => delete aiInstructions[k]); aiApplied.clear(); aiSent.clear(); Object.keys(aiBefore).forEach((k) => delete aiBefore[k]); aiCurId = ''; aiDeckInstruction = '';
  const aiBox = $('#aiInstruction') as HTMLTextAreaElement | null; if (aiBox) aiBox.value = '';
  const aiDeckBox = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (aiDeckBox) aiDeckBox.value = '';
  const aiPaste = $('#aiPaste') as HTMLTextAreaElement | null; if (aiPaste) aiPaste.value = '';
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
  // motion CSS is injected into EVERY assembled deck (preview + export) so data-motion
  // effects actually play offline — the imported deck has no such rules of its own.
  return `<!DOCTYPE html>\n<html ${htmlOpenTag()}>\n<head>\n${H.head}${MOTION_CSS}${editCss}\n</head>\n<body class="${H.bodyClass}">\n${H.prelude}\n<div class="deck" id="deck">\n${deckInner}\n</div>\n${H.trailing}\n</body>\n</html>`;
}
// Continuous "motion" effects (data-motion) — ported from the runtime so they play in
// any imported/exported deck. Respect prefers-reduced-motion.
const MOTION_CSS = '<style id="sm-motion">'
  + '#deck .slide [data-motion]{will-change:transform,opacity,filter}'
  + '#deck .slide [data-motion="glow"]{animation:sm-m-glow 3.2s ease-in-out infinite}'
  + '#deck .slide [data-motion="breathe"]{animation:sm-m-breathe 3.6s ease-in-out infinite;transform-origin:center}'
  + '#deck .slide [data-motion="float"]{animation:sm-m-float 3.4s ease-in-out infinite}'
  + '#deck .slide [data-motion="pulse"]{animation:sm-m-pulse 2s ease-in-out infinite}'
  + '#deck .slide [data-motion="neon"]{animation:sm-m-neon 5.5s linear infinite}'
  + '#deck .slide [data-motion="stress"]{animation:sm-m-stress 4.2s ease-in-out infinite;transform-origin:center}'
  + '@keyframes sm-m-glow{0%,100%{filter:drop-shadow(0 0 1px transparent)}50%{filter:drop-shadow(0 0 16px var(--accent,#F4B73E))}}'
  + '@keyframes sm-m-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}'
  + '@keyframes sm-m-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}'
  + '@keyframes sm-m-pulse{0%,100%{opacity:1}50%{opacity:.55}}'
  + '@keyframes sm-m-neon{0%,16%,18%,55%,57%,100%{opacity:1}17%,56%{opacity:.7}80%,82%{opacity:.88}}'
  + '@keyframes sm-m-stress{0%,38%,100%{transform:scale(1)}45%{transform:scale(1.06)}}'
  + '@media(prefers-reduced-motion:reduce){#deck .slide [data-motion]{animation:none!important}}'
  + '</style>';
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
    htmlSelEl = el; el.classList.add('sm-sel'); showHtmlSel(true, el);
  }, true);
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
  c.classList.remove('active', 'sm-reveal', 'sm-sel');
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
  const sel = $('#hSel'), no = $('#hNoSel'); if (!sel || !no) return;
  sel.style.display = on ? '' : 'none'; no.style.display = on ? 'none' : '';
  if (!on || !el) return;
  const cls = String(el.getAttribute('class') || '').split(' ').filter((c) => c && c !== 'sm-sel')[0];
  $('#hSelTag').textContent = el.tagName.toLowerCase() + (cls ? ' .' + cls : '');
  const cs = el.ownerDocument!.defaultView!.getComputedStyle(el);
  (($('#hFs') as HTMLInputElement)).value = el.style.fontSize ? String(parseInt(el.style.fontSize, 10)) : '';
  (($('#hColor') as HTMLInputElement)).value = toHex(el.style.color || cs.color) || '#000000';
  (($('#hWeight') as HTMLSelectElement)).value = el.style.fontWeight || '';
  (($('#hAlign') as HTMLSelectElement)).value = el.style.textAlign || '';
  (($('#hAnim') as HTMLSelectElement)).value = el.getAttribute('data-anim') || 'none';
  (($('#hMotion') as HTMLSelectElement)).value = el.getAttribute('data-motion') || 'none';
  updateAiTarget();
}
function applyHtmlStyle(prop: string, val: string): void {
  if (!htmlSelEl) return; const s = (htmlSelEl as HTMLElement).style;
  if (val) s.setProperty(prop, val); else s.removeProperty(prop);
}
function setHtmlAnim(val: string): void {
  if (!htmlSelEl) return;
  if (val && val !== 'none') htmlSelEl.setAttribute('data-anim', val); else htmlSelEl.removeAttribute('data-anim');
}
function setHtmlMotion(val: string): void {
  if (!htmlSelEl) return;
  if (val && val !== 'none') htmlSelEl.setAttribute('data-motion', val); else htmlSelEl.removeAttribute('data-motion');
}
// high-frequency direct edits on the selected element, straight in the live DOM
// (no AI, no re-render). harvestAll() snapshots the change so export/patch keep it.
function moveHtmlEl(dir: number): void {
  if (!htmlSelEl) return; const el = htmlSelEl as HTMLElement; const p = el.parentElement; if (!p) return;
  if (dir < 0) { const prev = el.previousElementSibling; if (prev) p.insertBefore(el, prev); }
  else { const next = el.nextElementSibling; if (next) p.insertBefore(next, el); }
  harvestAll();
}
function delHtmlEl(): void {
  if (!htmlSelEl) return; const el = htmlSelEl as HTMLElement;
  htmlSelEl = null; el.remove(); showHtmlSel(false); harvestAll();
  toast('已删除该元素');
}
function setHtmlToken(name: string, val: string): void {
  H.overrides[name] = val;
  const d = ($('#preview') as HTMLIFrameElement).contentDocument;
  if (d) d.documentElement.style.setProperty(name, val);
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
3. 把这个 \`${fileBase}.patch.html\` 交回给用户；用户在 Slidesmith 点 **「② 从文件应用」**（或把内容粘进「应用粘贴」）即可把你的修改应用到对应页，其它页不受影响。
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
  renderHtmlEdit(); refreshTasks();
  toast('AI 改好了 ' + applied + ' 页（左侧打勾的页，不满意可「还原本页」）');
}
// revert one slide to the version it had right before AI changed it. The page's
// comment stays, so it goes back to 待发送 (you can edit + re-send).
function revertSlide(id: string): void {
  if (aiBefore[id] === undefined) return;
  const idx = htmlSlides.findIndex((s) => s.id === id); if (idx < 0) return;
  harvestAll(); // keep other slides' current state
  htmlSlides[idx].html = aiBefore[id];
  delete aiBefore[id]; aiApplied.delete(id); aiSent.delete(id);
  htmlGotoAfterRender = idx;
  renderHtmlEdit(); refreshTasks();
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
    + '.slide [data-anim]{opacity:1!important;animation:none!important}}</style>';
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
  // keep the slide list visible in html mode too — it's now the task navigator
  // (per-slide comment badges live on it). The user can still collapse via ☰.
  if (!on) document.body.classList.remove('navcollapsed');
}

let toastT: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string, bad = false): void {
  const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (bad ? ' bad' : '');
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(() => (el.className = 'toast'), 2200);
}

// ======================= bridge: connected mode =======================
function updateBridgeBadge(): void {
  const b = $('#bridgeBadge'); if (b) { b.textContent = bridge.connected ? '● 已连接 Claude' : ''; b.className = 'bridge-badge' + (bridge.connected ? ' on' : ''); }
  updateSendButton();
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
`;

function buildUI(): void {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  document.body.innerHTML = `
<div class="ehead">
  <button id="navtog" class="iconbtn" title="折叠 / 展开页面列表">☰</button>
  <span class="brand">✎ Slidesmith Studio</span>
  <span class="dn" id="deckname">${esc(fileBase)}</span>
  <span id="bridgeBadge" class="bridge-badge" title="与 Claude Code 的连接状态"></span>
  <span class="grow"></span>
  <button id="imp">导入 HTML / deck.json / .md</button>
  <span class="sep"></span>
  <button id="expJson">存 .json</button>
  <button id="expMd">存 .md</button>
  <button id="expPdf">导出 PDF</button>
  <button id="expHtml" class="primary">导出 HTML</button>
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
      <div class="pane">
        <div class="hb-title">🌐 HTML 模式 · 就地编辑</div>
        <h3>主题 / 配色</h3>
        <div class="field" id="hThemeWrap" style="display:none"><label>主题</label><select id="hTheme"></select></div>
        <div class="grid2">
          <div class="field"><label>强调色 accent</label><input id="hAccent" type="color"></div>
          <div class="field"><label>背景 paper</label><input id="hPaper" type="color"></div>
        </div>
        <div class="field"><label>文字 ink</label><input id="hInk" type="color"></div>
        <button id="hTokReset" class="mini">↺ 复原配色</button>

        <h3>选中元素</h3>
        <div class="nosel" id="hNoSel">在预览里<b>点一段文字</b>即可直接改字；选中后可调它的字号 / 颜色 / 动效。</div>
        <div id="hSel" style="display:none">
          <div class="tag" id="hSelTag">—</div>
          <div class="grid2">
            <div class="field"><label>字号(px)</label><input id="hFs" type="number" min="8" placeholder="默认"></div>
            <div class="field"><label>颜色</label><input id="hColor" type="color"></div>
          </div>
          <div class="grid2">
            <div class="field"><label>粗细</label><select id="hWeight"><option value="">默认</option><option>400</option><option>500</option><option>600</option><option>700</option><option>900</option></select></div>
            <div class="field"><label>对齐</label><select id="hAlign"><option value="">默认</option><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></div>
          </div>
          <div class="grid2">
            <div class="field"><label>入场动画（播一次）</label><select id="hAnim"></select></div>
            <div class="field"><label>持续动效（一直循环）</label><select id="hMotion"></select></div>
          </div>
          <div class="oprow"><button id="hElUp" title="上移">↑ 上移</button><button id="hElDown" title="下移">↓ 下移</button><button id="hElDel" class="danger" title="删除这个元素">🗑 删除</button></div>
        </div>

        <h3>视觉自检</h3>
        <div class="oprow"><button id="auditRun">🔍 检查这套 deck（溢出 / 对比度 / 坏图）</button></div>
        <div id="auditOut" class="auditout"></div>

        <h3>✨ 让 AI 改（复杂/模糊的改动）</h3>
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

        <h4 class="sub">手动应用 AI 返回（离线时用）</h4>
        <div class="field"><textarea id="aiPaste" rows="2" placeholder="离线时：把 AI 返回的 &lt;section data-id&gt; 粘到这里…"></textarea></div>
        <div class="oprow"><button id="aiApplyPaste">应用粘贴</button><button id="aiApply">从文件应用</button><button id="aiExportOne">仅导出本页</button></div>
        <input id="aiPatchFile" type="file" accept=".html,.htm,.txt,.md" style="display:none">
        <div class="hint">连上 Claude 时，发送 / 回写全自动；这一块只在离线手动搬文件时才用到。</div>
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
<div class="toast" id="toast"></div>`;

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
  onInput('#hFs', (v) => applyHtmlStyle('font-size', v ? v + 'px' : ''));
  onInput('#hColor', (v) => applyHtmlStyle('color', v));
  onChange('#hWeight', (v) => applyHtmlStyle('font-weight', v));
  onChange('#hAlign', (v) => applyHtmlStyle('text-align', v));
  fillSel('#hAnim', meta.anims, ANIM_LABEL); onChange('#hAnim', (v) => setHtmlAnim(v));
  fillSel('#hMotion', meta.motions, MOTION_LABEL); onChange('#hMotion', (v) => setHtmlMotion(v));
  $('#hElUp').addEventListener('click', () => moveHtmlEl(-1));
  $('#hElDown').addEventListener('click', () => moveHtmlEl(1));
  $('#hElDel').addEventListener('click', delHtmlEl);

  // --- Submit-to-AI: per-page memory + batch export + apply (paste or file) ---
  ($('#aiInstruction') as HTMLTextAreaElement).addEventListener('input', onAiInput);
  ($('#aiDeckInstruction') as HTMLTextAreaElement).addEventListener('input', (e) => { aiDeckInstruction = (e.target as HTMLTextAreaElement).value; refreshAiCount(); });
  $('#aiExportAll').addEventListener('click', submitRequests);
  $('#aiExportOne').addEventListener('click', () => {
    saveAiInstruction(); const r = buildAiRequest(); if (!r) { toast('没有可提交的页', true); return; }
    if (!aiInstructions[r.id]) { toast('先写下这一页想怎么改', true); return; }
    download(r.name, r.content, 'text/markdown'); toast('已导出本页请求：' + r.name);
  });
  $('#aiClearOne').addEventListener('click', () => {
    const box = $('#aiInstruction') as HTMLTextAreaElement; box.value = ''; onAiInput();
  });
  $('#aiRevertOne').addEventListener('click', () => { if (aiCurId) revertSlide(aiCurId); });
  $('#aiApplyPaste').addEventListener('click', () => {
    const t = ($('#aiPaste') as HTMLTextAreaElement).value.trim();
    if (!t) { toast('先把 AI 返回的代码粘进来', true); return; }
    applyAiPatch(t); ($('#aiPaste') as HTMLTextAreaElement).value = '';
  });
  $('#aiApply').addEventListener('click', () => $('#aiPatchFile').click());
  ($('#aiPatchFile') as HTMLInputElement).addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (f) f.text().then(applyAiPatch);
  });
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
  $('#imp').addEventListener('click', () => $('#file').click());
  ($('#file') as HTMLInputElement).addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    f.text().then((t) => importFile(f.name, t));
  });
  $('#expJson').addEventListener('click', () => {
    if (mode === 'html') { toast('HTML 模式下请用「导出 HTML」', true); return; }
    download(fileBase + '.deck.json', JSON.stringify(deck, null, 2), 'application/json');
  });
  $('#expMd').addEventListener('click', () => {
    if (mode === 'html') { toast('HTML 模式下请用「导出 HTML」', true); return; }
    download(fileBase + '.deck.md', irToMarkdown(deck), 'text/markdown');
  });
  $('#expHtml').addEventListener('click', () => {
    if (mode === 'html') { download(fileBase + '.html', exportHtmlDeck(), 'text/html'); toast('已导出编辑后的 HTML'); return; }
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
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragN = 0; document.body.classList.remove('dragging');
    const f = e.dataTransfer?.files?.[0]; if (f) f.text().then((t) => importFile(f.name, t));
  });

  // automation hooks: agents / verification can drive Studio programmatically
  (window as unknown as { __SM_IMPORT__: typeof importFile }).__SM_IMPORT__ = importFile;
  (window as unknown as { __SM_EXPORT_HTML__: () => string }).__SM_EXPORT_HTML__ = () =>
    mode === 'html' ? exportHtmlDeck() : renderDeckHtml(deck);
  (window as unknown as { __SM_AI_REQUEST__: typeof buildAiRequest }).__SM_AI_REQUEST__ = buildAiRequest;
  (window as unknown as { __SM_AI_REQUEST_ALL__: typeof buildAllAiRequests }).__SM_AI_REQUEST_ALL__ = buildAllAiRequests;
  (window as unknown as { __SM_SET_INSTR__: (id: string, t: string) => void }).__SM_SET_INSTR__ = (id, t) => { if (t) { aiInstructions[id] = t; aiApplied.delete(id); } else { delete aiInstructions[id]; } if (mode === 'html') refreshTasks(); };
  (window as unknown as { __SM_APPLY_PATCH__: typeof applyAiPatch }).__SM_APPLY_PATCH__ = applyAiPatch;
  (window as unknown as { __SM_AUDIT__: typeof auditImportedDeck }).__SM_AUDIT__ = auditImportedDeck;
  (window as unknown as { __SM_PDF_HTML__: typeof pdfPrintHtml }).__SM_PDF_HTML__ = pdfPrintHtml;
  // bridge hooks (for automation / headless verification)
  (window as unknown as { __SM_BRIDGE__: () => { connected: boolean } }).__SM_BRIDGE__ = () => ({ connected: bridge.connected });
  (window as unknown as { __SM_SEND_ALL__: () => void }).__SM_SEND_ALL__ = submitRequests;

  // edits from the preview iframe
  window.addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d !== 'object') return;
    if (d.type === 'sm-edit') applyEdit(d.bid, d.field, d.value);
    else if (d.type === 'sm-select') { selBid = d.bid; showBlock(d.bid, d.btype); }
    else if (d.type === 'sm-ready') gotoPreview(cur);
  });

  renderLeft(); refreshSlidePanel(); renderDoc(); reloadPreview();
  updateBridgeBadge(); connectBridge();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
else buildUI();
