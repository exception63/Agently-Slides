import type { Deck, Slide, Block } from '@slidesmith/ir';

// Reverse of parser-md: serialize a Deck IR back to the authoring Markdown
// format (frontmatter + `:::` directives + Markdown blocks). JSON stays the
// canonical source; this is a convenience export (e.g. for git diffs / handing
// a deck back to the markdown authoring flow). Round-trips the common cases;
// exotic blocks (chart/embed) are emitted best-effort.

function fmScalar(v: string): string {
  return /[:#]/.test(v) ? JSON.stringify(v) : v;
}

function frontmatter(deck: Deck): string {
  const lines: string[] = ['---'];
  if (deck.theme) lines.push(`theme: ${fmScalar(deck.theme)}`);
  const m = deck.metadata ?? {};
  if (m.title) lines.push(`title: ${fmScalar(m.title)}`);
  if (m.author) lines.push(`author: ${fmScalar(m.author)}`);
  if (m.date) lines.push(`date: ${fmScalar(m.date)}`);
  const d = deck.defaults ?? {};
  const dEntries = Object.entries(d).filter(([, v]) => v != null);
  if (dEntries.length) {
    lines.push('defaults:');
    for (const [k, v] of dEntries) lines.push(`  ${k}: ${fmScalar(String(v))}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function blockToMd(b: Block): string {
  switch (b.type) {
    case 'heading':
      return `${'#'.repeat(b.level ?? 2)} ${b.text}`;
    case 'text':
      return b.text;
    case 'list':
      return b.items.map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`)).join('\n');
    case 'quote':
      return b.text
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'code':
      return '```' + (b.lang ?? '') + '\n' + b.code + '\n```';
    case 'image':
      return `![${b.alt ?? ''}](${b.src})`;
    case 'table': {
      const head = `| ${b.headers.join(' | ')} |`;
      const sep = `| ${b.headers.map(() => '---').join(' | ')} |`;
      const rows = b.rows.map((r) => `| ${r.join(' | ')} |`);
      return [head, sep, ...rows].join('\n');
    }
    case 'group':
      return (b.children as Block[]).map(blockToMd).join('\n\n');
    case 'chart':
      return `<!-- chart:${b.chartType} (edit in JSON) -->`;
    case 'embed':
      return b.html;
    default:
      return '';
  }
}

function slideToMd(s: Slide, index: number, defaultLayout: string): string {
  const out: string[] = [];
  if (s.layout && s.layout !== defaultLayout) out.push(`::: layout ${s.layout}`);
  if (s.id !== `s${index + 1}`) out.push(`::: id ${s.id}`);
  if (s.seg) out.push(`::: seg ${s.seg}`);
  if (s.segName) out.push(`::: segname ${s.segName}`);

  const slotKeys = Object.keys(s.slots);
  const onlyMain = slotKeys.length === 1 && slotKeys[0] === 'main';
  for (const key of slotKeys) {
    if (!onlyMain) out.push(`::: slot ${key}`);
    const blocks = s.slots[key] as Block[];
    out.push(blocks.map(blockToMd).join('\n\n'));
  }

  if (s.notes) out.push(`::: note ${s.notes}`);
  for (const nb of s.noteBlocks ?? []) out.push(`:::${nb.kind} ${nb.text}`);
  return out.filter((x) => x.trim().length).join('\n');
}

/** Serialize a Deck IR to the Slidesmith authoring Markdown format. */
export function irToMarkdown(deck: Deck): string {
  const defaultLayout = deck.defaults?.layout ?? 'bullets';
  const parts = [frontmatter(deck), ''];
  deck.slides.forEach((s, i) => {
    if (i > 0) parts.push('---', '');
    parts.push(slideToMd(s, i, defaultLayout), '');
  });
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
