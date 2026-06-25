import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { irToMarkdown } from '../src/index';
import { parseMarkdownToIR } from '@slidesmith/parser-md';
import { validateDeck } from '@slidesmith/ir';

const here = dirname(fileURLToPath(import.meta.url));
const demoMd = readFileSync(join(here, '..', '..', '..', 'examples', 'demo.deck.md'), 'utf8');

describe('irToMarkdown', () => {
  it('round-trips demo deck: MD -> IR -> MD -> IR preserves structure', () => {
    const ir1 = parseMarkdownToIR(demoMd);
    const md2 = irToMarkdown(ir1);
    const ir2 = parseMarkdownToIR(md2);

    expect(validateDeck(ir2).ok).toBe(true);
    expect(ir2.theme).toBe(ir1.theme);
    expect(ir2.slides.length).toBe(ir1.slides.length);
    ir1.slides.forEach((s1, i) => {
      const s2 = ir2.slides[i];
      expect(s2.layout).toBe(s1.layout);
      expect(s2.notes).toBe(s1.notes);
      expect((s2.noteBlocks ?? []).map((n) => n.kind)).toEqual((s1.noteBlocks ?? []).map((n) => n.kind));
      expect(Object.keys(s2.slots).sort()).toEqual(Object.keys(s1.slots).sort());
    });
  });

  it('emits frontmatter, slide separators, and note-block directives', () => {
    const ir = parseMarkdownToIR(demoMd);
    const md = irToMarkdown(ir);
    expect(md).toMatch(/^---\ntheme: editorial/);
    expect(md).toContain('\n---\n'); // slide separators
    expect(md).toContain(':::golden');
    expect(md).toContain('::: note');
  });

  it('serializes two-col slides with explicit slot directives', () => {
    const ir = parseMarkdownToIR(demoMd);
    const md = irToMarkdown(ir);
    expect(md).toContain('::: slot left');
    expect(md).toContain('::: slot right');
  });
});
