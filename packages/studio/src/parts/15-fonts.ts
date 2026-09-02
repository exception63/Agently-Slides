// ---- offline-portable export: inline used Google fonts as subset @font-face data URIs ----
function embedFontsChecked(): boolean { return !!($('#embedFonts') as HTMLInputElement | null)?.checked; }
// 「嵌入字体」默认开：不嵌的导出件靠外链 Google Fonts，墙内打不开（6-29 那次黑屏的另一半）。
// 子集化 + 只嵌用到的字重之后代价已经很小。用户改过就记住他的选择。
function initEmbedFontsToggle(): void {
  const ck = $('#embedFonts') as HTMLInputElement | null; if (!ck) return;
  let saved: string | null = null; try { saved = localStorage.getItem('sm-embed-fonts'); } catch { /* noop */ }
  ck.checked = saved === null ? true : saved === '1';
  ck.addEventListener('change', () => { try { localStorage.setItem('sm-embed-fonts', ck.checked ? '1' : '0'); } catch { /* noop */ } });
}
// every character the deck actually shows → we only download those glyphs (CJK stays tiny)
function deckChars(): string {
  const raw = htmlSlides.map((s) => s.html).join(' ').replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ');
  const set = new Set<string>();
  for (const ch of raw) if (ch.charCodeAt(0) > 32) set.add(ch);
  for (let c = 32; c < 127; c++) set.add(String.fromCharCode(c)); // keep ASCII so numbers/punct render
  return Array.from(set).join('');
}
function abToBase64(buf: ArrayBuffer): string {
  let bin = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(bin);
}
// fetch with a hard timeout so an offline/slow embed fails fast instead of hanging
async function fetchTimeout(url: string, ms = 8000): Promise<Response> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); }
}
// fetch a Google Fonts CSS (subset to deckChars) and inline every gstatic woff2 as a data URI.
// woff2 files are downloaded in PARALLEL (Promise.all) — embedding a CJK family is many faces.
async function inlineGoogleCss(cssUrl: string, chars: string): Promise<string> {
  const url = cssUrl.replace(/&amp;/g, '&') + '&text=' + encodeURIComponent(chars);
  const css = await (await fetchTimeout(url)).text();
  const urls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)).map((m) => m[1]);
  const pairs = await Promise.all(urls.map(async (u) => {
    try { return [u, 'data:font/woff2;base64,' + abToBase64(await (await fetchTimeout(u)).arrayBuffer())]; }
    catch { return [u, u]; } // leave remote if a single file fails
  }));
  let out = css;
  for (const [orig, rep] of pairs) if (orig !== rep) out = out.split(orig).join(rep);
  return out;
}
// ---- 只嵌 deck 真正用到的字重 ----
// 实测一份 44 页 deck 嵌了 3.9 MB 字体：Noto Sans SC 四个字重各 400 KB、Serif 三个字重各 260 KB，
// 而正文只用到其中两三个。皮肤的 Google Fonts 链接是「一族全要」写死的，这里按预览里
// **实际渲染出来**的（字族, 字重）过滤——从 iframe 的 computedStyle 读，不猜。
function usedFontWeights(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  try {
    const doc = ($('#preview') as HTMLIFrameElement).contentDocument; if (!doc) return used;
    const all = doc.querySelectorAll('#deck *, body > .topbar *');
    for (const el of Array.from(all)) {
      if (!(el as HTMLElement).textContent?.trim()) continue;
      const cs = doc.defaultView!.getComputedStyle(el);
      const fam = (cs.fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
      if (!fam) continue;
      let w = cs.fontWeight; if (w === 'normal') w = '400'; else if (w === 'bold') w = '700';
      if (!used.has(fam)) used.set(fam, new Set());
      used.get(fam)!.add(w);
    }
  } catch { /* 跨域或还没渲染好：返回空表 = 不过滤，宁多勿缺 */ }
  return used;
}
/** 把 css2 URL 里每个 family 的 wght 列表过滤到实际用到的；解析不了的原样放过。 */
function trimGoogleCssUrl(cssUrl: string, used: Map<string, Set<string>>): string {
  if (!used.size) return cssUrl;
  return cssUrl.replace(/family=([^&]+)/g, (whole, spec: string) => {
    const [famRaw, axes] = decodeURIComponent(spec.replace(/\+/g, ' ')).split(':');
    const want = used.get(famRaw);
    if (!want || !axes || !/wght@/.test(axes)) return whole;
    const [axisNames, list] = axes.split('@');
    const names = axisNames.split(',');
    const wi = names.indexOf('wght'); if (wi < 0) return whole;
    const kept = list.split(';').filter((tuple) => want.has(tuple.split(',')[wi]));
    if (!kept.length) return whole; // 一个都没匹配上（比如可变字重）→ 别删，保持原样
    return 'family=' + encodeURIComponent(famRaw).replace(/%20/g, '+') + ':' + axisNames + '@' + kept.join(';');
  });
}
// rewrite an assembled deck so every Google font becomes a self-contained @font-face block
async function embedFonts(html: string, used: Map<string, Set<string>> = usedFontWeights()): Promise<string> {
  // gather Google Fonts CSS URLs from both <link> tags and @import rules
  const urls = new Set<string>();
  for (const m of html.matchAll(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"[^>]*>/g)) urls.add(m[1]);
  for (const m of html.matchAll(/@import\s+url\((['"]?)(https:\/\/fonts\.googleapis\.com\/css2[^'")]+)\1\)/g)) urls.add(m[2]);
  if (!urls.size) return dedupeFontFaces(html);
  const chars = deckChars();
  // all font families resolved in parallel (each also parallelizes its woff2 downloads)
  const faces = await Promise.all(Array.from(urls).map((u) => inlineGoogleCss(trimGoogleCssUrl(u, used), chars)));
  const out = html
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, '') // drop remote links/preconnects
    .replace(/@import\s+url\((['"]?)https:\/\/fonts\.googleapis\.com\/css2[^'")]+\1\)\s*;?/g, '') // and @imports
    ;
  return dedupeFontFaces(insertBeforeHeadEnd(out, '<style id="sm-embedded-fonts">\n' + faces.join('\n') + '\n</style>\n'));
}
// 同一份 @font-face 出现两遍（导出过的 deck 再走一遍一体版缝合就会这样）——实测一份 deck 里
// 白白多了 1.9 MB。按整块字面去重，一个字节不同就当两块。
function dedupeFontFaces(html: string): string {
  const seen = new Set<string>();
  return html.replace(/@font-face\s*\{[^}]*\}/g, (blk) => { if (seen.has(blk)) return ''; seen.add(blk); return blk; });
}
// the bytes we save/download: assembled deck, optionally with fonts inlined for offline use
async function buildExportHtml(): Promise<string> {
  const used = usedFontWeights();     // 先量，再装配——装配时预览若重绘，量到的就是回退字体
  const html = exportHtmlDeck();
  if (!embedFontsChecked()) return html;
  setBusy('正在下载并嵌入字体子集，首次稍慢…');
  try { const out = await embedFonts(html, used); setBusy(null); toast('已嵌入字体，离线可用'); return out; }
  catch (e) { setBusy(null); toast('嵌入字体失败（要能连上 Google Fonts），这次按不嵌字体导出。不想每次等可在 ⚙ 里关掉「嵌入字体」：' + (e as Error).message, true); return html; }
}

