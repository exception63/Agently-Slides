// ---------------- 手表提词（watch mode） ----------------
// 提词表按**锚点**索引（`{"s1-boom":["无缝嵌入"]}`），存在 deck 自己的
// `window.__SM_CUES__` 里。这里做的是「读出来 → 编辑 → 写回去」。
//
// 读为什么走预览 iframe 而不是正则解析文本：那份字面量是**人和 skill 写的 JS**，
// 带注释、可能有尾逗号，正则解析迟早翻车。iframe 里那份是浏览器**已经求值过**的，
// 永远是对的。写回去时我们统一写成严格 JSON，下次谁解析都不难。
let cueMap: Record<string, string[]> | null = null;
let cueLoaded = false;
/** 用户手动点「＋ 加一条」超出 5 条时，额外多给几个空框（按锚点记） */
const cueExtra: Record<string, number> = {};

/** 提词的硬约束 —— 与 slides-presenter-mode skill 里那张表一字不差 */
// 表盘放得下 5 行短提词。**这是 skill 出品的上限**；Studio 允许手动超过它
// （手表上会变成要翻页，能用但不优雅），所以这里只告警、不拦。
const CUE_MAX = 5;
const CUE_LEN = 10;
const CUE_STRUCTURAL = /^(第[一二三四五六七八九十\d]+(部分|章|节|页)|part\s*\d+|目录|结构|概览|agenda)$/i;

function previewWin(): (Window & { deckAPI?: { SLIDE_MAP?: string[] }; __SM_CUES__?: Record<string, string[]> }) | null {
  try { return (($('#preview') as HTMLIFrameElement).contentWindow as never) || null; } catch { return null; }
}

/** 预览 iframe 里那份 deck 真的渲染出来了吗（`#deck` 在了就算） */
function previewReady(): boolean {
  try { return !!previewWin()?.document?.querySelector('#deck'); } catch { return false; }
}

/** 第 i 页对应的讲稿锚点。与 deck 端 stateFromDom() 的取法保持一致，否则手表对不上 */
function slideAnchor(i: number): string {
  const w = previewWin();
  const m = w?.deckAPI?.SLIDE_MAP;
  return (m && m[i]) || ('sm-note-' + i);
}

/** 首次进面板时从预览里吃一份。返回 null = 这份 deck 没开 watch mode */
function loadCues(): Record<string, string[]> | null {
  if (cueLoaded) return cueMap;
  // **预览没起来就别缓存**：这时候读到的 undefined 不代表"这份 deck 没提词"，
  // 缓存下去就变成永久的假答案（导入过程中 refreshTasks 就会撞上）。
  if (!previewReady()) return null;
  cueLoaded = true;
  const raw = previewWin()?.__SM_CUES__;
  cueMap = (raw && typeof raw === 'object') ? JSON.parse(JSON.stringify(raw)) as Record<string, string[]> : null;
  return cueMap;
}

/** 写回 deck 文本。__SM_CUES__ 落在 #deck 之外，也就是 H.prelude / H.trailing 里 */
function persistCues(): void {
  if (!cueMap) return;
  const json = JSON.stringify(cueMap, null, 2);
  // **全局替换、两处都写**：万一 deck 里混进了两份 __SM_CUES__ 赋值（历史注入 + 新注入），
  // 只写第一份的话，浏览器用的是最后一份 —— Studio 面板显示得好好的，deck 和手表拿到的
  // 却是另一份，而且没有任何报错。让每一份都是同一张表，谁赢都对。
  const re = /(window\.__SM_CUES__\s*=\s*)\{[\s\S]*?\}(\s*;)/g;
  let done = false;
  for (const key of ['trailing', 'prelude'] as const) {
    const src = H[key];
    if (re.test(src)) {
      re.lastIndex = 0;
      // 用函数替换：提词里可能含 $ 之类的字符，字符串替换会被当特殊记号解释
      H[key] = src.replace(re, (_m, a: string, b: string) => a + json + b);
      done = true;
    }
    re.lastIndex = 0;
  }
  // **只标脏，不重渲染预览**：提词不影响幻灯片外观，为敲一个字就重载整份 deck
  // 会丢掉滚动位置和选中态。
  //
  // 但预览里那个活对象要就地更新——不然 deck 上的「✦ 提词」浮层显示的还是旧表，
  // 面板里明明写好了、浮层却说「这一页没有提词」，看着就像根本没写进去。
  if (done) {
    try {
      const w = previewWin() as (Window & { __SM_CUES__?: Record<string, string[]>; __SM_CUE_REFRESH__?: () => void }) | null;
      if (w) {
        w.__SM_CUES__ = JSON.parse(json) as Record<string, string[]>;
        if (typeof w.__SM_CUE_REFRESH__ === 'function') w.__SM_CUE_REFRESH__();
      }
    } catch { /* 预览没就绪就算了，下次重渲染自然会带上 */ }
    markDirty();
  }
}

function renderCuePane(): void {
  const box = $('#cueBody'); if (!box) return;
  if (mode !== 'html') { box.innerHTML = '<div class="nosel">提词只对导入的 HTML deck 可用。</div>'; return; }
  const map = loadCues();
  if (!map) {
    const ch = deckChannel();
    box.innerHTML = '<div class="nosel">这份 deck 没有开 <b>watch mode</b>——里面没有提词表，写不进去。<br><br>'
      + '最省事的办法：在 Claude 面板点 <b>一键加提词</b>，它会先把 watch mode 烘进去再拟提词'
      + (ch ? '（频道名已认出：<code>' + esc(ch) + '</code>）' : '')
      + '。<br><br>也可以自己跑 <code>slides-presenter-mode</code> skill 重新缝一遍。</div>';
    return;
  }
  const anchor = slideAnchor(cur);
  // 已有的全都显示（可能超过 5——手动加的），不足 5 条补空框
  const list = (map[anchor] || []).slice();
  while (list.length < CUE_MAX) list.push('');
  if (cueExtra[anchor]) { for (let k = 0; k < cueExtra[anchor]; k++) list.push(''); }

  const rows = list.map((v, i) =>
    `<div class="field"><input class="cue-in" data-i="${i}" value="${esc(v)}" placeholder="${i === 0 ? '例：无缝嵌入' : '（可留空）'}" maxlength="24"></div>`
  ).join('');

  // 全 deck 的账要摆在最上面：提词是「每页都得有」的东西，只盯着当前页
  // 永远不知道自己还差 12 页没写。
  const sum = cueDeckSummary(map);
  const short = sum.total - sum.have;
  const sumTxt = `全 deck ${sum.have}/${sum.total} 页有提词`
    + (short ? ` · 缺 ${short} 页` : '')
    + (sum.bad ? ` · ${sum.bad} 页不合规` : (short ? '' : ' · 全部合规'));

  box.innerHTML = (cueUndo
      ? `<div class="audit-row">Claude 刚写入 ${cueAiCount} 页 · <button id="cueUndo" class="mini">撤销</button></div>`
      : '')
    + `<div class="cfaint">${sumTxt}</div>`
    + `<div class="cfaint">第 ${cur + 1} 页 · 锚点 <code>${esc(anchor)}</code></div>`
    + rows
    + '<div class="oprow"><button id="cueAdd" class="mini">＋ 加一条</button>'
    + '<button id="cueFromNotes" class="mini">从讲稿抽一版</button>'
    + ((short || sum.bad) ? '<button id="cueNext" class="mini">跳到下一个待处理</button>' : '')
    + '</div>'
    + '<div id="cueCheck"></div>';

  box.querySelectorAll('.cue-in').forEach((el) => {
    el.addEventListener('input', () => {
      const vals = Array.from(box.querySelectorAll('.cue-in'))
        .map((x) => (x as HTMLInputElement).value.trim())
        .filter((t) => t.length > 0);
      if (!cueMap) return;
      if (vals.length) cueMap[anchor] = vals; else delete cueMap[anchor];
      checkCues(vals);
      persistCues();
    });
  });
  const addBtn = $('#cueAdd');
  if (addBtn) addBtn.addEventListener('click', () => {
    // 手动突破 5 条 —— 手表上会变成要翻页，体检会提醒，但不拦
    cueExtra[anchor] = (cueExtra[anchor] || 0) + 1;
    renderCuePane();
  });
  const fromNotes = $('#cueFromNotes');
  if (fromNotes) fromNotes.addEventListener('click', () => cueDraftFromNotes(anchor));
  const undoBtn = $('#cueUndo');
  if (undoBtn) undoBtn.addEventListener('click', () => undoCuePatch());
  const nextBtn = $('#cueNext');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const i = nextCueTodo(map);
    if (i < 0) { toast('全部页都过关了'); return; }
    selectHtmlSlide(i);
  });
  checkCues(list.filter((t) => t.length > 0));
}

/** 一页提词的毛病清单（空 = 合规）。**只此一处**——面板体检、全 deck 汇总、
 *  交给 Claude 的回报，三处共用它，规则不会各写各的然后慢慢漂开。 */
function cueIssues(vals: string[]): string[] {
  const bad: string[] = [];
  if (!vals.length) bad.push('这一页还没有提词');
  if (vals.length > CUE_MAX) bad.push(`条数 ${vals.length}，超过 ${CUE_MAX} 条手表要翻页`);
  vals.forEach((v) => {
    if (v.length > CUE_LEN) bad.push(`「${v.slice(0, 8)}…」${v.length} 字，超上限 ${CUE_LEN}`);
    if (CUE_STRUCTURAL.test(v)) bad.push(`「${v}」像结构标签，手表上帮不上忙`);
  });
  return bad;
}

/** 就地体检 —— 讲台上才发现提词不合用就晚了 */
function checkCues(vals: string[]): void {
  const out = $('#cueCheck'); if (!out) return;
  const bad = cueIssues(vals);
  out.className = bad.length ? 'audit-row error' : 'audit-row';
  out.textContent = bad.length ? '⚠ ' + bad.join(' · ') : '✓ 合规';
}

/** 从讲稿里抽这一段的 <strong> 当草稿。**仍需人过一遍**——见 skill 里的红线 */
function cueDraftFromNotes(anchor: string): void {
  const w = previewWin() as (Window & { __TXB64__?: string }) | null;
  const b64 = w?.__TXB64__;
  if (!b64) { toast('这份 deck 没有内嵌讲稿，抽不出来', true); return; }
  let html = '';
  try { html = decodeURIComponent(escape(atob(b64))); } catch { toast('讲稿解码失败', true); return; }
  const re = new RegExp('<h[1-6][^>]*\\bid="' + anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>([\\s\\S]*?)(?=<h[1-6][^>]*\\bid=|$)', 'i');
  const seg = html.match(re);
  if (!seg) { toast('讲稿里没找到锚点 ' + anchor, true); return; }
  const found: string[] = [];
  seg[1].replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, t: string) => {
    const clean = t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (clean && found.indexOf(clean) < 0) found.push(clean);
    return '';
  });
  if (!found.length) { toast('这一段讲稿里没有 <strong> 标记', true); return; }
  if (!cueMap) return;
  cueMap[anchor] = found.slice(0, CUE_MAX);
  persistCues();
  renderCuePane();
  toast('抽了 ' + found.length + ' 条草稿 —— 请逐条过一遍再用');
}

// ---------- 提词的对外接口：Claude ↔ 桥 ↔ 这里（「一键加提词」走的就是这条） ----------
//
// **为什么非要另开一条通道**：`slidesmith_apply_patch` 只按 `data-id` 替换 `#deck` 里的
// `<section>`，而提词表落在 `#deck` 之外的 prelude/trailing —— 补丁够不着它。
//
// **读也不让桥去正则解析那份字面量**（理由同 loadCues）：那是人和 skill 手写的 JS，
// 带注释、可能有尾逗号。这里交出去的是浏览器已经求值过的那份；锚点也用 Studio 自己的
// `slideAnchor()` 算，和提词面板、和手表查表用的键完全同源，不会各算各的。
interface CuePageInfo { index: number; anchor: string; title: string; cues: string[]; issues: string[] }
/** AI 上一次写入之前的整份提词表 —— 撤销用。null = 这一会话 AI 还没写过 */
let cueUndo: Record<string, string[]> | null = null;
let cueAiCount = 0;

/**
 * 这份 deck 的广播频道名。
 *
 * watch mode 的注入代码要用它拼 `{{CHANNEL}}-presenter-sync` 跟着翻页走；**填错了提词窗
 * 就一辈子停在第一页**，两份 deck 同开还会串台。deck 自己的引擎里本来就写着一个
 * （`const CONFIG = { channel: 'dyq-defense-2026', … }`），直接抄它，别另起一个。
 */
function deckChannel(): string {
  const src = H.prelude + '\n' + H.trailing;
  const pats = [
    /\bchannel\s*:\s*['"]([^'"]+)['"]/,
    /new\s+BroadcastChannel\(\s*['"]([^'"]+?)-presenter-sync['"]/,
    /new\s+BroadcastChannel\(\s*['"]([^'"]+)['"]/,
  ];
  for (const re of pats) { const m = re.exec(src); if (m && m[1]) return m[1]; }
  return '';
}

function cueReport(): { watchMode: boolean; watchOutdated: boolean; deckMode: string; channel: string; pages: CuePageInfo[] } {
  const map = mode === 'html' ? loadCues() : null;
  const pages: CuePageInfo[] = mode === 'html'
    ? htmlSlides.map((s, i) => {
      const a = slideAnchor(i);
      const vals = (map && map[a]) ? map[a].slice() : [];
      return { index: i + 1, anchor: a, title: s.title, cues: vals, issues: cueIssues(vals) };
    })
    : [];
  const src = H.prelude + '\n' + H.trailing;
  return {
    watchMode: !!map,
    watchOutdated: !!map && src.indexOf('__SM_CUE_REFRESH__') < 0,
    deckMode: mode, channel: mode === 'html' ? deckChannel() : '', pages,
  };
}

function sendCueReport(extra: Record<string, unknown> = {}): void {
  if (!bridge.connected || !bridge.ws || bridge.ws.readyState !== WebSocket.OPEN) return;
  try { bridge.ws.send(JSON.stringify({ type: 'cues', ...cueReport(), ...extra })); } catch { /* noop */ }
}

/**
 * Claude 写来一份提词表。
 *
 * 默认 **merge**：只填还空着的页，**不动用户已经手调过的**。重跑「一键加提词」
 * 因此是安全的——否则用户在面板里逐页过完一遍的成果，会被下一次生成整份抹掉。
 * replace=true 才覆盖。
 */
function applyCuePatch(incoming: Record<string, string[]>, replace: boolean): void {
  if (mode !== 'html') { sendCueReport({ applied: 0, error: '当前不是 HTML deck，提词写不进去' }); return; }
  const map = loadCues();
  if (!map) {
    sendCueReport({ applied: 0, error: '这份 deck 没开 watch mode（找不到 window.__SM_CUES__）。'
      + '先用 slides-presenter-mode skill 以 watch mode 重新缝一次，deck 里才有提词表可写。' });
    return;
  }
  // 预览没就绪时 slideAnchor() 会退化成 'sm-note-N'，拿它当白名单会把一批**完全正确**的
  // 锚点判成「不认识」——那个报错指错了方向，人会去改锚点，而锚点根本没错。
  if (!previewReady()) {
    sendCueReport({ applied: 0, error: '预览还在重载，锚点表暂时读不到。等一两秒再写一次（别改锚点，它们没错）。' });
    return;
  }
  const valid = new Set(htmlSlides.map((_s, i) => slideAnchor(i)));
  const snapshot = JSON.parse(JSON.stringify(map)) as Record<string, string[]>;
  const unknown: string[] = []; const kept: string[] = [];
  let applied = 0;
  Object.keys(incoming).forEach((k) => {
    // 不认识的锚点**不静默丢**——回报里带上，让写的人知道自己写歪了
    if (!valid.has(k)) { unknown.push(k); return; }
    const vals = (incoming[k] || []).map((v) => String(v).trim()).filter((v) => v.length > 0);
    if (!vals.length) return;
    if (!replace && map[k] && map[k].length) { kept.push(k); return; }
    map[k] = vals; applied++;
  });
  if (applied) {
    cueUndo = snapshot; cueAiCount = applied;
    persistCues();
    if (!($('[data-hpane="script"]') as HTMLElement | null)?.hidden) renderCuePane();
    toast('Claude 写入 ' + applied + ' 页提词 —— 请在右栏「讲稿」里逐页过一遍');
    setTimeout(syncExportToBridge, 300);
  }
  sendCueReport({ applied, keptExisting: kept, unknownAnchors: unknown });
}

/** 找到并摘掉 deck 里已有的 watch-cues 注入块。返回是否摘到。 */
function stripWatchBlock(): boolean {
  // 新版注入带标记，精准；老版（skill 直接烘的 / 早期 Studio 注入的）没有标记，
  // 只能按「含 __SM_CUES__ 赋值的那个 <script>」找。
  // **有几块摘几块**，不是摘一块就收工：留一块下来就等于留了第二份提词表，
  // 而浏览器只认最后那份，Studio 却在改前面那份 —— 两边静默分家。
  const marked = /<!--sm-watch-cues-start-->[\s\S]*?<!--sm-watch-cues-end-->\s*/;
  // `=\s*\{` 这个约束是必须的：pair-client 里有 `typeof window.__SM_CUES__ === 'object'`，
  // 只写 `=` 会把整个手机遥控块一起摘掉。
  const bare = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\.__SM_CUES__\s*=\s*\{[\s\S]*?<\/script>\s*/i;
  let n = 0;
  for (const key of ['trailing', 'prelude'] as const) {
    for (const re of [marked, bare]) {
      while (re.test(H[key])) { H[key] = H[key].replace(re, ''); n++; if (n > 20) break; }
    }
  }
  return n > 0;
}

/**
 * 把 watch mode 烘进这份 deck —— `js` 是 skill 那份 `watch-cues.js.template`
 * 填好 `{{CHANNEL}}` 之后的成品。
 *
 * **模板不抄一份到 Studio 里**：抄了就是第二个真相源，skill 那边一改，这边就开始漂。
 * Studio 只负责两件它才做得了的事：报出频道名、把成品塞进 `#deck` 之外的位置。
 *
 * `replace=true` 用来**升级已经烘过的 deck**：摘掉旧块、换上新的，
 * **提词表原样保留**（写回由 persistCues 完成，它认的是内存里那份 cueMap）。
 */
function enableWatchMode(js: string, replace = false): void {
  if (mode !== 'html') { sendCueReport({ enabled: false, error: '当前不是 HTML deck' }); return; }
  const existing = loadCues();
  if (existing && !replace) {
    sendCueReport({ enabled: false, error: '这份 deck 已经开着 watch mode 了。'
      + '要换成新版注入代码（修了提词窗空白 / 弹窗被压 / 按钮不跟皮肤 三个毛病）就传 replaceExisting=true，提词表会原样保留。' });
    return;
  }
  if (!/window\.__SM_CUES__\s*=\s*\{/.test(js)) {
    sendCueReport({ enabled: false, error: '交来的代码里没有 window.__SM_CUES__ = { … }; 那句赋值——'
      + '提词表就是靠它存的，没有它烘进去也写不了' });
    return;
  }
  if (existing && !stripWatchBlock()) {
    sendCueReport({ enabled: false, error: '在 deck 里找不到旧的 watch-cues 注入块，不敢盲目再加一份'
      + '（会出现两份 __SM_CUES__，后一份覆盖前一份，Studio 改的却是前一份）' });
    return;
  }
  H.trailing += '\n<!--sm-watch-cues-start-->\n<script>\n' + js + '\n</' + 'script>\n<!--sm-watch-cues-end-->\n';
  // 升级：提词表原样写回新块。全新开启：坐实成空表——不用等预览 iframe 重渲染完
  // 再去读，那一步是异步的，紧接着的写入会扑空。
  if (existing) { persistCues(); } else { cueMap = {}; cueLoaded = true; }
  markDirty();
  renderHtmlEdit();          // 让预览把新脚本跑起来（✦提词 按钮也才会出现）
  setTimeout(syncExportToBridge, 500);
  if (!($('[data-hpane="script"]') as HTMLElement | null)?.hidden) renderCuePane();
  toast(existing ? '提词注入代码已升级到新版（提词表保留）' : '已开启 watch mode —— 现在可以写提词了');
  sendCueReport({ enabled: true, upgraded: !!existing });
}

function undoCuePatch(): void {
  if (!cueUndo) return;
  cueMap = cueUndo; cueUndo = null; cueAiCount = 0;
  persistCues(); renderCuePane(); toast('已还原到 Claude 写入之前');
}

/** 全 deck 一眼：几页有提词、几页不合规。**讲台上才发现缺页就晚了** */
function cueDeckSummary(map: Record<string, string[]>): { have: number; total: number; bad: number } {
  let have = 0; let bad = 0;
  htmlSlides.forEach((_s, i) => {
    const vals = map[slideAnchor(i)] || [];
    if (!vals.length) return;
    have++;
    if (cueIssues(vals).length) bad++;
  });
  return { have, total: htmlSlides.length, bad };
}

/** 下一个还没提词 / 提词不合规的页（从当前页往后绕一圈）。-1 = 全都过关了 */
function nextCueTodo(map: Record<string, string[]>): number {
  const n = htmlSlides.length;
  for (let k = 1; k <= n; k++) {
    const i = (cur + k) % n;
    if (cueIssues(map[slideAnchor(i)] || []).length) return i;
  }
  return -1;
}

