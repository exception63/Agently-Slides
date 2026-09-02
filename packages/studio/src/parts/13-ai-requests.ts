// ---- 已有图片在请求里换成占位符 ----
// 请求体带的是「该页当前 HTML」。暂存盘的新图早就是占位符了，可页里**已经内联的** base64 图
// 一直是原样带走的：一页 180 KB 的图 ≈ 6 万 token，AI 改完还得原样吐回来，双倍。
// 而 AI 本来就看不见 base64（它只是一串字符），剥掉毫无损失。
// 做法：发送前把 data:image URL 换成 sm-img://<n>，Studio 侧留一张表；回写时按表还原。
// 表跨请求累积（AI 回写的页可能引用上一次请求里的 id），只随页面刷新清空。
const imgVault = new Map<string, string>();
let imgVaultSeq = 0;
function vaultPut(dataUrl: string): string {
  for (const [k, v] of imgVault) if (v === dataUrl) return k; // 同一张图多处引用 → 同一个 id
  const k = `sm-img://${++imgVaultSeq}`; imgVault.set(k, dataUrl); return k;
}
/** 把一段 HTML 里的 data:image 换成占位符（src / href / xlink:href / CSS url() 都管）。 */
function slimHtmlForAi(html: string): string {
  return html
    .replace(/((?:src|href|xlink:href)=["'])(data:image\/[^"']+)(["'])/g, (_m, a, d, b) => a + vaultPut(d) + b)
    .replace(/url\((['"]?)(data:image\/[^)'"]+)\1\)/g, (_m, q, d) => `url(${q}${vaultPut(d)}${q})`);
}
/** AI 回写的页：把占位符还原成真实图片。表里没有的占位符（AI 手误）删掉 src，别留一个坏链接。 */
function restoreVaultImages(root: Element): number {
  let n = 0;
  root.querySelectorAll('[src^="sm-img://"],[href^="sm-img://"]').forEach((el) => {
    for (const attr of ['src', 'href', 'xlink:href']) {
      const v = el.getAttribute(attr); if (!v || !v.startsWith('sm-img://')) continue;
      const real = imgVault.get(v);
      if (real) { el.setAttribute(attr, real); n++; } else el.removeAttribute(attr);
    }
  });
  root.querySelectorAll('[style*="sm-img://"]').forEach((el) => {
    const st = el.getAttribute('style') || '';
    el.setAttribute('style', st.replace(/sm-img:\/\/\d+/g, (k) => imgVault.get(k) || 'none'));
    n++;
  });
  return n;
}
const aiImgVaultRule = '页里 `src="sm-img://N"` 的图片是**已有图片的占位符**（真图 Studio 会自动还原）：保留原样、可以移动或调大小，**别改它的 src、别删成空、别自己补 base64**。';

// a per-page block: optional 修改要求 + optional 配图(矢量/照片) + optional 待插入图片 + current HTML
function aiTaskBlock(s: HtmlSlide, i: number, o: { instr?: string; gen?: { type: 'vector' | 'chart' | 'photo'; hint: string }; trayImgs?: TrayImage[]; anns?: SlideAnn[] }): string {
  const trayImgs = o.trayImgs || [];
  const anns = o.anns || [];
  let b = `### 第 ${i + 1} 页 · ${s.title}  (data-id: \`${s.id}\`)\n`;
  if (o.instr) b += `**修改要求：** ${o.instr}\n`;
  if (anns.length) b += `**元素批注（针对本页里的具体元素，逐条照办）：**\n`
    + anns.map((a) => `- 元素：\`<${a.sel.tag}>\`（本页第 ${a.sel.nth} 个${a.sel.cls ? ` · class="${a.sel.cls}"` : ''}）`
      + (a.sel.snippet ? ` · 原文开头「${a.sel.snippet}」` : ' · 无文字')
      + `\n  批注：${a.note}`).join('\n') + '\n';
  if (o.gen?.type === 'vector') b += `**配图（矢量 SVG · 你直接画内联 <svg>）：** ${o.gen.hint || '按本页内容画一张贴合的示意图'}\n`;
  if (o.gen?.type === 'chart') { const h = o.gen.hint || '按本页内容选图型并作图'; b += h.includes('\n') ? `**图表（按以下数据/描述画内联 <svg> 图表）：**\n${FENCE}\n${h}\n${FENCE}\n` : `**图表（按数据/描述画内联 <svg> 图表）：** ${h}\n`; }
  if (o.gen?.type === 'photo') b += `**配图（照片级 · 用 codex 生成→存图片库→内联）：** ${o.gen.hint || '按本页内容生成一张合适的照片'}\n`;
  if (trayImgs.length) b += `**在本页插入这些图片（占位 <img data-img-id>，勿写 src/base64）：**\n${aiImageLines(trayImgs)}\n`;
  const slim = slimHtmlForAi(s.html);
  if (slim !== s.html) b += `（${aiImgVaultRule}）\n`;
  b += `\n当前 HTML（在此基础上改写/插入/配图）：\n${FENCE}html\n${slim}\n${FENCE}\n`;
  return b;
}
// THE unified request: deck-ask + every page that has a 改字 / 配图(矢量·照片) / 待插入图片.
// One request, one send — Claude does text edits, draws SVGs, runs codex, places images.
function buildAllRequest(): { name: string; count: number; content: string; images: { id: string; name: string; dataUrl: string }[] } | null {
  if (mode !== 'html') return null;
  harvestAll(); saveAiInstruction();
  const hasDeck = !!aiDeckInstruction.trim();
  const pages = htmlSlides.map((s, i) => ({ s, i })).filter(({ s }) =>
    (aiInstructions[s.id] && !aiApplied.has(s.id)) || genQueue[s.id] || trayImagesForSlide(s.id).length || slideAnnsOf(s.id).length);
  const hasNoteAnns = noteAnns.length > 0;
  const hasSlideAnns = slideAnns.length > 0;
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
  if (hasSlideAnns) body += aiSlideAnnSpec();
  if (hasNoteAnns) body += aiNotesBlock();
  body += (pages.length ? '\n## 需要处理的页\n' : '') + pages.map(({ s, i }) => aiTaskBlock(s, i, {
    instr: (aiInstructions[s.id] && !aiApplied.has(s.id)) ? aiInstructions[s.id] : '',
    gen: genQueue[s.id],
    trayImgs: trayImagesForSlide(s.id),
    anns: slideAnnsOf(s.id),
  })).join('\n') + (pages.length ? aiOutputSpec() : '');
  // count 要和待办条目数对得上（用户在按钮上看到几项，桥那边就该收到几项）
  return { name: `${fileBase}.ai-tasks.md`, count: todoItems().length, content: body, images: trayPayload() };
}
function submitAll(): boolean {
  const r = buildAllRequest();
  if (!r) { toast('待办清单是空的：写修改意见、加配图、或导入图片', true); return false; }
  const sentNow = htmlSlides.filter((s) => aiInstructions[s.id] && !aiApplied.has(s.id)).map((s) => s.id);
  if (!sendOverBridge(r, `已一键发送 ${r.count} 项给 Claude`)) return false;
  sentNow.forEach((id) => aiSent.add(id)); // 改字 → 已发送（结果回灌后变 已改）
  Object.keys(genQueue).forEach((k) => delete genQueue[k]); // 配图请求一次性，发出后清空（成品出现在页面 + 图片库）
  if (aiDeckInstruction.trim()) { aiDeckInstruction = ''; const box = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (box) box.value = ''; }
  refreshTasks();
  return true;
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
    // 元素批注和「整页修改意见」并列（一页可以两者同时有），走同一次发送
    slideAnnsOf(s.id).forEach((a) => items.push({
      label: '批注 · 元素', desc: (a.sel.snippet ? `「${a.sel.snippet}」→ ` : `<${a.sel.tag}> → `) + a.note,
      page: i + 1, cls: 'ann', remove: () => removeSlideAnn(a.id),
    }));
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
  if (!items.length) box.innerHTML = '<div class="qempty">待办清单为空。写「本页修改意见」、在「本页 · 配图」加配图、导入图片、在预览里点中元素按 💬 加批注、或在讲稿里加批注，都会出现在这里。</div>';
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
  refreshTodoBadge(items);
  refreshNotesFoot(items);
}
/** 待办按类别数一遍，给「一次发的到底是什么」一个说得清的句子 */
function todoSummary(items = todoItems()): string {
  const order: [string, string][] = [['deck', '整份要求'], ['edit', '改字'], ['vec', '配图·矢量'], ['chart', '配图·图表'], ['photo', '配图·照片'], ['tray', '导入图'], ['ann', '元素批注'], ['note', '讲稿批注']];
  const c: Record<string, number> = {};
  items.forEach((it) => { c[it.cls] = (c[it.cls] || 0) + 1; });
  return order.filter(([k]) => c[k]).map(([k, name]) => `${name} ${c[k]}`).join(' · ');
}
/** AI tab 上的数字角标 —— 待办数原先只在 AI tab 里面看得到，人在别的 tab 就完全不知道有东西挂着 */
function refreshTodoBadge(items = todoItems()): void {
  const el = $('#aiTabNum') as HTMLElement | null; if (!el) return;
  // 数字为 0 时连字都不留：角标就在 tab 文本里，留个 "0" 会让 tab 的 textContent 变成「AI0」
  el.textContent = items.length ? String(items.length) : '';
  el.hidden = items.length === 0;
  el.title = items.length ? `待办 ${items.length} 项：${todoSummary(items)}` : '';
  if (document.body.classList.contains('panelcollapsed')) renderRailStrip();
}
/** 讲稿弹窗底栏：说清这一按发出去的是什么 */
function refreshNotesFoot(items = todoItems()): void {
  const txt = $('#notesFootTxt'); const btn = $('#notesSendAll') as HTMLButtonElement | null;
  if (!txt || !btn) return;
  btn.disabled = items.length === 0;
  btn.textContent = items.length ? `一键发送给 AI · ${items.length} 项` : '一键发送给 AI';
  if (!items.length) { txt.innerHTML = '待办是空的 —— 在左边讲稿里划一段文字，会浮出「加批注」。'; return; }
  const mine = items.filter((it) => it.cls === 'note').length;
  const rest = items.length - mine;
  txt.innerHTML = `本次发送 <b>${items.length}</b> 项：${esc(todoSummary(items))}`
    + (rest ? '　—— 讲稿批注会<b>连同其余待办一起</b>交给 AI，不是单独发。' : '');
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

