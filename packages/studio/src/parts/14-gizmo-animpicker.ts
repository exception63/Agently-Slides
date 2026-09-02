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
    + '.sm-gizmo .gbar{position:absolute;left:50%;top:-32px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:none}'
    + '.sm-gizmo .gbar > *{pointer-events:auto;min-width:28px;height:24px;padding:0 6px;border:0;border-radius:6px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.3);font-family:inherit;line-height:1}'
    + '.sm-gizmo .mv{background:#3a86ff;cursor:move}'
    + '.sm-gizmo .ann{background:#e0902a;cursor:pointer;font-size:13px}';
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
  // 三个把手：移动 ✥ / 加 AI 批注 💬 / 缩放 ◢。批注这颗和另外两颗并排，
  // 是因为「点中一个元素」之后人最想干的三件事就是这三件。
  g.innerHTML = '<div class="gbar"><div class="mv" title="拖动移动本元素">✥</div>'
    + '<button class="ann" type="button" title="给这个元素加一条 AI 批注（进「AI」tab 的待办，一次发送）">💬</button></div>'
    + '<div class="h se" title="拖动改变大小"></div>';
  d.body.appendChild(g); gizmoEl = g; positionGizmo();
  (g.querySelector('.mv') as HTMLElement).addEventListener('mousedown', (e) => startGizmoDrag(e as MouseEvent, 'move'));
  (g.querySelector('.se') as HTMLElement).addEventListener('mousedown', (e) => startGizmoDrag(e as MouseEvent, 'resize'));
  const ab = g.querySelector('.ann') as HTMLElement;
  ab.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  ab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (htmlSelEl) openAnnFor(htmlSelEl); });
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
  const skinNow = $('#hSkinNow'); if (skinNow) skinNow.textContent = H.skin ? ((SKINS[H.skin] && SKINS[H.skin].label) || H.skin) : '保持原样（不换皮）';
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
