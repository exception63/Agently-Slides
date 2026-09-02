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
