import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateDeck, deriveAnchors, deckJsonSchema } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, '..', '..', '..', 'examples');

function loadExample(name: string): unknown {
  return JSON.parse(readFileSync(join(examplesDir, name), 'utf8'));
}

describe('valid IR examples', () => {
  it('validates minimal.deck.json and derives one anchor per slide', () => {
    const res = validateDeck(loadExample('minimal.deck.json'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.anchors.length).toBe(res.ir.slides.length);
      expect(res.anchors).toEqual(['s1', 's2', 's3', 's4']);
    }
  });

  it('validates with-notes.deck.json; anchors come from slide ids', () => {
    const res = validateDeck(loadExample('with-notes.deck.json'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.anchors).toEqual(res.ir.slides.map((s) => s.id));
    }
  });

  it('deriveAnchors is the single source of truth (matches slide ids)', () => {
    const res = validateDeck(loadExample('minimal.deck.json'));
    if (res.ok) {
      expect(deriveAnchors(res.ir)).toEqual(res.anchors);
    }
  });

  it('exports a JSON Schema for external tooling', () => {
    const schema = deckJsonSchema();
    expect(schema).toBeTypeOf('object');
    expect(JSON.stringify(schema)).toContain('SlidesmithDeck');
  });
});
