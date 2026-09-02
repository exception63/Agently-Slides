// ======================= Studio 顶栏：放映 / 演讲者 =======================
// 放映要用户手势才能进全屏；手势在 Studio 这个文档里，所以由 Studio 对 iframe 调 requestFullscreen，
// 再把 deck 的 body 切进 present 态（引擎自己的 fullscreenchange 监听在 iframe 里，看不见父文档的全屏）。
function studioPresent(): void {
  const f = $('#preview') as HTMLIFrameElement | null; const d = f?.contentDocument; const w = f?.contentWindow as (Window & { deckAPI?: { setActive?: (i: number) => void; idx?: number } }) | null;
  if (!f || !d || mode !== 'html') { toast('先导入一个 HTML deck', true); return; }
  const on = () => { d.body.classList.add('present'); try { w?.deckAPI?.setActive?.(w.deckAPI.idx ?? cur); } catch { /* 非引擎 deck */ } w?.focus(); };
  const off = () => { d.body.classList.remove('present'); };
  const req = (f as HTMLIFrameElement & { webkitRequestFullscreen?: () => Promise<void> }).requestFullscreen || (f as HTMLIFrameElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
  if (!req) { on(); toast('浏览器不支持全屏，已切到放映排版；Esc 退出'); return; }
  req.call(f).then(on).catch(() => { on(); toast('进不了全屏（可能是权限），已切到放映排版；Esc 退出'); });
  const onChange = () => { if (!document.fullscreenElement) { off(); document.removeEventListener('fullscreenchange', onChange); } };
  document.addEventListener('fullscreenchange', onChange);
}
function studioPresenter(): void {
  const w = ($('#preview') as HTMLIFrameElement | null)?.contentWindow as (Window & { deckAPI?: { openPresenter?: () => void } }) | null;
  if (mode !== 'html') { toast('先导入一个 HTML deck', true); return; }
  if (w?.deckAPI?.openPresenter) w.deckAPI.openPresenter();
  else toast('这份 deck 没有演讲者模式。用 /slidesmith:slides-presenter-mode 缝一份一体版就有了', true);
}

// ======================= ⌘K 命令面板 =======================
// 所有能做的事收成一张清单，打字就能找到：换皮 / 跳页 / 导出 / 面板 / 发给 AI / 放映 / 互动。
// 对不想记菜单的人，这是搜索、帮助和快捷键表三合一。
interface CmdItem { label: string; hint?: string; group: string; run: () => void; keys?: string }
function cmdkItems(): CmdItem[] {
  const it: CmdItem[] = [];
  const click = (sel: string) => () => (document.querySelector(sel) as HTMLElement | null)?.click();
  if (mode === 'html') {
    htmlSlides.forEach((sl, i) => it.push({ group: '跳页', label: `第 ${i + 1} 页 · ${sl.title || '（无标题）'}`, hint: sl.id, run: () => selectHtmlSlide(i), keys: String(i + 1) }));
    it.push({ group: '换皮', label: '保持原样（不换皮）', run: () => applySkinFromGallery('') });
    SKIN_ORDER.forEach((n) => { const b = SKINS[n]; if (b) it.push({ group: '换皮', label: `换皮：${b.label || n}`, hint: (b.dark ? '暗 · ' : '浅 · ') + n, run: () => applySkinFromGallery(n), keys: n }); });
    it.push({ group: 'AI', label: '一键发送给 AI', hint: '把待办清单发出去', run: click('#aiSendAll') });
    it.push({ group: 'AI', label: '视觉自检', hint: '溢出 / 对比度 / 坏图', run: () => { click('.htab[data-htab="ai"]')(); (document.getElementById('aimoreLib') as HTMLDetailsElement | null)?.setAttribute('open', ''); click('#auditRun')(); } });
    it.push({ group: 'AI', label: '搜图（免费图库）', run: click('#imgSearchOpen') });
    it.push({ group: 'AI', label: '图片库', run: click('#genOpenLib') });
    it.push({ group: '放映', label: '全屏放映', hint: 'F', run: studioPresent });
    it.push({ group: '放映', label: '打开演讲者副屏', hint: 'S', run: studioPresenter });
    it.push({ group: '页', label: '新增一页', run: click('#add') }); it.push({ group: '页', label: '删除当前页', run: click('#del') });
    it.push({ group: '页', label: '当前页上移', run: click('#up') }); it.push({ group: '页', label: '当前页下移', run: click('#down') });
    it.push({ group: '互动', label: liveRoomOf() ? `现场互动：房间 ${liveRoomOf()}（看在线 / 关提问）` : '现场互动：加一页扫码提问', run: () => { click('.ltab[data-ltab="insert"]')(); openLiveSetup(); } });
    if (liveRoomOf()) { it.push({ group: '互动', label: '关闭提问', run: () => void liveControl('close') }); it.push({ group: '互动', label: '开放提问', run: () => void liveControl('open') }); it.push({ group: '互动', label: '清空大屏', hint: '账本不动', run: () => void liveControl('clear') }); }
  }
  it.push({ group: '文件', label: '保存（写回源文件）', hint: '⌘S', run: click('#saveHtml') });
  it.push({ group: '文件', label: '另存为 HTML 副本', run: click('#expHtml') });
  it.push({ group: '文件', label: '导出 PDF', run: click('#expPdf') });
  it.push({ group: '文件', label: '导入 HTML', run: click('#imp') });
  it.push({ group: '文件', label: '导出 / 保存选项（嵌字体 · 手机遥控）', run: click('#expOpts') });
  [['ai', 'AI'], ['script', '讲稿 / 提词'], ['fmt', '格式'], ['anim', '动画'], ['design', '设计']].forEach(([k, l]) => it.push({ group: '面板', label: `右栏：${l}`, run: click(`.htab[data-htab="${k}"]`) }));
  [['pages', '页面'], ['skins', '换装'], ['insert', '插入']].forEach(([k, l]) => it.push({ group: '面板', label: `左栏：${l}`, run: click(`.ltab[data-ltab="${k}"]`) }));
  it.push({ group: '界面', label: '切换深色界面', run: click('#themeToggle, .iconbtn[title*="深色"]') });
  it.push({ group: '界面', label: '显示 / 隐藏 deck 自带段导航', run: click('.iconbtn[title*="段导航"]') });
  it.push({ group: '编辑', label: '撤销', hint: '⌘Z', run: () => undo() }); it.push({ group: '编辑', label: '重做', hint: '⌘⇧Z', run: () => redo() });
  it.push({ group: '帮助', label: '连接 Claude Code', run: click('#connectBtn') });
  return it;
}
let cmdkSel = 0; let cmdkShown: CmdItem[] = [];
function cmdkScore(q: string, item: CmdItem): number {
  if (!q) return 1;
  const hay = (item.label + ' ' + (item.hint || '') + ' ' + (item.keys || '') + ' ' + item.group).toLowerCase();
  if (hay.includes(q)) return 100 - hay.indexOf(q);
  let i = 0; for (const ch of q) { const j = hay.indexOf(ch, i); if (j < 0) return 0; i = j + 1; } // 顺序子序列
  return 10;
}
function cmdkRender(): void {
  const q = (($('#cmdkQ') as HTMLInputElement | null)?.value || '').trim().toLowerCase();
  cmdkShown = cmdkItems().map((it) => ({ it, sc: cmdkScore(q, it) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 14).map((x) => x.it);
  if (cmdkSel >= cmdkShown.length) cmdkSel = 0;
  const box = $('#cmdkList'); if (!box) return;
  box.innerHTML = cmdkShown.length ? cmdkShown.map((it, i) =>
    `<div class="cmdk-item${i === cmdkSel ? ' on' : ''}" data-i="${i}"><span class="cmdk-g">${esc(it.group)}</span><span class="cmdk-l">${esc(it.label)}</span>${it.hint ? `<span class="cmdk-h">${esc(it.hint)}</span>` : ''}</div>`).join('')
    : '<div class="cmdk-empty">没有匹配的动作</div>';
  box.querySelectorAll('.cmdk-item').forEach((el) => el.addEventListener('click', () => { cmdkSel = +((el as HTMLElement).dataset.i || 0); cmdkRun(); }));
}
function cmdkRun(): void { const it = cmdkShown[cmdkSel]; closeCmdk(); if (it) { try { it.run(); } catch (e) { toast('执行失败：' + (e as Error).message, true); } } }
function openCmdk(): void {
  const m = $('#cmdk'); if (!m) return; m.style.display = 'flex'; cmdkSel = 0;   // .libmodal 样式表默认 display:none，'' 等于没打开
  const q = $('#cmdkQ') as HTMLInputElement; q.value = ''; cmdkRender();
  // 焦点多半还在预览 iframe 里（点过页、放过映）：先把它请出来，再把焦点给搜索框。
  // 不这么做的话 focus() 在 iframe 持有焦点时会被忽略，打的字全进了 deck。
  try { (document.activeElement as HTMLElement | null)?.blur(); ($('#preview') as HTMLIFrameElement | null)?.blur(); window.focus(); } catch { /* noop */ }
  const grab = () => { q.focus({ preventScroll: true }); if (document.activeElement !== q) setTimeout(() => q.focus({ preventScroll: true }), 30); };
  grab(); requestAnimationFrame(grab);
}
function closeCmdk(): void { const m = $('#cmdk'); if (m) m.style.display = 'none'; }

// ======================= AI 回写：改了什么 =======================
// 页面从「已发送」变成「✓ 已改」是好的，但用户要靠眼睛对比才知道改了哪里。
// apply_patch 带一句 summary，这里留一份最近几条，页名 + 一句话。
const aiChangeLog: { t: number; pages: string[]; summary: string }[] = [];
function pushChangeLog(ids: string[], summary: string): void {
  const pages = ids.map((id) => { const i = htmlSlides.findIndex((s) => s.id === id); return i >= 0 ? `第 ${i + 1} 页${htmlSlides[i].title ? '「' + htmlSlides[i].title + '」' : ''}` : id; });
  aiChangeLog.unshift({ t: Date.now(), pages, summary }); aiChangeLog.splice(6);
  const box = $('#aiChangeLog'); if (!box) return;
  box.hidden = false;
  box.innerHTML = '<div class="sechead">AI 改了什么</div>' + aiChangeLog.map((e) => {
    const d = new Date(e.t); const hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return `<div class="chg"><span class="chg-t">${hh}</span><span class="chg-p">${esc(e.pages.join('、'))}</span>${e.summary ? `<div class="chg-s">${esc(e.summary)}</div>` : '<div class="chg-s chg-none">（AI 没说改了什么）</div>'}</div>`;
  }).join('');
}

// ======================= 现场互动（Slidesmith Live）就在 Studio 里 =======================
// 以前只有 skill / CLI 有入口，管理台是另一个网站另一次登录。现在：插入 → 现场互动 → 装进 deck，
// 之后同一张卡变成状态卡（在线 / 提问数 / 关提问 / 清屏 / 三个网址）。桥代跑 inject-live.mjs 和令牌接口。
const LIVE_RELAY = 'https://live.zhouliying.com';
function liveRoomOf(): string {
  const m = /__SM_QA_ROOM__\s*=\s*["']([A-Za-z0-9_-]{4,64})["']/.exec(H.prelude + '\n' + H.trailing);
  return m ? m[1] : '';
}
function liveSuggestRoom(): string {
  const base = (fileBase || 'deck').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24);
  return (base.length >= 4 ? base : 'room' + base) + new Date().getFullYear();
}
let liveTimer: ReturnType<typeof setInterval> | null = null;
function openLiveSetup(): void {
  (document.querySelector('.ltab[data-ltab="insert"]') as HTMLElement | null)?.click();
  const card = document.getElementById('liveCard'); if (!card) return;
  card.hidden = false; card.scrollIntoView({ block: 'nearest' });
  renderLiveCard();
}
function renderLiveCard(): void {
  const card = document.getElementById('liveCard'); if (!card) return;
  const room = liveRoomOf();
  const canBridge = location.protocol.startsWith('http');
  if (!room) {
    card.innerHTML = `<div class="livehead"><b>现场互动 · 扫码提问</b><span class="grow"></span><button class="mini" id="liveClose">收起</button></div>
      <div class="livehint">往 deck 末尾插一页「扫码提问」：学生扫码匿名提问、实时上大屏、你用 iPad 主持；课后在管理台按天导出。</div>
      <div class="field"><label>房间号（烘进 deck，二维码永不变 · 4–64 位字母数字）</label><input id="liveRoom" type="text" value="${esc(liveSuggestRoom())}" spellcheck="false"></div>
      <div class="field"><label>课程 / 活动名（管理台里认得出）</label><input id="liveName" type="text" value="${esc(fileBase)}"></div>
      <div class="oprow"><button id="liveGo" class="primary-mini"${canBridge ? '' : ' disabled title="要先连上 Claude Code 的桥（用 slidesmith 打开这份 deck）"'}>装进 deck</button></div>
      ${canBridge ? '' : '<div class="livehint warn">现在是离线打开的 Studio，装不了。让 Claude 用 slidesmith 打开这份 deck 再来。</div>'}`;
    card.querySelector('#liveGo')?.addEventListener('click', () => void liveInject());
    card.querySelector('#liveClose')?.addEventListener('click', () => { card.hidden = true; });
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    return;
  }
  const u = (p: string) => `${LIVE_RELAY}/${p}/${room}`;
  card.innerHTML = `<div class="livehead"><b>现场互动</b><span class="livedot" id="liveDot"></span><span class="grow"></span><button class="mini" id="liveClose">收起</button></div>
    <div class="liveroom">房间 <code>${esc(room)}</code></div>
    <div class="livestat" id="liveStat">读取中…</div>
    <div class="oprow"><button id="liveClose2" class="mini">关闭提问</button><button id="liveOpen2" class="mini">开放提问</button><button id="liveClear" class="mini" title="只清大屏，账本一条不少">清屏</button></div>
    <div class="liveurls">
      <div><span>学生扫码</span><a href="${u('q')}" target="_blank" rel="noopener">${esc(u('q').replace(/^https?:\/\//, ''))}</a></div>
      <div><span>你的 iPad</span><a href="${u('r')}" target="_blank" rel="noopener">${esc(u('r').replace(/^https?:\/\//, ''))}</a></div>
      <div><span>管理台</span><a href="${LIVE_RELAY}/" target="_blank" rel="noopener">${esc(LIVE_RELAY.replace(/^https?:\/\//, ''))}/</a></div>
    </div>
    <div class="oprow"><button id="liveCopy" class="mini">复制学生网址</button><button id="liveRemoveBtn" class="mini danger" title="把互动页和房间配置从 deck 里拆掉（管理台里的账本不动）">拆掉互动页</button></div>`;
  card.querySelector('#liveClose')?.addEventListener('click', () => { card.hidden = true; if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } });
  card.querySelector('#liveClose2')?.addEventListener('click', () => void liveControl('close'));
  card.querySelector('#liveOpen2')?.addEventListener('click', () => void liveControl('open'));
  card.querySelector('#liveClear')?.addEventListener('click', () => void liveControl('clear'));
  card.querySelector('#liveCopy')?.addEventListener('click', () => { void navigator.clipboard?.writeText(u('q')).then(() => toast('已复制：' + u('q'))); });
  card.querySelector('#liveRemoveBtn')?.addEventListener('click', () => void liveRemove());
  void liveRefresh();
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = setInterval(() => { if (card.hidden || !document.body.contains(card)) { if (liveTimer) clearInterval(liveTimer); liveTimer = null; return; } void liveRefresh(); }, 5000);
}
async function liveRefresh(): Promise<void> {
  const room = liveRoomOf(); const stat = document.getElementById('liveStat'); const dot = document.getElementById('liveDot');
  if (!room || !stat) return;
  if (!location.protocol.startsWith('http')) { stat.textContent = '离线打开的 Studio 看不到在线状态（要连桥）'; return; }
  try {
    const j = await (await fetch(`${libBase()}/api/live/status?room=${encodeURIComponent(room)}`)).json() as { ok: boolean; configured?: boolean; room?: { online: { deck: number; ask: number } | null; wallNow: number; closed: boolean; items: number; sessions: number; name: string } | null; error?: string };
    if (!j.ok) { stat.textContent = '读不到：' + (j.error || '未知错误'); return; }
    if (!j.configured) { stat.innerHTML = 'Mac 上还没配管理台令牌。让 Claude 跑一次 <code>smlive setup</code>（令牌在服务器 /etc/smrelay/token）。'; return; }
    const r = j.room;
    if (!r) { stat.textContent = '管理台里还没有这个房间——放映端第一次连上会自动建；或让 Claude 先建好并起名。'; if (dot) dot.className = 'livedot'; return; }
    const on = r.online;
    stat.innerHTML = `${on ? `<b>${on.ask}</b> 台学生在线 · 大屏 <b>${r.wallNow}</b> 条` : '现在没人连着'}${r.closed ? ' · <span class="livec">提问已关闭</span>' : ' · <span class="liveo">提问开放中</span>'}<br><span class="livemeta">${esc(r.name || '')}${r.name ? ' · ' : ''}累计 ${r.sessions} 场 / ${r.items} 条</span>`;
    if (dot) dot.className = 'livedot ' + (on ? 'on' : '') + (r.closed ? ' closed' : '');
    const c = document.getElementById('liveClose2') as HTMLButtonElement | null, o = document.getElementById('liveOpen2') as HTMLButtonElement | null;
    if (c) c.hidden = r.closed; if (o) o.hidden = !r.closed;
  } catch (e) { stat.textContent = '连不上桥：' + (e as Error).message; }
}
async function liveControl(action: 'close' | 'open' | 'clear'): Promise<void> {
  const room = liveRoomOf(); if (!room) { toast('这份 deck 还没装互动页', true); return; }
  try {
    const j = await (await fetch(`${libBase()}/api/live/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room, action }) })).json() as { ok: boolean; error?: string };
    if (!j.ok) { toast('没成功：' + (j.error || ''), true); return; }
    toast({ close: '已关闭提问：学生再扫码会看到「提问已关闭」', open: '已重新开放提问', clear: '大屏已清空（账本一条不少）' }[action]);
    void liveRefresh();
  } catch (e) { toast('连不上桥：' + (e as Error).message, true); }
}
async function liveInject(): Promise<void> {
  if (mode !== 'html') { toast('先导入一个 HTML deck', true); return; }
  const roomIn = (document.getElementById('liveRoom') as HTMLInputElement | null)?.value.trim() || '';
  const name = (document.getElementById('liveName') as HTMLInputElement | null)?.value.trim() || '';
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(roomIn)) { toast('房间号只能是 4–64 位字母、数字、- 和 _', true); return; }
  const btn = document.getElementById('liveGo') as HTMLButtonElement | null; if (btn) { btn.disabled = true; btn.textContent = '装配中…'; }
  setBusy('正在把互动页装进 deck…');
  try {
    harvestAll(); pushHistory('live');
    const html = exportHtmlDeck();
    const j = await (await fetch(`${libBase()}/api/live/inject`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html, room: roomIn, name }) })).json() as { ok: boolean; html?: string; error?: string; roomCreated?: boolean; roomError?: string };
    if (!j.ok || !j.html) throw new Error(j.error || '桥没有返回装好的 deck');
    loadHtmlDeck(fileBase + '.html', j.html);
    markDirty(); syncExportToBridge();
    selectHtmlSlide(htmlSlides.length - 1);
    toast(`互动页已装进 deck（最后一页）${j.roomCreated ? '，管理台里房间也建好了' : (j.roomError ? '；管理台建房间没成功：' + j.roomError : '')}。记得保存。`);
    renderInsertPane(); openLiveSetup();
  } catch (e) { toast('装配失败：' + (e as Error).message, true); if (btn) { btn.disabled = false; btn.textContent = '装进 deck'; } }
  finally { setBusy(null); }
}
async function liveRemove(): Promise<void> {
  if (!liveRoomOf()) return;
  if (!confirm('把互动页和房间配置从这份 deck 里拆掉？管理台里的账本不受影响。')) return;
  setBusy('正在拆掉互动页…');
  try {
    harvestAll(); pushHistory('live');
    const html = exportHtmlDeck();
    const j = await (await fetch(`${libBase()}/api/live/inject`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html, remove: true }) })).json() as { ok: boolean; html?: string; error?: string };
    if (!j.ok || !j.html) throw new Error(j.error || '桥没有返回结果');
    loadHtmlDeck(fileBase + '.html', j.html); markDirty(); syncExportToBridge();
    toast('互动页已拆掉。记得保存。'); renderInsertPane(); openLiveSetup();
  } catch (e) { toast('拆除失败：' + (e as Error).message, true); }
  finally { setBusy(null); }
}

