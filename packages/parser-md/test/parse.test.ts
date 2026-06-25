import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMarkdownToIR } from '../src/index';
import { validateDeck } from '@slidesmith/ir';

const here = dirname(fileURLToPath(import.meta.url));
const demo = readFileSync(join(here, '..', '..', '..', 'examples', 'demo.deck.md'), 'utf8');

describe('parseMarkdownToIR', () => {
  it('parses the demo deck into valid IR', () => {
    const res = validateDeck(parseMarkdownToIR(demo));
    if (!res.ok) console.error(res.errors);
    expect(res.ok).toBe(true);
  });

  it('reads frontmatter and splits slides', () => {
    const ir = parseMarkdownToIR(demo);
    expect(ir.theme).toBe('editorial');
    expect(ir.metadata?.title).toContain('Markdown');
    expect(ir.slides.length).toBe(5);
  });

  it('maps markdown into blocks', () => {
    const ir = parseMarkdownToIR(demo);
    const main = ir.slides[1].slots.main ?? [];
    expect(main.some((b) => b.type === 'heading')).toBe(true);
    const list = main.find((b) => b.type === 'list');
    expect(list?.type === 'list' && list.items.length).toBe(3);
  });

  it('handles ::: layout / slot / note / seg directives', () => {
    const ir = parseMarkdownToIR(demo);
    expect(ir.slides[0].layout).toBe('cover');
    expect(ir.slides[0].notes).toBeTruthy();
    const two = ir.slides[2];
    expect(two.layout).toBe('two-col');
    expect(Boolean(two.slots.left && two.slots.right)).toBe(true);
    expect(ir.slides[1].segName).toContain('段1');
    const quote = ir.slides[3];
    expect(quote.layout).toBe('quote');
    expect((quote.slots.main ?? []).some((b) => b.type === 'quote')).toBe(true);
  });

  it('parses ::: cue / golden / data into structured noteBlocks', () => {
    const ir = parseMarkdownToIR(demo);
    const cover = ir.slides[0];
    expect(cover.noteBlocks?.map((n) => n.kind)).toEqual(['cue', 'golden']);
    expect(cover.noteBlocks?.find((n) => n.kind === 'golden')?.text).toContain('精修');
    expect(ir.slides[1].noteBlocks?.some((n) => n.kind === 'data')).toBe(true);
    // note prose still lands in `notes`, separate from the blocks
    expect(cover.notes).toContain('一句话');
    expect(validateDeck(ir).ok).toBe(true);
  });

  it('accepts both spaced (::: cue) and compact (:::cue) directives', () => {
    const ir = parseMarkdownToIR('# T\n::: layout cover\n:::cue 紧凑写法\n::: golden 带空格写法\n');
    const kinds = ir.slides[0].noteBlocks?.map((n) => n.kind);
    expect(kinds).toEqual(['cue', 'golden']);
  });

  it('generates globally-unique block ids', () => {
    const ir = parseMarkdownToIR(demo);
    const ids = new Set<string>();
    let dup = false;
    for (const s of ir.slides) {
      for (const blocks of Object.values(s.slots)) {
        for (const b of blocks) {
          if (ids.has(b.id)) dup = true;
          ids.add(b.id);
        }
      }
    }
    expect(dup).toBe(false);
  });
});
