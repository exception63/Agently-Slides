import { deriveAnchors, deriveSlideMeta, slideTitle, DEFAULT_LAYOUT } from '@slidesmith/ir';
import type { Deck, Slide, Block, Style, Build, NoteBlock } from '@slidesmith/ir';
import { getTheme, allThemes } from '@slidesmith/themes';
import {
  coreCss,
  runtimeJs,
  transcriptCss,
  transcriptJs,
  presenterCss,
  presenterJs,
} from '@slidesmith/runtime';
import { escapeHtml, inlineMd } from './inline';

export interface RenderOptions {
  theme?: string;
  /** URL the presenter iframe loads (transcript.html). Defaults by convention. */
  transcriptUrl?: string;
  /** URL the deck opens for the presenter view. Defaults by convention. */
  presenterUrl?: string;
}

function styleClasses(style?: Style): string {
  if (!style) return '';
  const c: string[] = [];
  if (style.color) c.push(`c-${style.color}`);
  if (style.size) c.push(`fs-${style.size}`);
  if (style.align) c.push(`al-${style.align}`);
  if (style.weight) c.push(`w-${style.weight}`);
  return c.join(' ');
}

function buildAttrs(build?: Build): string {
  if (!build) return '';
  const a: string[] = [];
  if (build.anim) a.push(`data-anim="${build.anim}"`);
  if (build.motion && build.motion !== 'none') a.push(`data-motion="${build.motion}"`);
  if (build.mode) a.push(`data-anim-mode="${build.mode}"`);
  if (build.delay != null) a.push(`data-anim-delay="${build.delay}"`);
  if (build.stagger != null) a.push(`data-anim-stagger="${build.stagger}"`);
  return a.length ? ' ' + a.join(' ') : '';
}

function clsAttr(base: string, style?: Style): string {
  const merged = [base, styleClasses(style)].filter(Boolean).join(' ');
  return ` class="${merged}"`;
}

function renderBlock(b: Block): string {
  const extra =
    ` data-bid="${escapeHtml(b.id)}"` +
    buildAttrs(b.build) +
    (b.dataId ? ` data-id="${escapeHtml(b.dataId)}"` : '');
  switch (b.type) {
    case 'heading': {
      const lvl = b.level ?? 2;
      return `<h${lvl}${clsAttr('blk h', b.style)}${extra}>${inlineMd(b.text)}</h${lvl}>`;
    }
    case 'text':
      return `<p${clsAttr('blk p', b.style)}${extra}>${inlineMd(b.text)}</p>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = b.items.map((it) => `<li>${inlineMd(it)}</li>`).join('');
      return `<${tag}${clsAttr('blk list', b.style)}${extra}>${items}</${tag}>`;
    }
    case 'image': {
      const cap = b.alt ? `<figcaption>${escapeHtml(b.alt)}</figcaption>` : '';
      return `<figure${clsAttr('blk fig', b.style)}${extra}><img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt ?? '')}" class="fit-${b.fit ?? 'contain'}">${cap}</figure>`;
    }
    case 'code':
      return `<pre${clsAttr('blk code', b.style)}${extra}><code>${escapeHtml(b.code)}</code></pre>`;
    case 'quote': {
      const cite = b.cite ? `<cite>${escapeHtml(b.cite)}</cite>` : '';
      return `<blockquote${clsAttr('blk quote', b.style)}${extra}><p>${inlineMd(b.text)}</p>${cite}</blockquote>`;
    }
    case 'table': {
      const head = `<tr>${b.headers.map((h) => `<th>${inlineMd(h)}</th>`).join('')}</tr>`;
      const body = b.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('');
      return `<table${clsAttr('blk table', b.style)}${extra}><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }
    case 'chart':
      return `<div${clsAttr('blk chart', b.style)}${extra} data-chart="${escapeHtml(b.chartType)}">[chart: ${escapeHtml(b.chartType)}]</div>`;
    case 'embed':
      return `<div${clsAttr('blk embed', b.style)}${extra}>${b.html}</div>`;
    case 'group': {
      const dir = b.direction ?? 'col';
      const kids = b.children.map((child) => renderBlock(child as Block)).join('');
      return `<div${clsAttr(`blk group group-${dir}`, b.style)}${extra}>${kids}</div>`;
    }
    default:
      return '';
  }
}

function renderSlide(s: Slide, deck: Deck): string {
  const layout = s.layout ?? deck.defaults?.layout ?? DEFAULT_LAYOUT;
  const segAttr = s.seg ? ` data-seg="${escapeHtml(s.seg)}"` : '';
  const segName = s.segName ? ` data-segname="${escapeHtml(s.segName)}"` : '';
  const slotsHtml = Object.entries(s.slots)
    .map(([key, blocks]) => {
      const inner = (blocks as Block[]).map(renderBlock).join('');
      return `<div class="slot slot-${escapeHtml(key)}">${inner}</div>`;
    })
    .join('');
  return `<section class="slide" id="${escapeHtml(s.id)}" data-layout="${escapeHtml(layout)}"${segAttr}${segName}><div class="slide__inner layout-${escapeHtml(layout)}">${slotsHtml}</div></section>`;
}

function slugish(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'deck'
  );
}

function chrome(title: string, total: number): string {
  return `<div class="sm-topbar">
  <div class="sm-progress"><div class="sm-progress__bar"></div></div>
  <div class="sm-title">${escapeHtml(title)}</div>
  <div class="sm-counter"><span class="cur">1</span>/<span class="total">${total}</span></div>
</div>
<aside class="sm-sidebar"><nav class="sm-segnav"></nav><div class="sm-thumbs"></div></aside>
<div class="sm-nav">
  <button class="sm-btn" data-act="present" title="演讲者视图 (P)">&#128483;</button>
  <button class="sm-btn" data-act="prev" title="上一页 (←)">&lsaquo;</button>
  <button class="sm-btn" data-act="next" title="下一页 (→)">&rsaquo;</button>
  <button class="sm-btn" data-act="fs" title="全屏 (F)">&#9974;</button>
</div>`;
}

/**
 * Render a Deck IR into a single, self-contained, offline HTML document
 * (inlined CSS + runtime JS). Anchors are derived once from slide ids.
 */
export function renderDeckHtml(deck: Deck, opts: RenderOptions = {}): string {
  const theme = getTheme(opts.theme ?? deck.theme ?? 'editorial');
  const lang = deck.defaults?.lang ?? 'zh';
  const title = deck.metadata?.title ?? 'Slidesmith';
  const anchors = deriveAnchors(deck);
  const meta = deriveSlideMeta(deck);
  const titles = meta.map((m) => m.title);
  const segs = meta.map((m) => m.seg);
  const segNames = meta.map((m) => m.segName);
  const channel = deck.metadata?.channel ?? `deck-${slugish(title)}`;
  // Inline every registered theme, media-gated so only the active one applies
  // (no FOUC, no JS needed for the initial paint). The `T` key flips media to
  // re-skin at runtime — all offline, single-file. (ARCHITECTURE §5.)
  const themes = allThemes();
  const themeStyles = themes
    .map(
      (t) =>
        `<style data-sm-theme="${escapeHtml(t.name)}" media="${t.name === theme.name ? 'all' : 'not all'}">\n${t.css}\n</style>`,
    )
    .join('\n');
  const boot = JSON.stringify({
    anchors,
    titles,
    segs,
    segNames,
    channel,
    total: deck.slides.length,
    theme: theme.name,
    themes: themes.map((t) => t.name),
    ...(opts.presenterUrl ? { presenterUrl: opts.presenterUrl } : {}),
  });
  const slides = deck.slides.map((s) => renderSlide(s, deck)).join('\n');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${coreCss}
</style>
${themeStyles}
</head>
<body class="sm">
<script>try{if(!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches))document.body.classList.add('anim');}catch(e){}</script>
${chrome(title, deck.slides.length)}
<main class="sm-stage"><div class="sm-deck">
${slides}
</div></main>
<script>window.__SM__=${boot};</script>
<script>
${runtimeJs}
</script>
</body>
</html>`;
}

const NOTE_LABEL: Record<NoteBlock['kind'], string> = {
  cue: '讲法',
  golden: '金句',
  data: '数据',
};

/** Render a slide's spoken script + structured note blocks (transcript only). */
function renderScript(s: Slide): string {
  const note = (s.notes ?? '').trim();
  const script = note
    ? `<div class="smt-script">${inlineMd(note)}</div>`
    : `<div class="smt-script empty">（本页暂无讲稿）</div>`;
  const blocks = (s.noteBlocks ?? [])
    .map(
      (nb) =>
        `<div class="smt-note smt-note--${nb.kind}"><span class="smt-note-tag">${NOTE_LABEL[nb.kind]}</span>${inlineMd(nb.text)}</div>`,
    )
    .join('');
  return script + blocks;
}

/**
 * Render the synchronized transcript (逐字稿) as a standalone, magazine-style
 * reading document. Each slide becomes one anchored `<article id="<anchor>">`
 * (anchor === slide id, the single source of truth shared with the deck), so
 * the presenter can whole-block highlight the current slide's script. When
 * embedded in the presenter iframe it also follows scroll/cue messages.
 */
export function renderTranscriptHtml(deck: Deck, opts: RenderOptions = {}): string {
  const theme = getTheme(opts.theme ?? deck.theme ?? 'editorial');
  const lang = deck.defaults?.lang ?? 'zh';
  const title = deck.metadata?.title ?? 'Slidesmith';
  const meta = deriveSlideMeta(deck);
  const segCount = new Set(meta.map((m) => m.seg).filter(Boolean)).size;

  const metaLine = [
    deck.metadata?.author,
    deck.metadata?.date,
    `${deck.slides.length} 张幻灯片`,
    segCount ? `${segCount} 段` : '',
  ]
    .filter(Boolean)
    .map((x) => escapeHtml(String(x)))
    .join(' · ');

  // table of contents: one row per slide, with a seg header where seg changes
  const tocRows: string[] = [];
  let lastSeg = ' ';
  meta.forEach((m, i) => {
    if (m.seg && m.seg !== lastSeg) {
      tocRows.push(
        `<li><a class="seg" href="#${escapeHtml(m.anchor)}"><span class="n">§</span>${escapeHtml(m.segName || '段 ' + m.seg)}</a></li>`,
      );
    }
    lastSeg = m.seg;
    tocRows.push(
      `<li><a href="#${escapeHtml(m.anchor)}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${escapeHtml(m.title)}</a></li>`,
    );
  });

  // flowing script: seg cover where seg changes, then one article per slide
  const flow: string[] = [];
  lastSeg = ' ';
  meta.forEach((m, i) => {
    const s = deck.slides[i];
    if (m.seg && m.seg !== lastSeg && m.segName) {
      flow.push(`<div class="smt-segcover">${escapeHtml(m.segName)}</div>`);
    }
    lastSeg = m.seg;
    flow.push(
      `<article class="smt-slide" id="${escapeHtml(m.anchor)}" data-idx="${i}">
<div class="smt-slide-head"><span class="smt-num">${String(i + 1).padStart(2, '0')}</span><span class="smt-slide-title">${escapeHtml(m.title)}</span></div>
${renderScript(s)}
</article>`,
    );
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · 讲稿</title>
<style>
${theme.css}
${transcriptCss}
</style>
</head>
<body class="smt">
<div class="smt-wrap">
<header class="smt-cover">
  <div class="smt-kicker">逐字稿 · TRANSCRIPT</div>
  <h1 class="smt-title">${escapeHtml(title)}</h1>
  <div class="smt-meta">${metaLine}</div>
</header>
<nav class="smt-toc"><h2>目录</h2><ol>
${tocRows.join('\n')}
</ol></nav>
<main class="smt-flow">
${flow.join('\n')}
</main>
</div>
<script>
${transcriptJs}
</script>
</body>
</html>`;
}

/**
 * Render the presenter view (演讲者视图): a dark second-screen shell that hosts
 * the transcript in an iframe and shows current/next slide, a timer, and sync
 * controls. The deck drives it via window-reference postMessage + ~1s heartbeat
 * (the file:// primary channel); the presenter drives the deck back via
 * window.opener. (See ARCHITECTURE.md §8.)
 */
export function renderPresenterHtml(deck: Deck, opts: RenderOptions = {}): string {
  const lang = deck.defaults?.lang ?? 'zh';
  const title = deck.metadata?.title ?? 'Slidesmith';
  const anchors = deriveAnchors(deck);
  const meta = deriveSlideMeta(deck);
  const channel = deck.metadata?.channel ?? `deck-${slugish(title)}`;
  const boot = JSON.stringify({
    anchors,
    titles: meta.map((m) => m.title),
    segs: meta.map((m) => m.seg),
    segNames: meta.map((m) => m.segName),
    total: deck.slides.length,
    channel,
    ...(opts.transcriptUrl ? { transcriptUrl: opts.transcriptUrl } : {}),
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · 演讲者视图</title>
<style>
${presenterCss}
</style>
</head>
<body class="smp">
<div class="smp-layout">
  <header class="smp-head">
    <div class="smp-col smp-col--slide">
      <div class="smp-label">SLIDE</div>
      <div class="smp-num"><span id="smpCur">—</span>/<span id="smpTotal">?</span></div>
      <div class="smp-seg"><span id="smpSeg">—</span><span id="smpSegName"></span></div>
    </div>
    <div class="smp-col smp-col--title">
      <div class="smp-tprev">‹ 上一张：<span id="smpTprev">—</span></div>
      <div class="smp-tcur" id="smpTcur">演讲者视图 · 等待主屏连接</div>
      <div class="smp-tnext">› 下一张：<span id="smpTnext">—</span></div>
    </div>
    <div class="smp-col smp-col--timer">
      <div class="smp-label">⏱ 演讲计时</div>
      <div class="smp-timer" id="smpTimer">00:00:00</div>
      <div class="smp-timer-btns"><button id="smpTimerToggle">暂停</button><button id="smpTimerReset">↻</button></div>
    </div>
    <div class="smp-col smp-col--ctrl">
      <button id="smpFwd" class="smp-btn" title="L · 正向跟随：主屏翻页 → 讲稿滚动">→ 跟随</button>
      <button id="smpRev" class="smp-btn" title="J · 反向跟随：本视图按键 → 主屏翻页">← 跟随</button>
      <button id="smpFwdSync" class="smp-btn" title="S · 把讲稿跳到主屏当前页">→ 同步</button>
      <button id="smpRevSync" class="smp-btn" title="D · 把主屏跳到讲稿当前位置">← 同步</button>
      <div class="smp-zoom"><button id="smpZoomOut" class="smp-btn" title="缩小讲稿">A−</button><button id="smpZoomIn" class="smp-btn" title="放大讲稿">A＋</button></div>
      <button id="smpCue" class="smp-btn" title="K · 高亮当前块的关键词（提词）">✦ 提词</button>
      <button id="smpFull" class="smp-btn" title="F · 第二屏全屏">⛶ 全屏</button>
    </div>
  </header>
  <div class="smp-status" id="smpConn">
    <span id="smpConnText">⚪ 等待主屏连接 …</span>
    <span class="smp-status-right"><kbd>←→</kbd>翻页 · <kbd>L/J</kbd>正/反跟随 · <kbd>S/D</kbd>正/反同步 · <kbd>K</kbd>提词 · <kbd>+/−</kbd>缩放 · <kbd>F</kbd>全屏 · <kbd>H</kbd>收起栏</span>
  </div>
  <main class="smp-main"><iframe id="smpFrame" title="讲稿"></iframe></main>
  <button id="smpHide" class="smp-hide" title="H · 收起顶栏，释放讲稿空间">👁</button>
  <div class="smp-toast" id="smpToast"></div>
</div>
<script>window.__SMP__=${boot};</script>
<script>
${presenterJs}
</script>
</body>
</html>`;
}
