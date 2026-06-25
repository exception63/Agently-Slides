import type { Deck, Slide, Block } from './types';

// Anchors are derived ONCE from slide ids and are the single source of truth
// shared by deck / transcript / presenter — eliminating the manual 3-way sync
// that the legacy skills required. (See ARCHITECTURE.md §7.)
export function deriveAnchors(deck: Deck): string[] {
  return deck.slides.map((s) => s.id);
}

/**
 * The slide's display title: first heading, else the first quote/text content
 * (trimmed), else its id. Used for deck nav + transcript/presenter titles.
 */
export function slideTitle(slide: Slide): string {
  const trim = (s: string): string => {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > 28 ? t.slice(0, 27) + '…' : t;
  };
  const all: Block[] = [];
  for (const blocks of Object.values(slide.slots)) all.push(...(blocks as Block[]));
  for (const b of all) if (b.type === 'heading') return b.text;
  for (const b of all) if (b.type === 'quote') return trim(b.text);
  for (const b of all) if (b.type === 'text') return trim(b.text);
  return slide.id;
}

/** Per-slide metadata aligned 1:1 with the derived anchors. */
export interface SlideMeta {
  idx: number;
  /** === slide.id: the single anchor shared by deck/transcript/presenter. */
  anchor: string;
  /** segment key (`seg`), or '' when the slide has none. */
  seg: string;
  /** segment display name (`segName`), or '' when the slide has none. */
  segName: string;
  title: string;
}

/**
 * Derive the anchor-aligned slide metadata (anchor + seg + title) used by the
 * transcript and presenter views. Computed once from the IR so all three
 * artifacts stay consistent across re-builds (insert/reorder a slide -> rebuild
 * -> anchors never drift).
 */
export function deriveSlideMeta(deck: Deck): SlideMeta[] {
  return deck.slides.map((s, idx) => ({
    idx,
    anchor: s.id,
    seg: s.seg ?? '',
    segName: s.segName ?? '',
    title: slideTitle(s),
  }));
}
