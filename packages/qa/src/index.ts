// @slidesmith/qa — IR-level artifact lint.
// Catches common authoring problems the Zod schema can't: empty slides, images
// without alt text, content that will likely overflow the 1920x1080 canvas,
// missing presenter notes, duplicate titles. Borrows the "validate the product,
// not just the schema" philosophy from the guizang/humanize validators.
import { slideTitle } from '@slidesmith/ir';
import type { Deck, Slide, Block } from '@slidesmith/ir';

export type LintLevel = 'error' | 'warn' | 'info';

export interface LintIssue {
  level: LintLevel;
  code: string;
  /** dotted path to the slide/block, e.g. `slides[2]` or `slides[2].slots.main[1]`. */
  path: string;
  message: string;
}

export interface LintResult {
  /** false when any `error`-level issue exists. */
  ok: boolean;
  issues: LintIssue[];
  counts: Record<LintLevel, number>;
}

// heuristic budgets for the fixed 1920x1080 canvas (intentionally generous)
const MAX_BLOCKS_PER_SLOT = 8;
const MAX_LIST_ITEMS = 8;
const MAX_HEADING_CHARS = 48;
const MAX_TEXT_CHARS = 240;

function eachBlock(blocks: Block[], base: string, fn: (b: Block, path: string) => void): void {
  blocks.forEach((b, i) => {
    const p = `${base}[${i}]`;
    fn(b, p);
    if (b.type === 'group') eachBlock(b.children as Block[], `${p}.children`, fn);
  });
}

function slideIsEmpty(s: Slide): boolean {
  for (const blocks of Object.values(s.slots)) if ((blocks as Block[]).length) return false;
  return true;
}

/**
 * Lint a (validated) Deck IR for likely product problems. Returns issues at
 * three levels; `ok` is false only when an `error` is present. Pure, no render.
 */
export function lintDeck(deck: Deck): LintResult {
  const issues: LintIssue[] = [];
  const add = (level: LintLevel, code: string, path: string, message: string) =>
    issues.push({ level, code, path, message });

  let prevTitle: string | null = null;
  deck.slides.forEach((s, i) => {
    const sp = `slides[${i}]`;

    if (slideIsEmpty(s)) add('error', 'slide.empty', sp, `Slide "${s.id}" has no content in any slot.`);

    // per-slot density + per-block checks
    for (const [slot, blocks] of Object.entries(s.slots)) {
      const arr = blocks as Block[];
      if (arr.length > MAX_BLOCKS_PER_SLOT) {
        add('warn', 'slot.dense', `${sp}.slots.${slot}`, `Slot "${slot}" has ${arr.length} blocks — may overflow the slide.`);
      }
      eachBlock(arr, `${sp}.slots.${slot}`, (b, bp) => {
        if (b.type === 'image' && !b.alt) {
          add('warn', 'image.no-alt', bp, 'Image has no alt text (caption + accessibility).');
        }
        if (b.type === 'heading' && b.text.length > MAX_HEADING_CHARS) {
          add('warn', 'heading.long', bp, `Heading is ${b.text.length} chars — long headings may wrap awkwardly.`);
        }
        if (b.type === 'text' && b.text.length > MAX_TEXT_CHARS) {
          add('warn', 'text.long', bp, `Text block is ${b.text.length} chars — consider splitting across slides.`);
        }
        if (b.type === 'list' && b.items.length > MAX_LIST_ITEMS) {
          add('warn', 'list.long', bp, `List has ${b.items.length} items — consider splitting (>${MAX_LIST_ITEMS}).`);
        }
        if (b.type === 'table' && b.rows.some((r) => r.length !== b.headers.length)) {
          add('warn', 'table.ragged', bp, 'Table has rows whose column count differs from the headers.');
        }
      });
    }

    // presenter-completeness (M3 transcript): a slide with no script at all
    if (!s.notes && !(s.noteBlocks && s.noteBlocks.length)) {
      add('info', 'notes.missing', sp, `Slide "${s.id}" has no presenter notes — transcript will show a placeholder.`);
    }

    const title = slideTitle(s);
    if (prevTitle !== null && title === prevTitle) {
      add('info', 'title.duplicate', sp, `Slide "${s.id}" repeats the previous title "${title}".`);
    }
    prevTitle = title;
  });

  const counts: Record<LintLevel, number> = { error: 0, warn: 0, info: 0 };
  for (const it of issues) counts[it.level]++;
  return { ok: counts.error === 0, issues, counts };
}
