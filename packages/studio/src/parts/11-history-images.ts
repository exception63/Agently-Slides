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
