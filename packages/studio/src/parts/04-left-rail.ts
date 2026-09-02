// ---------------- rendering ----------------
function previewHtml(): string {
  return insertBeforeBodyEnd(renderDeckHtml(deck), `<script>${BRIDGE}</script>`);
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
      // 元素批注也是「这一页有活挂着」，和改字同一个 ● —— 否则批注完往回翻，左栏看不出哪几页动过
      const nAnn = slideAnnsOf(s.id).length;
      const badge = aiApplied.has(s.id) ? '<span class="sbadge done" title="AI 已修改本页">✓</span>'
        : aiSent.has(s.id) ? '<span class="sbadge sent" title="已发送，等待 Claude 修改">●</span>'
        : (aiInstructions[s.id] || nAnn) ? `<span class="sbadge todo" title="${aiInstructions[s.id] ? '有待发送给 AI 的修改说明' : ''}${aiInstructions[s.id] && nAnn ? ' · ' : ''}${nAnn ? nAnn + ' 条元素批注待发送' : ''}">●</span>` : '';
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

// ---- 左栏「换装」：21 套皮做成可视化卡片，点一下整份 deck 换风格（就地换肤，瞬时、不黑） ----
function matchCssVar(css: string, nm: string): string {
  const m = new RegExp('--' + nm + '\\s*:\\s*([^;]+);').exec(css); return m ? m[1].trim() : '';
}
// 取第一个能解析成「具体颜色」的变量——跟随 var(--x) 跳转（皮肤常 --accent: var(--vermilion)）
function pickCssVar(css: string, names: string[]): string {
  for (const nm of names) {
    let v = matchCssVar(css, nm); let hops = 0; let ref: RegExpExecArray | null;
    while (v && hops < 4 && (ref = /^var\(\s*--([a-z0-9-]+)\s*\)/i.exec(v))) { v = matchCssVar(css, ref[1]); hops++; }
    if (v && !/^var\(/i.test(v)) return v;
  }
  return '';
}
function skinSwatch(b: { css: string; dark: boolean }): { bg: string; ink: string; accent: string } {
  const css = b.css || '';
  return {
    bg: pickCssVar(css, ['paper', 'bg', 'background', 'base', 'surface']) || (b.dark ? '#16181e' : '#ffffff'),
    ink: pickCssVar(css, ['ink', 'text', 'fg', 'ink-1', 'foreground']) || (b.dark ? '#f5f6f8' : '#1c1c1f'),
    accent: pickCssVar(css, ['accent', 'accent-ui', 'vermilion', 'gold', 'navy', 'green', 'accent-2', 'primary']) || '#B5402A',
  };
}
function skinCardHtml(name: string, label: string, tag: string, sw: { bg: string; ink: string; accent: string }, active: boolean): string {
  return `<button class="skincard${active ? ' on' : ''}" data-skin="${esc(name)}" title="${esc(label)}">`
    + `<span class="skinprev" style="background:${sw.bg}">`
    + `<span class="skinline" style="background:${sw.ink}"></span>`
    + `<span class="skinline short" style="background:${sw.ink}"></span>`
    + `<span class="skinbar" style="background:${sw.accent}"></span></span>`
    + `<span class="skinmeta"><span class="skinname">${esc(label)}</span><span class="skintag">${esc(tag)}</span></span></button>`;
}
function renderSkinGallery(): void {
  const box = document.getElementById('skinGallery'); if (!box) return;
  if (mode !== 'html') { box.innerHTML = '<div class="lpane-soon">换装作用于导入的 HTML deck。<br>先导入一个 HTML，再来这里一键换风格。</div>'; return; }
  let html = skinCardHtml('', '保持原样', '原始', { bg: '#ffffff', ink: '#1c1c1f', accent: '#c9c9cc' }, !H.skin);
  SKIN_ORDER.forEach((n) => { const b = SKINS[n]; if (b) html += skinCardHtml(n, b.label || n, b.dark ? '暗' : '浅', skinSwatch(b), H.skin === n); });
  box.innerHTML = '<div class="skingal">' + html + '</div>';
  box.querySelectorAll('.skincard').forEach((el) => el.addEventListener('click', () => applySkinFromGallery((el as HTMLElement).dataset.skin || '')));
}
function applySkinFromGallery(n: string): void {
  if (mode !== 'html' || n === H.skin) return;
  const tf = tweakFactor('--t-body'), pf = tweakFactor('--pad-x'); // 旧皮基准下的当前缩放比例
  harvestAll(); pushHistory('skin'); H.skin = n; applySkinLive();
  reapplyTweaksForSkin(tf, pf); // 按新皮基准重算字号/留白，保持比例
  refreshHtmlInspector(); markDirty();
  const sel = $('#hSkin') as HTMLSelectElement | null; if (sel) sel.value = n;
  renderSkinGallery();
  toast(n ? '已换装：' + (SKINS[n] ? SKINS[n].label || n : n) : '已恢复原始皮肤');
}
// ---- 左栏「插入」：HTML 模式下真正可用的添加动作收成一个中枢 ----
function renderInsertPane(): void {
  const box = document.getElementById('insertPane'); if (!box) return;
  if (mode !== 'html') { box.innerHTML = '<div class="lpane-soon">插入作用于导入的 HTML deck。<br>先导入一个 HTML 再用。</div>'; return; }
  box.innerHTML = '<div class="insgrid">'
    + '<button class="inscard" data-act="image"><b>插入图片</b><span>从本地选图，插入到当前页</span></button>'
    + '<button class="inscard" data-act="ai"><b>AI 配图 / 图表</b><span>转到右栏「AI」，描述要生成的配图或图表</span></button>'
    + `<button class="inscard inscard-live" data-act="live"><b>现场互动 · 扫码提问</b><span>${liveRoomOf() ? '已装：房间 ' + liveRoomOf() + ' · 看在线 / 关提问 / 清屏' : '插一页学生扫码提问、实时上大屏'}</span></button>`
    + '</div><div id="liveCard" class="livecard" hidden></div>'
    + '<div class="lpane-soon" style="text-align:left;padding:10px 4px">更多插入项（新页 / 引用 / 表格）会随 HTML 模式增删页能力一起补上。</div>';
  box.querySelectorAll('.inscard').forEach((el) => el.addEventListener('click', () => {
    const act = (el as HTMLElement).dataset.act;
    if (act === 'image') (document.getElementById('hInsertImg') as HTMLElement | null)?.click();
    else if (act === 'ai') { (document.querySelector('.htab[data-htab="ai"]') as HTMLElement | null)?.click(); const d = document.getElementById('aimoreIll') as HTMLDetailsElement | null; if (d) d.open = true; }
    else if (act === 'live') openLiveSetup();
    else if (act === 'live-remove') void liveRemove();
  }));
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

