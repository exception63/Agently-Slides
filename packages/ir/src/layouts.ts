// Built-in layout registry: layout name -> allowed slot keys (the "slot contract").
// A slide's slots keys must be a subset of its layout's contract.
// Themes may extend this later; M0 ships the v1 core set. (See ARCHITECTURE.md §4.)

export const LAYOUTS: Record<string, readonly string[]> = {
  cover: ['main'],
  section: ['main'],
  statement: ['main'],
  bullets: ['main'],
  'two-col': ['left', 'right'],
  'data-stat': ['main'],
  quote: ['main'],
  end: ['main'],
};

export const DEFAULT_LAYOUT = 'bullets';

export function isKnownLayout(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(LAYOUTS, name);
}

export function slotContract(name: string): readonly string[] | undefined {
  return LAYOUTS[name];
}
