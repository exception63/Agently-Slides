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
/** 折叠区自动展开：里面有东西就别折着（整份 deck 写了字、暂存盘有图、本页排了配图）。 */
function refreshAiMore(): void {
  const open = (id: string, on: boolean) => { const d = document.getElementById(id) as HTMLDetailsElement | null; if (d && on && !d.open) d.open = true; };
  open('aimoreDeck', !!aiDeckInstruction.trim());
  open('aimoreTray', trayImages.length > 0);
  const cs = htmlSlides[currentHtmlSlideIndex()]; open('aimoreIll', !!(cs && genQueue[cs.id]));
}
function refreshTasks(): void {
  refreshAiMore(); renderLeft(); renderTodo(); refreshSentBanner(); refreshNotesStatus(); }
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
function applyAiPatch(text: string, preview = false, summary = ''): void {
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
    if (idx >= 0 && htmlSlides[idx]) { if (id) { sec.setAttribute('data-id', id); if (aiBefore[id] === undefined) aiBefore[id] = htmlSlides[idx].html; aiApplied.add(id); aiSent.delete(id); ids.push(id); if (preview) proposed.add(id); } imgs += backfillTrayImages(sec); restoreVaultImages(sec); htmlSlides[idx].html = sec.outerHTML; applied++; if (firstIdx < 0) firstIdx = idx; }
  });
  if (!applied) { toast('补丁的 data-id 不匹配任何页', true); return; }
  // 改过的那几页的元素批注算办完了，从待办里撤掉（和「改字」→ ✓ 已改 同一个道理）
  if (ids.length) slideAnns = slideAnns.filter((a) => ids.indexOf(a.slideId) < 0);
  if (imgs) renderTray(); // mark just-placed tray images
  htmlGotoAfterRender = firstIdx; // stay on the patched slide after re-render
  renderHtmlEdit(); refreshTasks(); markDirty();
  pushChangeLog(ids, summary);
  const sum = summary ? '：' + summary : '';
  if (preview) { refreshProposalBar(); toast('AI 提议修改 ' + applied + ' 页' + sum + '，请在顶部「保留 / 还原」'); }
  else toast('AI 已修改 ' + applied + ' 页' + sum + '（左侧带勾标记，可「还原本页」）');
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
    // 角标挂在 tab 里面，直接 textContent 会连数字一起抄进来（「AI3」）——所以有 .tlab 就认它
    const label = ((t.querySelector('.tlab') as HTMLElement | null)?.textContent || t.textContent || '').trim();
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'striptab' + (t.classList.contains('active') ? ' active' : '');
    b.innerHTML = RAIL_ICONS[t.dataset.icon || ''] || '<span class="stlabel">' + esc(label.slice(0, 1)) + '</span>';
    b.title = t.getAttribute('title') || label;   // 折叠时名字靠 tooltip 给
    b.setAttribute('aria-label', label);
    // 面板折起来时更要看得见「有 N 项待办挂着」——不然连那颗数字都被收走了
    const num = t.querySelector('.tabnum') as HTMLElement | null;
    if (num && !num.hidden) { const s = document.createElement('span'); s.className = 'stripnum'; s.textContent = num.textContent || ''; b.appendChild(s); }
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

