import { describe, it, expect } from 'vitest';
import { lintDeck } from '../src/index';
import type { Deck } from '@slidesmith/ir';

describe('lintDeck', () => {
  it('passes a clean deck and reports missing notes as info', () => {
    const deck: Deck = {
      ir_version: '1.0',
      slides: [
        {
          id: 's1',
          layout: 'cover',
          notes: '讲稿',
          slots: { main: [{ id: 'h', type: 'heading', text: '标题', level: 1 }] },
        },
        {
          id: 's2',
          layout: 'bullets',
          slots: { main: [{ id: 'h2', type: 'heading', text: '要点', level: 2 }] },
        },
      ],
    };
    const r = lintDeck(deck);
    expect(r.ok).toBe(true);
    expect(r.counts.error).toBe(0);
    // s2 has no notes -> info
    expect(r.issues.some((i) => i.code === 'notes.missing' && i.path === 'slides[1]')).toBe(true);
  });

  it('flags empty slides as errors and image-without-alt + overflow as warnings', () => {
    const deck: Deck = {
      ir_version: '1.0',
      slides: [
        { id: 's1', layout: 'bullets', notes: 'x', slots: { main: [] } },
        {
          id: 's2',
          layout: 'bullets',
          notes: 'x',
          slots: {
            main: [
              { id: 'img', type: 'image', src: 'a.png' },
              { id: 'l', type: 'list', items: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] },
            ],
          },
        },
      ],
    };
    const r = lintDeck(deck);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'slide.empty' && i.level === 'error')).toBe(true);
    expect(r.issues.some((i) => i.code === 'image.no-alt' && i.level === 'warn')).toBe(true);
    expect(r.issues.some((i) => i.code === 'list.long' && i.level === 'warn')).toBe(true);
  });

  it('detects duplicate consecutive titles', () => {
    const deck: Deck = {
      ir_version: '1.0',
      slides: [
        { id: 's1', layout: 'bullets', notes: 'x', slots: { main: [{ id: 'a', type: 'heading', text: '同名', level: 2 }] } },
        { id: 's2', layout: 'bullets', notes: 'x', slots: { main: [{ id: 'b', type: 'heading', text: '同名', level: 2 }] } },
      ],
    };
    const r = lintDeck(deck);
    expect(r.issues.some((i) => i.code === 'title.duplicate')).toBe(true);
  });
});
