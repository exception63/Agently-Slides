import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { DEFAULT_LAYOUT, NOTE_KINDS } from '@slidesmith/ir';
import type { Deck, Slide, Block, NoteBlock, NoteKind } from '@slidesmith/ir';

const NOTE_KIND_SET = new Set<string>(NOTE_KINDS);

type Token = ReturnType<MarkdownIt['parse']>[number];

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Parse a Slidesmith Markdown deck (frontmatter + `:::` directives + Markdown)
 * into the canonical JSON IR. The result should still be passed through
 * `validateDeck` from @slidesmith/ir.
 *
 * Authoring format:
 *   ---  (YAML frontmatter: theme, title, author, date, defaults, lang)  ---
 *   slides separated by a line containing only `---`
 *   within a slide:
 *     `::: layout <name>`   set the slide layout
 *     `::: slot <name>`     start a named slot (default slot is `main`)
 *     `::: note`            following lines become the slide's presenter notes
 *     `::: id|seg|segname <v>`  optional slide metadata
 *   everything else is standard Markdown -> blocks.
 */
export function parseMarkdownToIR(source: string): Deck {
  const fm = matter(source);
  const data = (fm.data ?? {}) as Record<string, unknown>;

  const deck: Deck = {
    ir_version: '1.0',
    theme: typeof data.theme === 'string' ? data.theme : 'editorial',
    slides: [],
  };

  const metadata: Record<string, string> = {};
  for (const key of ['title', 'author', 'date', 'channel'] as const) {
    if (typeof data[key] === 'string') metadata[key] = data[key] as string;
  }
  if (Object.keys(metadata).length) deck.metadata = metadata;

  const defaults: Record<string, string> = {};
  const fmDefaults = (data.defaults ?? {}) as Record<string, unknown>;
  for (const key of ['layout', 'transition', 'lang'] as const) {
    if (typeof fmDefaults[key] === 'string') defaults[key] = fmDefaults[key] as string;
  }
  if (typeof data.lang === 'string') defaults.lang = data.lang;
  if (Object.keys(defaults).length) deck.defaults = defaults as Deck['defaults'];

  const defaultLayout = defaults.layout ?? DEFAULT_LAYOUT;

  let blockCounter = 0;
  const nextBlockId = () => `b${++blockCounter}`;

  splitSlides(fm.content).forEach((chunk, i) => {
    deck.slides.push(parseSlide(chunk, i + 1, defaultLayout, nextBlockId));
  });

  return deck;
}

/** Split deck body into per-slide chunks on `---` lines (ignoring code fences). */
function splitSlides(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^---\s*$/.test(line)) {
      out.push(cur.join('\n'));
      cur = [];
    } else {
      cur.push(line);
    }
  }
  out.push(cur.join('\n'));
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

function parseSlide(chunk: string, n: number, defaultLayout: string, nextBlockId: () => string): Slide {
  let layout = defaultLayout;
  let id = `s${n}`;
  let seg: string | undefined;
  let segName: string | undefined;
  const slotBuffers: Record<string, string[]> = { main: [] };
  const noteLines: string[] = [];
  const noteBlocks: Array<{ kind: NoteKind; lines: string[] }> = [];
  let currentSlot = 'main';
  let currentNoteBlock: { kind: NoteKind; lines: string[] } | null = null;
  let mode: 'slot' | 'note' | 'noteblock' = 'slot';

  for (const line of chunk.split(/\r?\n/)) {
    const trimmed = line.trim();
    // a bare `:::` closes the current note / note-block context
    if (trimmed === ':::') { mode = 'slot'; currentNoteBlock = null; continue; }
    // directive: `::: name arg` or compact `:::name arg`
    const m = /^:::\s*([a-zA-Z][\w-]*)\s*(.*)$/.exec(trimmed);
    if (m) {
      const dir = m[1].toLowerCase();
      const arg = (m[2] ?? '').trim();
      if (NOTE_KIND_SET.has(dir)) {
        currentNoteBlock = { kind: dir as NoteKind, lines: arg ? [arg] : [] };
        noteBlocks.push(currentNoteBlock);
        mode = 'noteblock';
        continue;
      }
      switch (dir) {
        case 'layout': if (arg) layout = arg; break;
        case 'slot': currentSlot = arg || 'main'; mode = 'slot'; if (!slotBuffers[currentSlot]) slotBuffers[currentSlot] = []; break;
        case 'note': mode = 'note'; if (arg) noteLines.push(arg); break;
        case 'id': if (arg) id = arg; break;
        case 'seg': if (arg) seg = arg; break;
        case 'segname': if (arg) segName = arg; break;
        default: break; // unknown directive: ignored
      }
      continue;
    }
    if (mode === 'note') noteLines.push(line);
    else if (mode === 'noteblock' && currentNoteBlock) currentNoteBlock.lines.push(line);
    else slotBuffers[currentSlot].push(line);
  }

  const slots: Record<string, Block[]> = {};
  for (const [key, buf] of Object.entries(slotBuffers)) {
    const text = buf.join('\n').trim();
    if (!text) continue;
    const blocks = mdToBlocks(text, nextBlockId);
    if (blocks.length) slots[key] = blocks;
  }

  const slide: Slide = { id, layout, slots };
  if (seg) slide.seg = seg;
  if (segName) slide.segName = segName;
  const note = noteLines.join('\n').trim();
  if (note) slide.notes = note;
  const blocks: NoteBlock[] = noteBlocks
    .map((nb) => ({ kind: nb.kind, text: nb.lines.join('\n').trim() }))
    .filter((nb) => nb.text.length > 0);
  if (blocks.length) slide.noteBlocks = blocks;
  return slide;
}

/** Convert a Markdown fragment into IR blocks via the markdown-it token stream. */
function mdToBlocks(src: string, nextBlockId: () => string): Block[] {
  const tokens = md.parse(src, {});
  const blocks: Block[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const level = clamp(parseInt(t.tag.slice(1), 10) || 2, 1, 3) as 1 | 2 | 3;
      blocks.push({ id: nextBlockId(), type: 'heading', text: tokens[i + 1]?.content ?? '', level });
      i += 3;
    } else if (t.type === 'paragraph_open') {
      const inline = tokens[i + 1];
      const img = onlyImage(inline);
      if (img) {
        blocks.push(img.alt ? { id: nextBlockId(), type: 'image', src: img.src, alt: img.alt } : { id: nextBlockId(), type: 'image', src: img.src });
      } else {
        blocks.push({ id: nextBlockId(), type: 'text', text: inline?.content ?? '' });
      }
      i += 3;
    } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const ordered = t.type === 'ordered_list_open';
      const { items, next } = collectListItems(tokens, i);
      if (items.length) blocks.push(ordered ? { id: nextBlockId(), type: 'list', items, ordered: true } : { id: nextBlockId(), type: 'list', items });
      i = next;
    } else if (t.type === 'fence' || t.type === 'code_block') {
      const lang = (t.info ?? '').trim().split(/\s+/)[0];
      blocks.push(lang ? { id: nextBlockId(), type: 'code', code: t.content.replace(/\n$/, ''), lang } : { id: nextBlockId(), type: 'code', code: t.content.replace(/\n$/, '') });
      i += 1;
    } else if (t.type === 'blockquote_open') {
      const { text, next } = collectBlockquote(tokens, i);
      if (text) blocks.push({ id: nextBlockId(), type: 'quote', text });
      i = next;
    } else if (t.type === 'table_open') {
      const { headers, rows, next } = collectTable(tokens, i);
      blocks.push({ id: nextBlockId(), type: 'table', headers, rows });
      i = next;
    } else {
      i += 1;
    }
  }
  return blocks;
}

function onlyImage(inline: Token | undefined): { src: string; alt: string } | null {
  if (!inline || !inline.children) return null;
  const nonEmpty = inline.children.filter((c) => !(c.type === 'text' && c.content.trim() === ''));
  if (nonEmpty.length === 1 && nonEmpty[0].type === 'image') {
    const img = nonEmpty[0];
    return { src: img.attrGet('src') ?? '', alt: img.content || (img.attrGet('alt') ?? '') };
  }
  return null;
}

function collectListItems(tokens: Token[], openIdx: number): { items: string[]; next: number } {
  const items: string[] = [];
  let i = openIdx + 1;
  let depth = 1;
  let current: string | null = null;
  while (i < tokens.length && depth > 0) {
    const t = tokens[i];
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') depth++;
    else if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') {
      depth--;
      if (depth === 0) { i++; break; }
    } else if (t.type === 'list_item_open' && depth === 1) current = '';
    else if (t.type === 'list_item_close' && depth === 1) {
      if (current !== null) items.push(current.trim());
      current = null;
    } else if (t.type === 'inline' && current === '') current = t.content;
    i++;
  }
  return { items: items.filter((s) => s.length > 0), next: i };
}

function collectBlockquote(tokens: Token[], openIdx: number): { text: string; next: number } {
  let i = openIdx + 1;
  let depth = 1;
  const parts: string[] = [];
  while (i < tokens.length && depth > 0) {
    const t = tokens[i];
    if (t.type === 'blockquote_open') depth++;
    else if (t.type === 'blockquote_close') {
      depth--;
      if (depth === 0) { i++; break; }
    } else if (t.type === 'inline') parts.push(t.content);
    i++;
  }
  return { text: parts.join('\n').trim(), next: i };
}

function collectTable(tokens: Token[], openIdx: number): { headers: string[]; rows: string[][]; next: number } {
  let i = openIdx + 1;
  const headers: string[] = [];
  const rows: string[][] = [];
  let section: 'head' | 'body' | null = null;
  let row: string[] | null = null;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'table_close') { i++; break; }
    else if (t.type === 'thead_open') section = 'head';
    else if (t.type === 'thead_close') section = null;
    else if (t.type === 'tbody_open') section = 'body';
    else if (t.type === 'tbody_close') section = null;
    else if (t.type === 'tr_open') row = [];
    else if (t.type === 'tr_close') {
      if (row) { if (section === 'head') headers.push(...row); else rows.push(row); }
      row = null;
    } else if (t.type === 'th_open' || t.type === 'td_open') {
      if (row) row.push(tokens[i + 1]?.content ?? '');
      i += 2;
    }
    i++;
  }
  return { headers, rows, next: i };
}
