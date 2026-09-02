// ======================= v2: contract HTML deck (HTML itself = truth) =======================
function deriveHtmlTitle(sec: Element, i: number): string {
  const dt = sec.getAttribute('data-title'); if (dt) return dt;
  const el = sec.querySelector('.cover__title,.secdiv__title,.manifesto__title,.insight__statement,.head__title,.title,h1,h2,h3');
  const t = el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return t || 'slide ' + (i + 1);
}
function nodeToHtml(n: Node): string {
  if (n.nodeType === 1) return (n as Element).outerHTML;
  if (n.nodeType === 3) return n.textContent || '';
  if (n.nodeType === 8) return '<!--' + (n as Comment).data + '-->';
  return '';
}
function attrsString(el: Element): string {
  return Array.from(el.attributes).map((a) => (a.value ? `${a.name}="${a.value.replace(/"/g, '&quot;')}"` : a.name)).join(' ');
}
function toHex(v: string): string {
  v = (v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
  const m = v.match(/rgba?\(([^)]+)\)/i);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return '#' + p.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join(''); }
  return '';
}
function parseTokens(head: string): { base: Record<string, string>; themes: string[] } {
  const base: Record<string, string> = {};
  const m = head.match(/:root\s*\{([^}]*)\}/);
  if (m) m[1].split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) { const k = d.slice(0, i).trim(); if (k.startsWith('--')) base[k] = d.slice(i + 1).trim(); } });
  const themes: string[] = []; const re = /:root\[data-theme=["']?([^"'\]]+)["']?\]/g; let t;
  while ((t = re.exec(head))) if (themes.indexOf(t[1]) < 0) themes.push(t[1]);
  return { base, themes };
}

function loadHtmlDeck(name: string, html: string): void {
  fileBase = name.replace(/\.html?$/i, '') || 'deck';
  let doc: Document;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); }
  catch (e) { toast('HTML 解析失败: ' + (e as Error).message, true); return; }
  const deckEl = doc.querySelector('#deck') || doc.querySelector('.deck');
  const secs = deckEl ? Array.from(deckEl.querySelectorAll(':scope > .slide')) : Array.from(doc.querySelectorAll('section.slide, .slide'));
  if (!secs.length) { toast('未识别到 .slide 结构（需符合 Deck 契约：每页 <section class="slide">）', true); return; }

  // split body into prelude (before #deck) + trailing (after #deck) so export re-emits a clean deck
  let prelude = '', trailing = '';
  if (deckEl) { let seen = false; Array.from(doc.body.childNodes).forEach((n) => { if (n === deckEl) { seen = true; return; } (seen ? (trailing += nodeToHtml(n)) : (prelude += nodeToHtml(n))); }); }
  const mapM = html.match(/window\.SLIDE_MAP\s*=\s*(\[[^\]]*\])/);
  let slideMap: string[] | null = null; if (mapM) { try { slideMap = JSON.parse(mapM[1]); } catch { slideMap = null; } }
  // recover the FX play mode if this deck was exported by us before (else default auto)
  fxMode = /<html[^>]*\bdata-smfx=["']?manual/i.test(html) ? 'manual' : 'auto';
  const { base, themes } = parseTokens(doc.head.innerHTML);

  htmlSlides = secs.map((s, i) => {
    const id = s.getAttribute('data-id') || (slideMap && slideMap[i]) || 's' + (i + 1);
    s.setAttribute('data-id', id); // stable addressing key for Submit-to-AI patches
    return {
      id,
      title: deriveHtmlTitle(s, i),
      seg: s.getAttribute('data-seg') || '0',
      segName: s.getAttribute('data-segname') || '',
      variant: (s.getAttribute('class') || '').replace(/\bslide\b/, '').trim(),
      html: s.outerHTML,
    };
  });
  // recover any token overrides we previously baked as inline <html> style, then
  // strip that attr so it isn't duplicated (htmlOpenTag re-emits from H.overrides)
  const overrides: Record<string, string> = {};
  (doc.documentElement.getAttribute('style') || '').split(';').forEach((d) => {
    const i = d.indexOf(':'); if (i > 0) { const k = d.slice(0, i).trim(); if (k.startsWith('--')) overrides[k] = d.slice(i + 1).trim(); }
  });
  doc.documentElement.removeAttribute('style');

  // recover a baked-in skin (our injected <style id="sm-skin" data-skin>) and strip it + its font
  // link, so assembleDeck re-injects cleanly (no accumulation across export→import cycles)
  const skinEl = doc.getElementById('sm-skin');
  const detectedSkin = skinEl ? (skinEl.getAttribute('data-skin') || '') : '';
  if (skinEl) skinEl.remove();
  const skinFontEl = doc.getElementById('sm-skin-font'); if (skinFontEl) skinFontEl.remove();

  H.head = doc.head.innerHTML;
  H.htmlAttrs = attrsString(doc.documentElement);
  H.bodyClass = doc.body.getAttribute('class') || '';
  H.prelude = prelude; H.trailing = trailing;
  H.baseTokens = base; H.overrides = overrides; H.themes = themes;
  H.theme = doc.documentElement.getAttribute('data-theme') || '';
  H.skin = (detectedSkin && (SKINS as Record<string, unknown>)[detectedSkin]) ? detectedSkin : '';

  mode = 'html'; cur = 0; selBid = null; htmlSelEl = null;
  $('#deckname').textContent = fileBase;
  Object.keys(aiInstructions).forEach((k) => delete aiInstructions[k]); aiApplied.clear(); aiSent.clear(); Object.keys(aiBefore).forEach((k) => delete aiBefore[k]); proposed.clear(); aiCurId = ''; aiDeckInstruction = ''; usedFontIds.clear();
  trayImages.length = 0; Object.keys(genQueue).forEach((k) => delete genQueue[k]); // a new deck → drop staged images + photo-gen marks (they were deck-specific)
  undoStack = []; redoStack = []; lastPushTag = ''; dirty = false; updateUndoButtons(); updateDirtyBadge();
  const aiBox = $('#aiInstruction') as HTMLTextAreaElement | null; if (aiBox) aiBox.value = '';
  const aiDeckBox = $('#aiDeckInstruction') as HTMLTextAreaElement | null; if (aiDeckBox) aiDeckBox.value = '';
  const fxSel = $('#hFxMode') as HTMLSelectElement | null; if (fxSel) fxSel.value = fxMode; // reflect imported deck's play mode
  renderLeft(); setHtmlMode(true); refreshHtmlInspector(); renderHtmlEdit(); renderTray(); renderTodo();
  // **自己开的 deck 要主动报给桥**：否则桥的 `hasDeck` 一直是 false，
  // AI 那边看到的是「Studio 里没打开任何 deck」，而屏幕上明明开着。
  // 从桥推下来的那份不用回声（它本来就知道）。
  if (!importedFromBridge) setTimeout(syncExportToBridge, 400);
  toast('已导入 HTML deck：' + fileBase + '（' + htmlSlides.length + ' 页 · ' + new Set(htmlSlides.map((s) => s.seg)).size + ' 段）');
}

// —— the editing surface: render ONE slide cleanly (deck head styles, no deck engine) ——
// Token overrides ride as an INLINE style on <html> — highest specificity, so they
// beat any `:root[data-theme=…]` rule in the deck (a plain :root block would lose).
function overridesInline(): string {
  return Object.keys(H.overrides).map((k) => `${k}:${H.overrides[k]}`).join(';');
}
function htmlOpenTag(): string {
  let a = H.htmlAttrs;
  if (H.theme) a = /data-theme=/.test(a) ? a.replace(/data-theme=("[^"]*"|'[^']*'|\S+)/, `data-theme="${H.theme}"`) : a + ` data-theme="${H.theme}"`;
  const ov = overridesInline();
  if (ov) a += ` style="${ov}"`;
  return a;
}
// Render the FULL deck (head + prelude + #deck{all slides} + trailing engine) so it
// looks exactly as designed — correct 16:9 AND the deck's OWN segnav + thumbnail nav.
// Editing is layered on top of the live (same-origin) DOM; no aspect/nav loss.
// editorial-slides 换皮：把选中皮的 bundle 作为一层 <style> 叠加在 deck 自身 CSS 之后（后者被覆盖），
// 同时按需带上该皮的 web 字体 <link>。导出时一并烘焙，再导入时由 loadHtmlDeck 识别 data-skin 还原。
function skinInject(): { style: string; font: string } {
  const b = H.skin && (SKINS as Record<string, { css: string; font: string }>)[H.skin];
  if (!b) return { style: '', font: '' };
  const font = b.font ? `<link id="sm-skin-font" rel="stylesheet" href="${b.font}">` : '';
  return { style: `<style id="sm-skin" data-skin="${H.skin}">${b.css}</style>`, font };
}
// 换肤就地生效：只替换活预览里的 <style id="sm-skin">（+皮肤字体 <link>），不重建整个 iframe。
// 全量 renderHtmlEdit() 会用 srcdoc 重灌全部幻灯片——大 deck 又慢、又会触发缩放 slide 的合成层
// 发黑。就地换皮则瞬时、无重渲染、不发黑。H.skin 已更新，导出/全量渲染时仍由 skinInject 一致烘焙。
function applySkinLive(): void {
  const ifr = $('#preview') as HTMLIFrameElement;
  const d = ifr && ifr.contentDocument;
  if (!d || !d.head || !d.querySelector('#deck .slide')) { renderHtmlEdit(); return; } // 预览没就绪 → 回退全量
  const anchor = d.getElementById('sm-typo'); // 皮肤 CSS 排在 deck 自身 CSS 之后、typo/FX 之前（与 assembleDeck 一致）
  const b = H.skin && (SKINS as Record<string, { css: string; font: string }>)[H.skin];
  let st = d.getElementById('sm-skin') as HTMLStyleElement | null;
  let fl = d.getElementById('sm-skin-font') as HTMLLinkElement | null;
  if (b) {
    if (!st) { st = d.createElement('style'); st.id = 'sm-skin'; if (anchor) d.head.insertBefore(st, anchor); else d.head.appendChild(st); }
    st.setAttribute('data-skin', H.skin); st.textContent = b.css;
    if (b.font) { if (!fl) { fl = d.createElement('link'); fl.id = 'sm-skin-font'; fl.rel = 'stylesheet'; fl.media = 'print'; fl.onload = function () { (this as HTMLLinkElement).media = 'all'; }; st.parentNode!.insertBefore(fl, st); } fl.href = b.font; }
    else if (fl) { fl.remove(); }
  } else {
    if (st) st.remove();
    if (fl) fl.remove();
  }
}
// 把 render-blocking 的外链字体 <link rel=stylesheet href=fonts.googleapis.com/css…> 改成非阻塞：
// 加 media="print" onload="this.media='all'" —— 浏览器照常后台拉，但不卡屏渲染。没翻墙拉不到时
// 就一直用系统字体兜底，绝不发黑/卡死；拉到了再切回。preconnect/已带 media 的不动。
function nonBlockFonts(html: string): string {
  return html.replace(/<link\b[^>]*fonts\.googleapis\.com\/css[^>]*>/gi, (tag) => {
    if (/\bmedia\s*=/.test(tag)) return tag;
    if (!/\brel\s*=\s*["']?\s*stylesheet/i.test(tag)) return tag;
    return tag.replace(/\s*\/?>\s*$/, ` media="print" onload="this.media='all'">`);
  });
}
// 在**文档真正的**结束标签前插入内容。
//
// 千万别用 String.replace('</body>', …)：那只换首次匹配。一体版 deck 会把整份副屏
// HTML 当字符串存在 JS 里（`window.SM_PRESENTER_HTML = '<!doctype html>…</body></html>'`），
// 那串里就有 </body>，首次匹配会命中**字符串内部**，把脚本拦腰截断。
// 实测后果：dogfood deck 导出后整段脚本报 "Invalid or unexpected token"，
// SM_NOTES / SM_PRESENTER_HTML 全变 undefined → 演讲者模式打开是空的。
//
// 结构决定判据：内嵌的 HTML 字符串一定在 body 里，所以
//   · 文档真正的 </body> 是**最后**一个
//   · 文档真正的 </head> 是 <body 之前的**最后**一个
function insertBeforeBodyEnd(doc: string, s: string): string {
  const i = doc.lastIndexOf('</body>');
  return i < 0 ? doc + s : doc.slice(0, i) + s + doc.slice(i);
}
function insertBeforeHeadEnd(doc: string, s: string): string {
  const bodyAt = doc.search(/<body\b/i);
  const i = doc.lastIndexOf('</head>', bodyAt < 0 ? doc.length : bodyAt);
  return i < 0 ? doc : doc.slice(0, i) + s + doc.slice(i);
}
// 编辑态按键闸门（只注入预览、不进导出件）。
//
// 为什么必须由 Studio 来挡：deck 自带的引擎把空格 / 方向键 / Enter / f o p s / 1-9
// 全占成了翻页与投屏快捷键，而编辑模式下每个文本块都是 contenteditable——用户一打字
// 就翻页、敲个 f 就进全屏。引擎源码已经补了 isTyping 守卫，但**用户手上已经导出的
// deck 还带着老引擎**，改不了那些文件；所以这里在预览里再兜一层。
//
// 手法：document 上的**捕获**监听。捕获永远早于同一节点上的冒泡监听（deck 引擎用的是
// 冒泡），所以不管引擎何时注册都拦得住。只 stopImmediatePropagation、**不** preventDefault
// ——按键照常输入字符、照常移动光标，只是引擎收不到。带 ⌘/Ctrl/Alt 的一律放行，
// 否则会连 Studio 自己的 ⌘S / ⌘Z 一起掐掉。放在 <head> 最前，先于任何 deck 脚本执行。
const EDIT_KEYGUARD_JS = '<script id="sm-edit-keyguard">(function(){'
  // ⌘K / Ctrl+K：焦点常常落在预览里（点过页、放映过），键盘事件不跨 frame——这里代收转给 Studio
  + 'document.addEventListener("keydown",function(e){if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==="k"){e.preventDefault();e.stopImmediatePropagation();try{parent.postMessage({type:"sm-cmdk"},"*");}catch(x){}}},true);'
  + 'function typing(){var a=document.activeElement;'
  + 'return !!(a&&(a.isContentEditable||a.tagName==="INPUT"||a.tagName==="TEXTAREA"||a.tagName==="SELECT"));}'
  + 'document.addEventListener("keydown",function(e){'
  + 'if(e.metaKey||e.ctrlKey||e.altKey)return;'   // ⌘S/⌘Z 等留给 Studio
  + 'if(!typing())return;'                        // 没在打字 → 翻页快捷键照常
  + 'if(e.key==="Escape"){try{document.activeElement.blur();}catch(x){}e.preventDefault();e.stopImmediatePropagation();return;}'
  + 'e.stopImmediatePropagation();'               // 不 preventDefault：字照打、光标照走
  + '},true);'
  + '})();</scr' + 'ipt>\n';
// 一体版 deck 的「演讲者」按钮开副屏用的是 `location.href.split('#')[0] + '#presenter'`
// ——**重开自己**、靠 hash 切成副屏视图。这在 Studio 里会坏掉：预览是 srcdoc iframe，
// 里面的 `location.href` 是 `about:srcdoc`，于是开出来的是 `about:srcdoc#presenter`，
// 一个真正空白的文档 → 症状是「窗口弹出来了，但里面什么都没有」。
// 修法：在预览里包一层 window.open，认出这种自我重开，改成用父窗口给的干净 deck HTML
// 做一个 blob URL 再开。只拦 `about:srcdoc` + 带 hash 这一种，别的（相对路径的
// 三文件版副屏、`window.open('')` + document.write 的打印窗口）一律原样放行。
const PRESENTER_OPEN_FIX_JS = '<script id="sm-presenter-open-fix">(function(){'
  + 'var orig=window.open;'
  + 'window.open=function(url,name,features){'
  + 'var u=url==null?"":String(url);'
  + 'var i=u.indexOf("#");'
  + 'if(u.indexOf("about:srcdoc")===0&&i>=0){'
  + 'var html=null;'
  + 'try{html=window.parent.__SM_PRESENTER_HTML__&&window.parent.__SM_PRESENTER_HTML__();}catch(e){}'
  + 'if(html){try{'
  + 'var b=URL.createObjectURL(new Blob([html],{type:"text/html"}));'
  + 'return orig.call(window,b+u.slice(i),name,features);'
  + '}catch(e){}}'
  + '}'
  + 'return orig.call(window,url,name,features);'
  + '};'
  + '})();</scr' + 'ipt>\n';
/** 预览里要不要显示 deck 自带的段导航。默认不显示，选择记在 localStorage。 */
let deckChromeOn = (() => { try { return localStorage.getItem('sm-deckchrome') === 'on'; } catch { return false; } })();
/**
 * 幻灯片在预览里显示多大，由 deck 自己的 `--fit-scale` 决定，而它的公式是
 * `innerWidth - 300 - 60`——那个 300 是段导航的宽度，**硬编码在 deck 里**。
 * 于是把段导航藏了以后，地方腾出来了，幻灯片却还是老尺寸（白等于没腾）。
 * 这里按同一个公式重算一遍，只把 300 那项按当前开关取舍。
 * 播放态（body.present）归 deck 自己管，别插手。
 */
function refitPreview(): void {
  const ifr = $('#preview') as HTMLIFrameElement | null;
  const w = ifr?.contentWindow, d = ifr?.contentDocument;
  if (!w || !d || !d.documentElement) return;
  if (d.body && d.body.classList.contains('present')) return;
  const availW = w.innerWidth - (deckChromeOn ? 360 : 60);
  const availH = w.innerHeight - 100;
  const scale = Math.max(0.25, Math.min(0.7, availW / 1920, availH / 1080));
  d.documentElement.style.setProperty('--fit-scale', scale.toFixed(4));
}
/** 把选择贴到活预览的 <html> 上——改属性就生效，不用重建预览。 */
function applyDeckChrome(): void {
  const d = ($('#preview') as HTMLIFrameElement | null)?.contentDocument;
  if (d && d.documentElement) d.documentElement.setAttribute('data-sm-deckchrome', deckChromeOn ? 'on' : 'off');
  const b = $('#deckNavTog');
  if (b) { b.classList.toggle('on', deckChromeOn); b.setAttribute('aria-pressed', String(deckChromeOn)); }
  refitPreview();
}
function assembleDeck(forEdit = false): string {
  // 编辑态默认把 deck 自带的段导航（固定 300px + #deck 让出 320px 内边距）藏起来：
  // 左栏那份页面列表做的是同一件事，两套导航并排既占地方又让人不知道该点哪个。
  // 想看缩略图的话顶栏 ▦ 一按就回来——所以这只是默认值，不是砍功能。
  const chromeCss = '<style id="sm-deckchrome-css">'
    + 'html[data-sm-deckchrome="off"] body > #segnav,html[data-sm-deckchrome="off"] body > nav.segnav{display:none!important}'
    + 'html[data-sm-deckchrome="off"] #deck{padding-left:0!important}'
    + 'html[data-sm-deckchrome="off"] body > .hint{display:none!important}'
    // deck 自带顶栏上的按钮（← → 全屏播放 演讲者 提词…）在编辑态和 Studio 自己的顶栏叠成两层，
    // 只留品牌 / 副标题两行文字（它们要能就地改）；放映和演讲者由 Studio 顶栏代劳。
    + 'html[data-sm-deckchrome="off"] body > .topbar > *:not(.topbar__brand):not(.topbar__sub):not(.topbar__spacer){display:none!important}'
    + 'html[data-sm-deckchrome="off"] body > .topbar{justify-content:flex-start}'
    // deck 自己的顶栏是按 1920 宽设计的，塞进编辑预览（约 1000 宽）会每个按钮都折行，
    // 看着像坏了。只在编辑预览里收紧间距 + 不许折行——导出的文件一个字节都不动。
    + 'body > .topbar{gap:10px!important;padding:0 14px!important}'
    + 'body > .topbar > *{white-space:nowrap}'
    + 'body > .topbar .topbar__brand,body > .topbar .topbar__sub{min-width:0;overflow:hidden;text-overflow:ellipsis}'
    + '</style>';
  const editCss = forEdit
    ? chromeCss + '<style id="sm-edit-css">[contenteditable]{cursor:text}'
      + '#deck .slide [contenteditable]:hover{outline:1px dashed rgba(120,120,170,.7);outline-offset:2px}'
      + '#deck .slide [contenteditable]:focus{outline:2px solid #B5402A;outline-offset:2px}'
      + '#deck .slide .sm-sel{outline:2px solid #3a86ff!important;outline-offset:2px}</style>'
    : '';
  const deckInner = htmlSlides.map((s) => s.html).join('\n');
  // load any user-picked Google fonts (those not already linked by the deck author)
  const fontLinks = fontLinksFor(deckInner);
  // FX CSS+JS injected into EVERY assembled deck (preview + export) so entrance anims &
  // motion play offline — the imported deck has no such rules of its own. data-smfx on
  // <html> carries the auto/manual choice into the exported file; data-smfx-edit marks
  // the editing surface so the FX driver skips exit-on-nav (keeps Studio nav instant).
  const editAttr = forEdit ? ' data-smfx-edit="1" data-sm-deckchrome="' + (deckChromeOn ? 'on' : 'off') + '"' : '';
  const skin = skinInject();
  const keyGuard = forEdit ? EDIT_KEYGUARD_JS + PRESENTER_OPEN_FIX_JS : '';
  let doc = `<!DOCTYPE html>\n<html ${htmlOpenTag()} data-smfx="${fxMode}"${editAttr}>\n<head>\n${keyGuard}${H.head}${skin.font}${skin.style}${fontLinks}${TYPO_CSS}${NOTES_CSS}${FX_CSS}${PRESENT_FIX_CSS}${editCss}\n</head>\n<body class="${H.bodyClass}">\n${H.prelude}\n<div class="deck" id="deck">\n${deckInner}\n</div>\n${H.trailing}\n${FX_JS}\n${FX_CANVAS_JS}\n</body>\n</html>`;
  // 手机遥控：先剥离任何旧注入（幂等，防 re-import 累积），再按需（仅导出、勾选时）烘进。
  // 注意：注入内容含 `$`（qr 库/客户端里有），必须用「函数替换」——字符串替换会把 $'/$&/$1 当特殊
  // 记号解释，导致注入的 JS 被腐蚀（曾致「二维码生成失败」）。
  //
  // **房间号沿用旧的**（除非用户勾了「换新房间号」）。房间号就是配对凭证，烘死在文件里，
  // 手机扫过一次就记住了。每导出一次就换一个的话，同一份 deck 迭代五版就要重扫五次码——
  // 而且忘了重扫的表现极其难认：手机连的是旧房间，手表照样有内容（老 deck 的兜底提词），
  // 只是**和你刚生成的那套对不上**。真要换号勾一下即可。
  const inheritedRoom = (/window\.__SM_ROOM__\s*=\s*"([^"]+)"/.exec(doc) || [])[1] || '';
  const inheritedDeckId = (/window\.__SM_DECK_ID__\s*=\s*"([^"]+)"/.exec(doc) || [])[1] || '';
  doc = doc.replace(/<!--sm-phone-remote-start-->[\s\S]*?<!--sm-phone-remote-end-->/g, '');
  if (!forEdit && embedPhoneRemote) {
    // 房间号 = 配对凭证（烘死 → 二维码永久不变）；deck id = 广播频道名，保证同一台
    // 电脑上同时开着的两份 deck 不会串台（BroadcastChannel 按同源+频道名广播）。
    const room = (!newRoomOnExport && inheritedRoom) ? inheritedRoom : smRoomId();
    const deckId = (!newRoomOnExport && inheritedDeckId) ? inheritedDeckId : ('sm-' + smRoomId().slice(0, 12));
    const inject = PHONE_REMOTE_JS
      .replace('__SM_RELAYVAL__', relayUrl())
      .replace('__SM_ROOMVAL__', room)
      .replace('__SM_DECKIDVAL__', deckId)
      .replace('__SM_PASSLINE__', remotePassHash ? `window.__SM_PASS__="${remotePassHash}";` : '');
    doc = insertBeforeBodyEnd(doc, inject + '\n');
    lastExportRoom = room;
  }
  // 编辑预览：把外链 Google Fonts 改成「非阻塞」加载，否则没翻墙时浏览器会卡在 fonts.googleapis.com
  // 等渲染 →「加载特别慢 / 看不到 slides / 换肤黑屏」。文字先用系统字体即时显示，字体到了再升级。
  return forEdit ? nonBlockFonts(doc) : doc;
}
// <link> tags for user-picked Google fonts that the deck author didn't already include.
// Detected from usedFontIds plus a scan of the deck HTML (so a re-imported deck that
// carries inline font-family but lost its <link> still loads). Returns '' when none.
function fontLinksFor(deckHtml: string): string {
  const ids = new Set<string>(usedFontIds);
  FONTS.forEach((f) => { if (f.google && f.family && deckHtml.indexOf(f.family) >= 0) ids.add(f.id); });
  const head = H.head || '';
  const hasGoogle = /fonts\.googleapis\.com/.test(head);
  const fams: string[] = [];
  ids.forEach((id) => {
    const f = FONT_BY_ID[id]; if (!f || !f.google) return;
    // skip only if the deck author already loads this family from Google Fonts
    if (hasGoogle && (head.indexOf(f.family.replace(/ /g, '+')) >= 0 || head.indexOf(f.family) >= 0)) return;
    fams.push(f.google);
  });
  if (!fams.length) return '';
  return '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=' + fams.join('&family=') + '&display=swap">';
}
// Typography polish injected into every assembled deck (imported or rendered): balance
// headings so they don't drop a lonely word onto a second line, and prettify body text
// so paragraphs/lists avoid orphan last-line words. Native CSS, degrades silently on old
// browsers, no-op on single-line text. Targets generic tags + the Deck-Contract classes.
// 播放（present）态的布局修复。**deck 模板里那条规则在所有笔记本上都是坏的**，
// 而存量 deck 把它烤死在自己的 <style> 里了 —— 所以这份修复要注进每一次 assemble
// （预览和导出都要），用户手上已有的 deck 一存 / 一导出就跟着修好。
//
// 坏在哪：`body.present .slide` 用 `transform:scale(var(--sc))` 缩放，**但 transform
// 不改布局尺寸** —— 盒子在布局上仍是 1920×1080。屏幕只要比 1920×1080 小（＝所有笔记本），
// `.deck` 就被撑出滚动条；而 flex 居中的溢出是两边对称的，右边能滚到、**左边那一截
// 滚都滚不回来**。实测 1728×899：文档 1824×1080，横向溢出 96px、纵向 181px，幻灯片
// 视觉顶端在 -82px。用户看到的就是「播放时一大片黑、画面偏出去、手动拉回来、翻下一页又偏」。
// 修法：用负 margin 把布局盒子收回到视觉尺寸。
const PRESENT_FIX_CSS = '<style id="sm-present-fix">'
  + 'body.present .slide{margin:calc((1080px * var(--sc,1) - 1080px) / 2) calc((1920px * var(--sc,1) - 1920px) / 2)}'
  + '</style>';
const TYPO_CSS = '<style id="sm-typo">'
  + '#deck .slide h1,#deck .slide h2,#deck .slide h3,#deck .slide h4,#deck .slide .title,#deck .slide .cover__title,#deck .slide .secdiv__title,#deck .slide .manifesto__title,#deck .slide .insight__statement,#deck .slide .head__title,#deck .slide blockquote{text-wrap:balance}'
  + '#deck .slide p,#deck .slide li,#deck .slide .cover__sub,#deck .slide .card__desc,#deck .slide .sub{text-wrap:pretty}'
  + '</style>';
// FX: one-shot ENTRANCE animations (data-anim) + continuous MOTION (data-motion),
// ported from the runtime so they play in any imported/exported deck (which has no
// such rules of its own). Gated by FX_JS via slide classes so we get auto-on-show
// vs click-to-play. Respect prefers-reduced-motion.
//  - auto  (default): a slide gets .sm-play when it becomes active → entrance plays once, motion loops.
//  - manual: a slide gets .sm-armed (entrance hidden, motion paused) until the viewer clicks → .sm-play.
// 演讲者备注：写在 slide 里的 <aside class="notes">，**永远不给观众看**。
// 预览和导出件都注入这条——漏出去就是事故（观众看到你的提词）。手机遥控客户端
// 会把这些备注收集起来现造一份讲稿推到 iPad/手机，那才是它们该出现的地方。
const NOTES_CSS = '<style id="sm-notes">#deck .slide aside.notes,#deck .slide .notes,'
  + '#deck .slide [data-notes]{display:none!important}</style>';
const FX_CSS = '<style id="sm-fx">'
  // continuous MOTION — assigned always; auto runs immediately, manual stays paused until played
  + '#deck .slide [data-motion]{will-change:transform,opacity,filter}'
  + '#deck .slide [data-motion="glow"]{animation:sm-m-glow 3.2s ease-in-out infinite}'
  + '#deck .slide [data-motion="breathe"]{animation:sm-m-breathe 3.6s ease-in-out infinite;transform-origin:center}'
  + '#deck .slide [data-motion="float"]{animation:sm-m-float 3.4s ease-in-out infinite}'
  + '#deck .slide [data-motion="pulse"]{animation:sm-m-pulse 2s ease-in-out infinite}'
  + '#deck .slide [data-motion="neon"]{animation:sm-m-neon 5.5s linear infinite}'
  + '#deck .slide [data-motion="stress"]{animation:sm-m-stress 4.2s ease-in-out infinite;transform-origin:center}'
  + '#deck .slide [data-motion="shimmer"]{will-change:background-position;background:linear-gradient(125deg,#ff6eb4 0%,#ffb347 8%,#ffe46e 16%,#7bf0ff 24%,#a855f7 32%,#f4b73e 40%,#ff6eb4 48%,#06b6d4 56%,#a855f7 64%,#ffb347 72%,#7bf0ff 80%,#ff6eb4 90%,#f4b73e 100%);background-size:600% 600%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:sm-m-shimmer 6s ease-in-out infinite}'
  + 'html[data-smfx="manual"] #deck .slide [data-motion]{animation-play-state:paused}'
  + 'html[data-smfx="manual"] #deck .slide.sm-play [data-motion]{animation-play-state:running}'
  // one-shot ENTRANCE — element is normally visible; only hidden while armed/playing, then animates in
  + '#deck .slide.sm-armed [data-anim]{opacity:0}'
  + '#deck .slide.sm-play [data-anim]{opacity:0;animation-fill-mode:both;animation-duration:.55s;animation-timing-function:cubic-bezier(.16,1,.3,1)}'
  + '#deck .slide.sm-play [data-anim="fade"]{animation-name:sm-a-fade;animation-duration:.5s}'
  + '#deck .slide.sm-play [data-anim="rise"]{animation-name:sm-a-rise}'
  + '#deck .slide.sm-play [data-anim="fade-up"]{animation-name:sm-a-rise}'
  + '#deck .slide.sm-play [data-anim="pop"]{animation-name:sm-a-pop;animation-duration:.5s}'
  + '#deck .slide.sm-play [data-anim="in-left"]{animation-name:sm-a-in-left}'
  + '#deck .slide.sm-play [data-anim="in-right"]{animation-name:sm-a-in-right}'
  + '#deck .slide.sm-play [data-anim="counter-up"]{animation-name:sm-a-fade;animation-duration:.5s}'
  + '#deck .slide.sm-play [data-anim="morph"]{animation-name:sm-a-pop;animation-duration:.6s}'
  // stagger-list — the list itself stays visible; its items rise one after another
  + '#deck .slide.sm-armed [data-anim="stagger-list"]{opacity:1}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]{opacity:1;animation:none}'
  + '#deck .slide.sm-armed [data-anim="stagger-list"]>li{opacity:0}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li{opacity:0;animation:sm-a-rise .5s cubic-bezier(.16,1,.3,1) both}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(2){animation-delay:.07s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(3){animation-delay:.14s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(4){animation-delay:.21s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(5){animation-delay:.28s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(6){animation-delay:.35s}'
  + '#deck .slide.sm-play [data-anim="stagger-list"]>li:nth-child(n+7){animation-delay:.42s}'
  // one-shot EXIT — plays on the leaving slide (FX_JS keeps it visible long enough)
  + '#deck .slide.sm-exit [data-anim-out]{animation-fill-mode:both;animation-duration:.42s;animation-timing-function:cubic-bezier(.4,0,.2,1)}'
  + '#deck .slide.sm-exit [data-anim-out="fade-out"]{animation-name:sm-o-fade}'
  + '#deck .slide.sm-exit [data-anim-out="sink"]{animation-name:sm-o-sink}'
  + '#deck .slide.sm-exit [data-anim-out="zoom-out"]{animation-name:sm-o-zoom}'
  + '#deck .slide.sm-exit [data-anim-out="out-left"]{animation-name:sm-o-left}'
  + '#deck .slide.sm-exit [data-anim-out="out-right"]{animation-name:sm-o-right}'
  // entrance keyframes
  + '@keyframes sm-a-fade{from{opacity:0}to{opacity:1}}'
  + '@keyframes sm-a-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-in-left{from{opacity:0;transform:translateX(-48px)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-in-right{from{opacity:0;transform:translateX(48px)}to{opacity:1;transform:none}}'
  // motion keyframes
  + '@keyframes sm-m-glow{0%,100%{filter:drop-shadow(0 0 1px transparent)}50%{filter:drop-shadow(0 0 16px var(--accent,#F4B73E))}}'
  + '@keyframes sm-m-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}'
  + '@keyframes sm-m-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}'
  + '@keyframes sm-m-pulse{0%,100%{opacity:1}50%{opacity:.55}}'
  + '@keyframes sm-m-neon{0%,16%,18%,55%,57%,100%{opacity:1}17%,56%{opacity:.7}80%,82%{opacity:.88}}'
  + '@keyframes sm-m-stress{0%,38%,100%{transform:scale(1)}45%{transform:scale(1.06)}}'
  + '@keyframes sm-m-shimmer{0%{background-position:0% 30%}33%{background-position:80% 65%}66%{background-position:40% 90%}100%{background-position:0% 30%}}'
  // exit keyframes
  + '@keyframes sm-o-fade{from{opacity:1}to{opacity:0}}'
  + '@keyframes sm-o-sink{from{opacity:1;transform:none}to{opacity:0;transform:translateY(44px)}}'
  + '@keyframes sm-o-zoom{from{opacity:1;transform:none}to{opacity:0;transform:scale(.86)}}'
  + '@keyframes sm-o-left{from{opacity:1;transform:none}to{opacity:0;transform:translateX(-64px)}}'
  + '@keyframes sm-o-right{from{opacity:1;transform:none}to{opacity:0;transform:translateX(64px)}}'
  // ── 动画库新增（集众家所长）：新入场 + 强调 + 点睛 ──
  + '#deck .slide.sm-play{perspective:1400px}'
  + '#deck .slide.sm-play [data-anim="tracking-in"]{animation-name:sm-a-tracking;animation-duration:.8s}'
  + '#deck .slide.sm-play [data-anim="focus-in"]{animation-name:sm-a-focus;animation-duration:.7s}'
  + '#deck .slide.sm-play [data-anim="slide-blur"]{animation-name:sm-a-slideblur;animation-duration:.55s}'
  + '#deck .slide.sm-play [data-anim="flip-in"]{animation-name:sm-a-flip;animation-duration:.7s}'
  + '#deck .slide.sm-play [data-anim="back-in"]{animation-name:sm-a-back;animation-duration:.7s}'
  + '@keyframes sm-a-tracking{0%{opacity:0;letter-spacing:-.42em;filter:blur(6px)}40%{opacity:1}100%{opacity:1;letter-spacing:normal;filter:none}}'
  + '@keyframes sm-a-focus{from{opacity:0;filter:blur(14px)}to{opacity:1;filter:none}}'
  + '@keyframes sm-a-slideblur{from{opacity:0;transform:translateX(-64px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}'
  + '@keyframes sm-a-flip{from{opacity:0;transform:rotateY(88deg)}to{opacity:1;transform:none}}'
  + '@keyframes sm-a-back{from{opacity:0;transform:translateY(96px) scale(.86)}to{opacity:1;transform:none}}'
  // 强调（一次性，元素本身可见，翻到本页时做个手势）
  + '#deck .slide.sm-play [data-emph]{animation-fill-mode:both;animation-duration:.9s}'
  + '#deck .slide.sm-play [data-emph="tada"]{animation-name:sm-e-tada}'
  + '#deck .slide.sm-play [data-emph="rubber-band"]{animation-name:sm-e-rubber}'
  + '#deck .slide.sm-play [data-emph="jello"]{animation-name:sm-e-jello;transform-origin:center}'
  + '#deck .slide.sm-play [data-emph="heartbeat"]{animation-name:sm-e-heart;animation-duration:1.3s}'
  + '#deck .slide.sm-play [data-emph="headshake"]{animation-name:sm-e-head;animation-duration:.8s}'
  + '#deck .slide.sm-play [data-emph="shake"]{animation-name:sm-e-shake;animation-duration:.7s}'
  + '#deck .slide.sm-play [data-emph="text-pop"]{animation-name:sm-e-textpop;animation-duration:.6s}'
  + '@keyframes sm-e-tada{0%{transform:scale(1)}10%,20%{transform:scale(.9) rotate(-3deg)}30%,50%,70%,90%{transform:scale(1.1) rotate(3deg)}40%,60%,80%{transform:scale(1.1) rotate(-3deg)}100%{transform:scale(1)}}'
  + '@keyframes sm-e-rubber{0%{transform:scale(1)}30%{transform:scaleX(1.25) scaleY(.75)}40%{transform:scaleX(.75) scaleY(1.25)}50%{transform:scaleX(1.15) scaleY(.85)}65%{transform:scaleX(.95) scaleY(1.05)}75%{transform:scaleX(1.05) scaleY(.95)}100%{transform:scale(1)}}'
  + '@keyframes sm-e-jello{0%,11%,100%{transform:none}22%{transform:skewX(-12deg) skewY(-12deg)}33%{transform:skewX(6deg) skewY(6deg)}44%{transform:skewX(-3deg) skewY(-3deg)}55%{transform:skewX(1.5deg) skewY(1.5deg)}66%{transform:skewX(-.8deg) skewY(-.8deg)}}'
  + '@keyframes sm-e-heart{0%,40%,80%,100%{transform:scale(1)}14%{transform:scale(1.22)}28%{transform:scale(1)}54%{transform:scale(1.22)}}'
  + '@keyframes sm-e-head{0%{transform:translateX(0)}12.5%{transform:translateX(-7px) rotateY(-9deg)}37.5%{transform:translateX(6px) rotateY(7deg)}62.5%{transform:translateX(-4px) rotateY(-5deg)}87.5%{transform:translateX(2px) rotateY(3deg)}100%{transform:translateX(0)}}'
  + '@keyframes sm-e-shake{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-9px)}20%,40%,60%,80%{transform:translateX(9px)}}'
  + '@keyframes sm-e-textpop{from{text-shadow:0 0 0 rgba(0,0,0,0);transform:none}to{text-shadow:0 6px 18px rgba(0,0,0,.28);transform:translateY(-4px)}}'
  // 点睛：Ken Burns / 线条自绘 / 擦幕 / 聚光灯
  + '#deck .slide [data-motion="ken-burns"],#deck .slide .smfx-kenburns img{animation:sm-kenburns 18s ease-in-out infinite alternate;transform-origin:center}'
  + '@keyframes sm-kenburns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.12) translate(-2%,-2%)}}'
  + '#deck .slide .smfx-draw path,#deck .slide .smfx-draw line,#deck .slide .smfx-draw polyline{stroke-dasharray:1;stroke-dashoffset:1}'
  + '#deck .slide.sm-play .smfx-draw path,#deck .slide.sm-play .smfx-draw line,#deck .slide.sm-play .smfx-draw polyline{animation:sm-draw 1.2s cubic-bezier(.4,0,.2,1) forwards}'
  + '@keyframes sm-draw{to{stroke-dashoffset:0}}'
  + '#deck .slide.sm-play [data-anim="clip-wipe"],#deck .slide.sm-play .smfx-wipe{animation:sm-wipe .8s cubic-bezier(.4,0,.2,1) both}'
  + '@keyframes sm-wipe{from{opacity:1;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}'
  + '#deck .slide.sm-play .smfx-spot>:not([data-focus]){opacity:.22;filter:saturate(.4);transition:opacity .4s,filter .4s}'
  + '#deck .slide.sm-play .smfx-spot>[data-focus]{transform:scale(1.04)}'
  // ── 移植自 transitions.dev（自有实现，按放映态重写）：A5 数字弹入 / A12 多行浮现 / H8 成功对勾 ──
  // A5 数字弹入：容器可见，逐字 .smfx-ch（FX_JS 的 play() 自动拆字）错落带模糊滑入
  + '#deck .slide.sm-armed [data-anim="num-pop"],#deck .slide.sm-play [data-anim="num-pop"]{opacity:1;animation:none}'
  + '#deck .slide.sm-armed [data-anim="num-pop"] .smfx-ch{display:inline-block;opacity:0}'
  + '#deck .slide.sm-play [data-anim="num-pop"] .smfx-ch{display:inline-block;opacity:0;animation:sm-a-numpop .7s cubic-bezier(.34,1.5,.5,1) both;animation-delay:calc(var(--i,0)*.07s)}'
  + '@keyframes sm-a-numpop{from{opacity:0;transform:translateY(.5em);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}'
  // A12 多行浮现：容器可见，每个直接子元素依次带模糊上浮
  + '#deck .slide.sm-armed [data-anim="texts-reveal"],#deck .slide.sm-play [data-anim="texts-reveal"]{opacity:1;animation:none}'
  + '#deck .slide.sm-armed [data-anim="texts-reveal"]>*{opacity:0}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*{opacity:0;animation:sm-a-textsrev .5s cubic-bezier(.16,1,.3,1) both}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(2){animation-delay:.1s}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(3){animation-delay:.2s}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(4){animation-delay:.3s}'
  + '#deck .slide.sm-play [data-anim="texts-reveal"]>*:nth-child(n+5){animation-delay:.4s}'
  + '@keyframes sm-a-textsrev{from{opacity:0;transform:translateY(.55em);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}'
  // H8 成功对勾：圆环弹入 + 对勾描线（复用 sm-draw）
  + '#deck .slide.sm-armed .smfx-check{opacity:0}'
  + '#deck .slide.sm-play .smfx-check{display:inline-block;animation:sm-check-in .72s cubic-bezier(.34,1.5,.5,1) both}'
  + '#deck .slide .smfx-check svg{overflow:visible}'
  + '#deck .slide .smfx-check .smfx-check-tick{stroke-dasharray:1;stroke-dashoffset:1}'
  + '#deck .slide.sm-play .smfx-check .smfx-check-tick{animation:sm-draw .5s cubic-bezier(.4,0,.2,1) .2s forwards}'
  + '@keyframes sm-check-in{0%{opacity:0;transform:scale(.6) rotate(-12deg)}60%{opacity:1;transform:scale(1.08) rotate(2deg)}100%{opacity:1;transform:scale(1) rotate(0)}}'
  + '@media(prefers-reduced-motion:reduce){#deck .slide [data-motion],#deck .slide [data-anim],#deck .slide [data-anim] *,#deck .slide [data-anim-out],#deck .slide [data-emph],#deck .slide .smfx-draw path,#deck .slide .smfx-check,#deck .slide .smfx-check .smfx-check-tick{animation:none!important;opacity:1!important;letter-spacing:normal!important;filter:none!important;stroke-dashoffset:0!important}}'
  + '</style>';
// FX driver — injected into preview + export. Watches which slide is active and, per
// data-smfx mode, plays it (auto) or arms it for a click (manual). Exposes window hooks
// so the Studio's ▶ button / mode switch can drive it live without a re-render.
const FX_JS = '<script id="sm-fx-js">(function(){'
  + 'var root=document.documentElement;var deck=document.getElementById("deck");if(!deck)return;'
  + 'function mode(){return root.getAttribute("data-smfx")||"auto";}'
  + 'function reduce(){try{return matchMedia("(prefers-reduced-motion:reduce)").matches;}catch(e){return false;}}'
  + 'function active(){return deck.querySelector(".slide.active")||deck.querySelector(".slide");}'
  + 'function arm(s){if(!s)return;splitNum(s);s.classList.remove("sm-play");s.classList.add("sm-armed");}'
  // A5 数字弹入：把 [data-anim="num-pop"] 文本拆成逐字 .smfx-ch（带 --i 序号），只拆一次
  + 'function splitNum(s){try{s.querySelectorAll(\'[data-anim="num-pop"]:not([data-smfx-split])\').forEach(function(el){var t=el.textContent;el.setAttribute("data-smfx-split","1");el.textContent="";var i=0;t.split("").forEach(function(ch){if(ch===" "){el.appendChild(document.createTextNode(" "));return;}var sp=document.createElement("span");sp.className="smfx-ch";sp.style.setProperty("--i",i++);sp.textContent=ch;el.appendChild(sp);});});}catch(e){}}'
  + 'function play(s){if(!s)return;splitNum(s);s.classList.remove("sm-play");s.classList.remove("sm-armed");void s.offsetWidth;s.classList.add("sm-play");}'
  + 'function onShow(s){if(!s)return;if(mode()==="manual"){arm(s);}else{play(s);}}'
  + 'window.__SM_FX_PLAY__=function(){play(active());};'
  + 'window.__SM_FX_REARM__=function(){onShow(active());};'
  // EXIT: keep the leaving slide visible while [data-anim-out] elements animate out
  + 'var EXIT_MS=440,exiting=false,bypass=false;'
  + 'function hasExit(s){return !!(s&&s.querySelector("[data-anim-out]"));}'
  + 'function runExit(s,done){if(!s){done&&done();return;}s.classList.remove("sm-exit");void s.offsetWidth;s.classList.add("sm-exit");setTimeout(function(){s.classList.remove("sm-exit");done&&done();},EXIT_MS);}'
  + 'window.__SM_FX_PLAY_OUT__=function(){runExit(active());};'
  + 'deck.addEventListener("click",function(){if(mode()!=="manual")return;var s=active();if(s&&s.classList.contains("sm-armed"))play(s);},true);'
  // intercept presentation nav so the exit plays first, then replay the event for the deck engine.
  // skipped while editing in Studio (data-smfx-edit) so navigating stays instant.
  + 'if(root.getAttribute("data-smfx-edit")!=="1"){'
  + 'var NAVK={ArrowRight:1,ArrowDown:1,PageDown:1,Enter:1," ":1,ArrowLeft:1,ArrowUp:1,PageUp:1,Backspace:1,Home:1,End:1};'
  + 'function isNav(e){return NAVK[e.key]===1||/^[1-9]$/.test(e.key);}'
  + 'document.addEventListener("keydown",function(e){'
  + 'if(bypass){bypass=false;return;}'
  + 'if(!isNav(e)||reduce())return;'
  + 'if(exiting){e.preventDefault();e.stopImmediatePropagation();return;}'
  + 'var cur=active();if(!hasExit(cur))return;'
  + 'e.preventDefault();e.stopImmediatePropagation();exiting=true;'
  + 'runExit(cur,function(){exiting=false;bypass=true;try{document.dispatchEvent(new KeyboardEvent("keydown",{key:e.key,code:e.code,bubbles:true,cancelable:true}));}catch(x){bypass=false;}});'
  + '},true);'
  + 'document.addEventListener("click",function(e){'
  + 'var btn=e.target&&e.target.closest&&e.target.closest("[data-act=\\"next\\"],[data-act=\\"prev\\"]");if(!btn)return;'
  + 'if(bypass){bypass=false;return;}if(reduce())return;'
  + 'if(exiting){e.preventDefault();e.stopImmediatePropagation();return;}'
  + 'var cur=active();if(!hasExit(cur))return;'
  + 'e.preventDefault();e.stopImmediatePropagation();exiting=true;'
  + 'runExit(cur,function(){exiting=false;bypass=true;try{btn.click();}catch(x){bypass=false;}});'
  + '},true);}'
  + 'var last=null;function tick(){var s=active();if(s&&s!==last){last=s;onShow(s);}}'
  + 'try{new MutationObserver(tick).observe(deck,{attributes:true,subtree:true,attributeFilter:["class"]});}catch(e){}'
  + 'setTimeout(tick,60);setTimeout(tick,400);'
  + '})();</scr' + 'ipt>';
// Canvas FX engine (J · Canvas 特效). Self-contained IIFE with its own MutationObserver that
// boots data-fx effects on the active slide and tears them down on leave — so background canvas
// effects run in the Studio preview AND the exported deck, exactly like a built editorial deck.
// srcdoc re-render swaps the whole document, so the old canvas rAF dies with it (no leak).
const FX_CANVAS_JS = '<script id="sm-fx-canvas">' + fxCanvasJs + '</scr' + 'ipt>';

// 「手机遥控」注入块（仅导出、且勾选时）：配置(云中转地址) + 浏览器二维码库 + 配对客户端。
// 用 HTML 注释作首尾标记，assembleDeck 每次导出先剥离旧的再按需注入，避免 re-import 后重复。
// __SM_ROOM__ 占位符在导出时被替换成一个固定房间号（每份导出各一个），使这份 HTML 的配对二维码永久不变。
const PHONE_REMOTE_JS =
  '<!--sm-phone-remote-start-->\n'
  + '<script>window.__SM_CLOUD_RELAY__="__SM_RELAYVAL__";window.__SM_ROOM__="__SM_ROOMVAL__";'
  + 'window.__SM_DECK_ID__="__SM_DECKIDVAL__";__SM_PASSLINE__</scr' + 'ipt>\n'
  + '<script>' + qrLibJs + '</scr' + 'ipt>\n'
  + '<script>' + pairClientJs + '</scr' + 'ipt>\n'
  + '<!--sm-phone-remote-end-->';
// 生成一个固定房间号（浏览器内），烘进导出件 → 二维码永久不变、可截图复用。
