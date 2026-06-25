import { join } from 'node:path';
import type { Deck } from '@slidesmith/ir';
import { renderDeckHtml } from '@slidesmith/engine';

export type AuditLevel = 'error' | 'warn' | 'info';

export interface AuditFinding {
  level: AuditLevel;
  code: string;
  /** slide id the finding belongs to (the IR addressing key). */
  slide: string;
  /** 1-based slide index (for humans). */
  index: number;
  /** block id (data-bid) when the finding is pinned to one block, else null. */
  block: string | null;
  message: string;
  /** path to the rendered PNG of this slide, when thumbnails were emitted. */
  thumb?: string;
}

export interface AuditResult {
  /** false when any `error`-level finding exists. */
  ok: boolean;
  findings: AuditFinding[];
  counts: Record<AuditLevel, number>;
  /** all per-slide thumbnails written, in order (when --thumbs). */
  thumbs: string[];
}

export interface AuditOptions {
  out: string;
  base: string;
  theme?: string;
  /** write a PNG per slide so the agent can *see* the flagged slides. */
  thumbs?: boolean;
}

/** Shape returned per-slide from the in-page auditor (runs in the browser). */
interface RawSlideAudit {
  slide: string;
  layout: string;
  findings: Array<{ level: AuditLevel; code: string; block: string | null; message: string }>;
}

/**
 * The visual auditor, as a raw JS source string evaluated INSIDE the headless
 * page for the active slide. It measures the *rendered* layout (not the IR), so
 * it catches what the IR-level lint structurally cannot: content clipped by the
 * fixed 1920x1080 frame, blocks pushed off-canvas, unreadable contrast, broken
 * images, and near-empty slides. Every finding carries the block's `data-bid`
 * when it can be pinned to one, so the agent knows exactly which IR node to fix.
 *
 * It is a string (not a TS function) on purpose: tsx/esbuild inject a `__name`
 * helper into transpiled named functions which is undefined in the browser, so
 * passing a function reference to page.evaluate would throw. A raw IIFE string
 * is transform-immune and also survives a future bundle.
 */
const AUDIT_SRC = String.raw`(function () {
  var W = 1920, H = 1080, TOL = 6;
  var slide = document.querySelector('.sm-deck > .slide.active');
  var out = { slide: '', layout: '', findings: [] };
  if (!slide) return out;
  out.slide = slide.id;
  out.layout = slide.getAttribute('data-layout') || '';
  slide.style.transform = 'none'; // neutralize fit-to-stage scale -> true px
  var sr = slide.getBoundingClientRect();
  function add(level, code, block, message) { out.findings.push({ level: level, code: code, block: block, message: message }); }

  // 1) per-block off-canvas (content clipped by the fixed frame)
  var leaves = Array.prototype.slice.call(slide.querySelectorAll('.blk'));
  var offCanvas = 0;
  var uMinTop = Infinity, uMinLeft = Infinity, uMaxBot = -Infinity, uMaxRight = -Infinity;
  for (var i = 0; i < leaves.length; i++) {
    var b = leaves[i];
    var r = b.getBoundingClientRect();
    var top = r.top - sr.top, left = r.left - sr.left, bottom = r.bottom - sr.top, right = r.right - sr.left;
    if (r.width > 0 && r.height > 0) {
      uMinTop = Math.min(uMinTop, Math.max(0, top));
      uMinLeft = Math.min(uMinLeft, Math.max(0, left));
      uMaxBot = Math.max(uMaxBot, Math.min(H, bottom));
      uMaxRight = Math.max(uMaxRight, Math.min(W, right));
    }
    if (b.classList.contains('group')) continue; // measure leaves, not containers
    var over = Math.max(bottom - H, right - W, -top, -left);
    if (over > TOL) {
      offCanvas++;
      var bid = b.getAttribute('data-bid');
      add('error', 'visual.offcanvas', bid,
        '块 ' + (bid || '?') + ' 越出 1920×1080 画面约 ' + Math.round(over) + 'px，会被裁掉。删减内容 / 拆成两页 / 调小该块字号档位（如 display→h1）。');
    }
  }

  // 2) slide-level overflow (document flow taller/wider than the frame)
  if (offCanvas === 0) {
    var vOver = slide.scrollHeight - H, hOver = slide.scrollWidth - W;
    if (vOver > TOL) add('error', 'visual.overflow-y', null, '本页内容比画面高 ' + Math.round(vOver) + 'px，底部被裁掉。减少要点/字数，或拆成两页。');
    if (hOver > TOL) add('error', 'visual.overflow-x', null, '本页内容比画面宽 ' + Math.round(hOver) + 'px，右侧被裁掉。');
  }

  // 3) text contrast (WCAG)
  function parseColor(s) {
    var m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
  }
  function lum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function effectiveBg(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.1) return c;
      n = n.parentElement;
    }
    return [32, 32, 34, 1]; // body.sm fallback
  }
  function ratio(a, b2) {
    var la = lum(a), lb = lum(b2), hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  var textEls = Array.prototype.slice.call(slide.querySelectorAll('.blk.h, .blk.p, .blk.list li, .blk.quote p, .blk.quote cite, .blk.table th, .blk.table td'));
  var seen = {};
  for (var j = 0; j < textEls.length; j++) {
    var el = textEls[j];
    var text = (el.textContent || '').trim();
    if (!text) continue;
    var cs = getComputedStyle(el);
    var fg = parseColor(cs.color);
    if (!fg || fg[3] < 0.1) continue;
    var bg = effectiveBg(el.parentElement || el);
    var cr = ratio(fg, bg);
    var fontPx = parseFloat(cs.fontSize) || 16;
    var weight = parseInt(cs.fontWeight, 10) || 400;
    var isLarge = fontPx >= 24 || (fontPx >= 18.66 && weight >= 700);
    var min = isLarge ? 3 : 4.5;
    if (cr < min) {
      var owner = el.closest('.blk') || el;
      var obid = owner.getAttribute('data-bid') || '';
      if (seen[obid]) continue;
      seen[obid] = true;
      add(cr < 3 ? 'error' : 'warn', 'visual.contrast', obid || null,
        '文字对比度仅 ' + cr.toFixed(1) + ':1（建议 ≥' + min + ':1）——“' + text.slice(0, 14) + '…”几乎看不清。换 color/主题，或放到对比更强的底色上。');
    }
  }

  // 4) broken / missing images
  var imgs = Array.prototype.slice.call(slide.querySelectorAll('img'));
  for (var k = 0; k < imgs.length; k++) {
    var img = imgs[k];
    if (img.complete && img.naturalWidth === 0) {
      var iowner = img.closest('.blk') || img;
      add('error', 'visual.image-broken', iowner.getAttribute('data-bid'),
        '图片加载失败：' + (img.getAttribute('src') || '(空)') + '。检查路径，或内联为 data: URI 以保单文件可移植。');
    }
  }

  // 5) near-empty content slides (info; layout-aware)
  var denseLayouts = ['bullets', 'two-col', 'data-stat'];
  if (denseLayouts.indexOf(out.layout) >= 0 && uMaxBot > -Infinity) {
    var fill = ((uMaxBot - uMinTop) * (uMaxRight - uMinLeft)) / (W * H);
    if (fill < 0.12) add('info', 'visual.sparse', null, '本页内容只占画面约 ' + (fill * 100).toFixed(0) + '%，显得很空。可加内容、放大主元素，或换更紧凑的布局。');
  }

  return out;
})()`;

/**
 * Render a deck headless and audit every slide's *rendered* layout. Optionally
 * writes a PNG per slide (so an agent can read the flagged ones). playwright-core
 * is loaded lazily — same dependency the `export` command already uses.
 */
export async function auditDeck(deck: Deck, opts: AuditOptions): Promise<AuditResult> {
  let chromium: typeof import('playwright-core').chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error(
      'audit needs playwright-core + a browser. Install with:\n' +
        '  npm i -w @slidesmith/cli playwright-core\n' +
        '  npx playwright-core install chromium-headless-shell',
    );
  }

  const html = renderDeckHtml(deck, opts.theme ? { theme: opts.theme } : {});
  const browser = await chromium.launch({ headless: true });
  const findings: AuditFinding[] = [];
  const thumbs: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: W_VIEW, height: H_VIEW } });
    await page.setContent(html, { waitUntil: 'load' });
    // present mode (hide chrome), animations off so every block is settled+visible
    await page.evaluate(() => {
      document.body.classList.add('present');
      document.body.classList.remove('anim');
      const nav = document.querySelector('.sm-nav') as HTMLElement | null;
      if (nav) nav.style.display = 'none';
    });

    const total =
      (await page.evaluate(() => (window as unknown as { __SM_TOTAL__: number }).__SM_TOTAL__)) ||
      deck.slides.length;
    const pad = String(total).length;

    for (let i = 0; i < total; i++) {
      await page.evaluate((n) => (window as unknown as { __SM_GO__: (n: number) => void }).__SM_GO__(n), i);
      await page.waitForTimeout(70);
      const raw = (await page.evaluate(AUDIT_SRC)) as RawSlideAudit;
      let thumb: string | undefined;
      if (opts.thumbs) {
        thumb = join(opts.out, `${opts.base}-audit-${String(i + 1).padStart(pad, '0')}.png`);
        await page.screenshot({ path: thumb, clip: { x: 0, y: 0, width: W_VIEW, height: H_VIEW } });
        thumbs.push(thumb);
      }
      const slideId = raw.slide || deck.slides[i]?.id || `#${i + 1}`;
      for (const f of raw.findings)
        findings.push({ ...f, slide: slideId, index: i + 1, ...(thumb ? { thumb } : {}) });
    }
  } finally {
    await browser.close();
  }

  const counts: Record<AuditLevel, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level]++;
  return { ok: counts.error === 0, findings, counts, thumbs };
}

const W_VIEW = 1920;
const H_VIEW = 1080;
