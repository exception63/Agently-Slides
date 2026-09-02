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
    if (!tg || tg.closest('#deck') || tg.closest('.sm-gizmo') || tg.closest('.sm-annlayer')) return;
    deselectHtml();
  }, true);
  // keep the move/resize gizmo glued to the element while the deck scrolls or rescales
  // (the gizmo is position:fixed, so without this it detaches and floats on screen)
  try {
    const win = d.defaultView as Window;
    win.addEventListener('scroll', () => { positionGizmo(); scheduleAnnBadges(); }, true); // capture: also catch scroll on inner scrollers
    win.addEventListener('resize', () => { positionGizmo(); scheduleAnnBadges(); });
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
    [60, 250, 700, 1500].forEach((ms) => setTimeout(() => { refitPreview(); refreshDeckTokenInputs(); renderAnnBadges(); }, ms));
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
