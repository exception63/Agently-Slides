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
    renderNoteAnns(); refreshNotesFoot();
    return;
  }
  if (empty) (empty as HTMLElement).style.display = 'none';
  const ub = $('#notesUndoBtn'); if (ub) (ub as HTMLElement).style.display = notesUndo ? '' : 'none';
  refreshNotesFoot();
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

