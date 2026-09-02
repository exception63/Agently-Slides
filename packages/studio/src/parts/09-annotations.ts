// ================= slides 上的元素批注 =================
//
// **和讲稿批注同一个形状**：给 AI 一段原文当锚点，而不是坐标或选择器。
// 理由很实在——每一页都可能被 AI 整页重写，坐标当场失效、选择器会被改没；
// 而「原文开头那几个字」是最经得起重写的东西。tag + 本页第几个 只作兜底。
//
// 这些批注**只活在编辑态**：既不写进 htmlSlides（所以导出/保存天然干净），
// 角标也是画在预览 iframe 里一层独立的浮层上，放映时用 CSS 整层藏掉。
interface SlideAnnSel { tag: string; nth: number; cls: string; snippet: string }
interface SlideAnn { id: string; slideId: string; page: number; sel: SlideAnnSel; note: string }
let slideAnns: SlideAnn[] = [];
let slideAnnSeq = 0;
/** 批注小窗当前对着的那个元素（窗口一开，预览里的选中随时可能被点掉，所以要记下来） */
let annPick: { slideId: string; page: number; sel: SlideAnnSel } | null = null;
let annBadgeRaf = 0;

function slideAnnsOf(slideId: string): SlideAnn[] { return slideAnns.filter((a) => a.slideId === slideId); }
function previewDoc(): Document | null { return ($('#preview') as HTMLIFrameElement | null)?.contentDocument || null; }
function annSlideEl(d: Document, slideId: string): HTMLElement | null {
  const idx = htmlSlides.findIndex((s) => s.id === slideId); if (idx < 0) return null;
  return (Array.prototype.slice.call(d.querySelectorAll('#deck .slide'))[idx] as HTMLElement) || null;
}
/** 元素 → 锚点。snippet＝点中那一刻抄下的前 40 字，是给 AI 认位置的主锚点。 */
function annSelOf(el: Element): { slideId: string; page: number; sel: SlideAnnSel } | null {
  const slide = el.closest('#deck .slide'); if (!slide) return null;
  const d = slide.ownerDocument; if (!d) return null;
  const page = Array.prototype.slice.call(d.querySelectorAll('#deck .slide')).indexOf(slide) + 1;
  const slideId = htmlSlides[page - 1]?.id || slide.getAttribute('data-id') || '';
  if (!slideId) return null;
  const tag = el.tagName.toLowerCase();
  const same = Array.prototype.slice.call(slide.querySelectorAll(tag)) as Element[];
  let snippet = (el.textContent || '').replace(/\s+/g, ' ').trim();
  // 图片 / 纯图形没有文字 —— 退而用 alt / aria-label，再没有就只剩 tag+序号
  if (!snippet) snippet = (el.getAttribute('alt') || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const cls = String(el.getAttribute('class') || '').split(/\s+/).filter((c) => c && c.indexOf('sm-') !== 0).join(' ');
  return { slideId, page, sel: { tag, nth: same.indexOf(el) + 1, cls, snippet: snippet.length > 40 ? snippet.slice(0, 40) : snippet } };
}
/** 反过来：按批注在预览里找回那个元素。**原文优先** —— 批注之后用户又手动挪过 DOM 的话，nth 会漂。 */
function annElement(d: Document, a: SlideAnn): HTMLElement | null {
  const slide = annSlideEl(d, a.slideId); if (!slide) return null;
  const same = Array.prototype.slice.call(slide.querySelectorAll(a.sel.tag)) as HTMLElement[];
  if (a.sel.snippet) {
    const hit = same.filter((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().indexOf(a.sel.snippet) === 0)[0];
    if (hit) return hit;
  }
  return same[a.sel.nth - 1] || null;
}

// ---- 预览里的角标层 ----
function ensureAnnStyle(d: Document): void {
  if (d.getElementById('sm-ann-css')) return;
  const st = d.createElement('style'); st.id = 'sm-ann-css';
  st.textContent = '.sm-annlayer{position:fixed;inset:0;z-index:2147482000;pointer-events:none}'
    + '.sm-annring{position:fixed;border:1.5px dashed rgba(224,144,42,.95);border-radius:4px;box-sizing:border-box;pointer-events:none}'
    + '.sm-annbadge{position:fixed;min-width:19px;height:19px;padding:0 5px;box-sizing:border-box;border:0;border-radius:10px;'
    + 'background:#e0902a;color:#fff;font:700 11px/19px system-ui,-apple-system,"PingFang SC",sans-serif;text-align:center;'
    + 'pointer-events:auto;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.35);font-family:inherit}';
  d.head.appendChild(st);
  // 角标只属于编辑态。导出天然干净（这一层不在 htmlSlides 里），**放映也不能出现** ——
  // 投给全场看的画面上不该挂着橙色小圆点。用 CSS 不用 JS 监听：进放映的路子有好几条
  // （deck 的播放按钮、快捷键、系统全屏、演讲者视图），挨个监听迟早漏一条。
  // `:fullscreen` 必须**单独成条** —— 浏览器不认这个伪类会把整条规则丢掉，
  // 和 body.present 那几个写在一起就会被一起带走。
  const hide = d.createElement('style'); hide.id = 'sm-ann-hide-css';
  hide.textContent = 'body.present .sm-annlayer,body.fullscreen .sm-annlayer,body.presenter-mode .sm-annlayer{display:none!important}'
    + ':fullscreen .sm-annlayer{display:none!important}'
    + ':-webkit-full-screen .sm-annlayer{display:none!important}';
  d.head.appendChild(hide);
}
/** 滚动一次会连发几十个事件 —— 合并到下一帧再画 */
function scheduleAnnBadges(): void {
  if (annBadgeRaf) return;
  annBadgeRaf = requestAnimationFrame(() => { annBadgeRaf = 0; renderAnnBadges(); });
}
function renderAnnBadges(): void {
  const d = previewDoc(); if (!d || !d.body) return;
  let layer = d.getElementById('sm-annlayer') as HTMLElement | null;
  if (!slideAnns.length) { if (layer) layer.remove(); return; }
  ensureAnnStyle(d);
  if (!layer) { layer = d.createElement('div'); layer.id = 'sm-annlayer'; layer.className = 'sm-annlayer'; d.body.appendChild(layer); }
  layer.innerHTML = '';
  const vh = d.defaultView?.innerHeight || 0;
  // 同一个元素上可以挂好几条批注 —— 共用一个角标，点开看全部
  const groups: { el: HTMLElement; idx: number; anns: SlideAnn[] }[] = [];
  slideAnns.forEach((a, i) => {
    const el = annElement(d, a); if (!el) return;
    const g = groups.filter((x) => x.el === el)[0];
    if (g) g.anns.push(a); else groups.push({ el, idx: i + 1, anns: [a] });
  });
  groups.forEach((g) => {
    const r = g.el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (r.bottom < -160 || r.top > vh + 160) return;   // 视口外的不画（44 页的 deck 里绝大多数都在外面）
    const ring = d.createElement('div'); ring.className = 'sm-annring';
    ring.style.left = (r.left - 3) + 'px'; ring.style.top = (r.top - 3) + 'px';
    ring.style.width = (r.width + 6) + 'px'; ring.style.height = (r.height + 6) + 'px';
    layer!.appendChild(ring);
    const b = d.createElement('button'); b.type = 'button'; b.className = 'sm-annbadge';
    b.textContent = g.anns.length > 1 ? `${g.idx}+` : String(g.idx);
    b.title = g.anns.map((a) => a.note).join('\n');
    b.style.left = (r.right - 10) + 'px'; b.style.top = (r.top - 9) + 'px';
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openAnnFor(g.el); });
    layer!.appendChild(b);
  });
}

// ---- 批注小窗 ----
function openAnnFor(el: Element): void {
  const info = annSelOf(el);
  if (!info) { toast('请先在预览里点中幻灯片上的一个元素', true); return; }
  annPick = info;
  const m = $('#annModal'); if (m) (m as HTMLElement).style.display = 'flex';
  const w = $('#annWhere');
  if (w) w.textContent = `第 ${info.page} 页 · <${info.sel.tag}>（本页第 ${info.sel.nth} 个）` + (info.sel.cls ? ` · class="${info.sel.cls}"` : '');
  const s = $('#annSnip');
  if (s) s.textContent = info.sel.snippet ? `「${info.sel.snippet}」` : '（这个元素没有文字，AI 按 标签 + 本页第几个 + 批注内容 找它）';
  const t = $('#annText') as HTMLTextAreaElement | null; if (t) { t.value = ''; setTimeout(() => t.focus(), 30); }
  renderAnnList();
}
function closeAnnModal(): void { const m = $('#annModal'); if (m) (m as HTMLElement).style.display = 'none'; annPick = null; }
function addSlideAnn(): void {
  const t = $('#annText') as HTMLTextAreaElement | null;
  const txt = (t?.value || '').trim();
  if (!annPick) { toast('先在预览里点中一个元素', true); return; }
  if (!txt) { toast('写一句这个元素要怎么改', true); return; }
  slideAnns.push({ id: 'sann-' + (++slideAnnSeq), slideId: annPick.slideId, page: annPick.page, sel: annPick.sel, note: txt });
  if (t) t.value = '';
  refreshTasks(); renderAnnBadges(); renderAnnList();
  toast(`已加批注：第 ${annPick.page} 页 · 元素 —— 和其余待办一起，在「AI」tab 一次发送`);
}
function removeSlideAnn(id: string): void {
  slideAnns = slideAnns.filter((a) => a.id !== id);
  refreshTasks(); renderAnnBadges(); renderAnnList();
}
function renderAnnList(): void {
  const box = $('#annList'); if (!box) return;
  const mine = annPick ? slideAnnsOf(annPick.slideId) : [];
  const cnt = $('#annCount'); if (cnt) cnt.textContent = mine.length ? `本页 ${mine.length} 条` : '';
  const foot = $('#annFoot');
  if (foot) {
    const instr = annPick && aiInstructions[annPick.slideId] && !aiApplied.has(annPick.slideId);
    foot.innerHTML = slideAnns.length
      ? `全 deck 共 <b>${slideAnns.length}</b> 条元素批注，都在「AI」tab 的待办里，和改字 / 配图 / 导入图<b>一次发送</b>。`
        + (instr ? '　本页另有一条「整页修改意见」，两者会一起交给 AI。' : '')
      : '';
  }
  if (!mine.length) {
    box.innerHTML = '<div class="qempty">这一页还没有元素批注。写一句上面的话再点「加批注」即可。<br><br>'
      + '批注挂在<b>元素的原文</b>上（不是坐标），跟着那句话走；汇总进「AI」tab 的待办，和其余待办一次发给 Claude。</div>';
    return;
  }
  box.innerHTML = '';
  mine.forEach((a) => {
    const same = !!annPick && a.sel.tag === annPick.sel.tag && a.sel.nth === annPick.sel.nth;
    const row = document.createElement('div'); row.className = 'annrow' + (same ? ' cur' : '');
    row.innerHTML = `<div class="annhead"><span class="todochip ann">${same ? '本元素' : '本页'}</span>`
      + `<code>&lt;${esc(a.sel.tag)}&gt; 第 ${a.sel.nth} 个</code><button class="todo-del" title="删掉这条批注" aria-label="移除">✕</button></div>`
      + `<div class="annquote">${esc(a.sel.snippet ? '「' + a.sel.snippet + '」' : '（无文字元素）')}</div>`
      + `<div class="annnote">${esc(a.note)}</div>`;
    row.querySelector('.todo-del')!.addEventListener('click', () => removeSlideAnn(a.id));
    row.querySelector('.annquote')!.addEventListener('click', () => {
      const d = previewDoc(); const el = d ? annElement(d, a) : null;
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => renderAnnBadges(), 400); }
    });
    box.appendChild(row);
  });
}
/** 给 Claude 的那一段：认位置的规矩（只在有元素批注时随请求发一次） */
function aiSlideAnnSpec(): string {
  return `## 元素批注规则（凡带「元素批注」小节的页：认准是哪个元素，只改它）
用户在预览里点中了页面上的**某一个元素**，写下一条批注。定位那个元素时：
1. **以「原文开头」为主锚点** —— 那是点中那一刻抄下来的前 40 字，最经得起改写。
2. \`<tag> 本页第 N 个\` 和 \`class\` 是**兜底**：用户加完批注又手改过那句话时才靠它们。
3. 两者对不上，以**原文**为准；实在都对不上，按批注的意思在该页挑语义上最贴近的那个元素。
4. **只动被点名的元素**，别顺手重写整页；同一页若另有「修改要求」，那条才是整页级的。
改完照常返回该页整个 \`<section data-id>\`（元素批注和改字 / 配图共用同一次输出）。
`;
}

