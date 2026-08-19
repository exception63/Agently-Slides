// deck 大纲：**页号 · data-id · 标题**，从当前载入的 deck HTML 算出来。
//
// ## 为什么非要有这个
//
// `data-id` 是 Studio **导入时才生成的**（`packages/studio/src/main.ts` 的
// `data-id || window.SLIDE_MAP[i] || 's'+(i+1)`）。绝大多数 deck 的磁盘文件里
// 根本没有这个属性——`editorial-slides` 出的片子写的是 `data-seg`。
//
// 于是 app 里那个自由对话面板会撞上一堵墙：用户说「把第 3 页改短点」，Claude 去
// 读磁盘文件，看到的是一堆没有 id 的 `<section>`，`slidesmith_apply_patch` 靠
// data-id 定位，它**没有任何合法的 id 可写**。（真机第一次跑就撞上了：它很正确地
// 停下来问"要我自己加一个 id 吗"——而正确答案是"不用，id 早就有了，只是你看不见"。）
//
// Studio 提交的「AI 待办」里本来就带着这份大纲，所以那条路一直没事；**缺的只是
// 自由对话这一路**。这里按和 Studio **一模一样的规则**在服务端复算一遍，
// 两边永远对得上。
//
// 用正则而不是 DOM：桥接是零依赖的本地小服务，为了这一件事拖进一个 jsdom
// 不划算。扫描按 `<section>` 的嵌套深度走，不是"找下一个 `</section>`"——
// 页内嵌套 `<section>` 的 deck（分栏布局常见）会把后者切错。

export interface OutlineEntry {
  /** 1 开始的页号，就是用户嘴里的"第几页" */
  index: number;
  /** apply_patch 定位用的键 */
  id: string;
  title: string;
  seg: string;
  segName: string;
  /** class 里除 `slide` 之外的部分，如 `cover` / `secdiv secdiv--accent` */
  variant: string;
  bytes: number;
  /** 整页 HTML。只有点名要某几页时才带上（整份 deck 的全文太大） */
  html?: string;
}

/** 顶层 `<section …>`（按嵌套深度切，页内嵌套的 section 不算一页） */
function topLevelSections(html: string): Array<{ open: string; full: string }> {
  const out: Array<{ open: string; full: string }> = [];
  const tag = /<(\/?)section\b([^>]*)>/gi;
  let depth = 0;
  let start = -1;
  let openTag = '';
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html))) {
    const closing = m[1] === '/';
    if (!closing) {
      if (depth === 0) { start = m.index; openTag = m[0]; }
      depth++;
      // 自闭合 `<section/>` 在 HTML 里不合法，但别被它带崩
      if (/\/>$/.test(m[0])) { depth--; if (depth === 0) start = -1; }
    } else {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ open: openTag, full: html.slice(start, m.index + m[0].length) });
        start = -1;
      }
      if (depth < 0) depth = 0;   // 多出来的闭合标签：当没看见
    }
  }
  return out;
}

function attr(openTag: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(openTag);
  return (m?.[2] ?? m?.[3] ?? '').trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 和 Studio 的 `deriveHtmlTitle` 同一套选择器、同一个截断长度。 */
function deriveTitle(section: string, openTag: string, index: number): string {
  const dt = attr(openTag, 'data-title');
  if (dt) return dt;
  const byClass = /<[^>]*class\s*=\s*["'][^"']*\b(cover__title|secdiv__title|manifesto__title|insight__statement|head__title|title)\b[^"']*["'][^>]*>([\s\S]*?)<\//i
    .exec(section);
  if (byClass) {
    const t = stripTags(byClass[2]).slice(0, 40);
    if (t) return t;
  }
  const byHeading = /<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(section);
  if (byHeading) {
    const t = stripTags(byHeading[2]).slice(0, 40);
    if (t) return t;
  }
  return 'slide ' + (index + 1);
}

/**
 * 算出 deck 的大纲。`wantHtml` 里点名的 id（或页号字符串）才带整页 HTML。
 *
 * `id` 的算法必须和 Studio 逐字一致：`data-id` → `window.SLIDE_MAP[i]` → `s{i+1}`。
 * 差一个字，apply_patch 就会报「补丁的 data-id 不匹配任何页」。
 */
export function outlineOf(deckHtml: string, wantHtml: Set<string> = new Set()): OutlineEntry[] {
  let slideMap: string[] | null = null;
  const mapMatch = /window\.SLIDE_MAP\s*=\s*(\[[^\]]*\])/.exec(deckHtml);
  if (mapMatch) { try { slideMap = JSON.parse(mapMatch[1]); } catch { slideMap = null; } }

  // Studio 数的是 `#deck` 的直接子 `.slide`。**页号必须和它一致**，否则 `s{i+1}`
  // 这条兜底会整体错位一格，apply_patch 全打偏。从 #deck 开标签处起扫就够——
  // deck 之外出现 `.slide` 的只可能是模板残留，那本来也不该计入页号。
  const deckAt = /<[a-z]+[^>]*\bid\s*=\s*["']deck["'][^>]*>/i.exec(deckHtml);
  const body = deckAt ? deckHtml.slice(deckAt.index) : deckHtml;

  const slides = topLevelSections(body)
    .filter(({ open }) => /\bslide\b/.test(attr(open, 'class')));

  return slides.map(({ open, full }, i) => {
    const id = attr(open, 'data-id') || (slideMap?.[i]) || 's' + (i + 1);
    const entry: OutlineEntry = {
      index: i + 1,
      id,
      title: deriveTitle(full, open, i),
      seg: attr(open, 'data-seg') || '0',
      segName: attr(open, 'data-segname'),
      variant: attr(open, 'class').replace(/\bslide\b/, '').trim(),
      bytes: Buffer.byteLength(full),
    };
    if (wantHtml.has(id) || wantHtml.has(String(i + 1))) {
      // **带 HTML 时把 data-id 补进开标签**——Studio 那边是导入时补的，磁盘文件里
      // 没有。不补的话 Claude 会照着我们给的样子原样返回一个没有 id 的 section，
      // 然后 apply_patch 拒收。
      entry.html = /\bdata-id\s*=/.test(open)
        ? full
        : full.replace(open, open.replace(/^<section\b/i, `<section data-id="${id}"`));
    }
    return entry;
  });
}
