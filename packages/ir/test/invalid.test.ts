import { describe, it, expect } from 'vitest';
import { validateDeck } from '../src/index';

describe('invalid IR produces readable errors', () => {
  it('rejects an unsupported ir_version', () => {
    const res = validateDeck({
      ir_version: '9.9',
      slides: [{ id: 's1', layout: 'cover', slots: { main: [] } }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.code === 'version.unsupported')).toBe(true);
  });

  it('rejects duplicate slide ids', () => {
    const res = validateDeck({
      ir_version: '1.0',
      slides: [
        { id: 'dup', layout: 'cover', slots: { main: [{ id: 'a', type: 'text', text: 'x' }] } },
        { id: 'dup', layout: 'cover', slots: { main: [{ id: 'b', type: 'text', text: 'y' }] } },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.code === 'id.duplicate' && e.path.includes('slides[1].id'))).toBe(true);
    }
  });

  it('rejects duplicate block ids across slides', () => {
    const res = validateDeck({
      ir_version: '1.0',
      slides: [
        { id: 's1', layout: 'cover', slots: { main: [{ id: 'b', type: 'text', text: 'x' }] } },
        { id: 's2', layout: 'cover', slots: { main: [{ id: 'b', type: 'text', text: 'y' }] } },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.code === 'id.duplicate')).toBe(true);
  });

  it('rejects an unknown layout', () => {
    const res = validateDeck({ ir_version: '1.0', slides: [{ id: 's1', layout: 'nope', slots: {} }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.code === 'layout.unknown')).toBe(true);
  });

  it('rejects a slot not in the layout contract', () => {
    const res = validateDeck({
      ir_version: '1.0',
      slides: [{ id: 's1', layout: 'cover', slots: { sidebar: [{ id: 'b', type: 'text', text: 'x' }] } }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.code === 'slot.unknown')).toBe(true);
  });

  it('rejects an inline hex color (must use a token name)', () => {
    const res = validateDeck({
      ir_version: '1.0',
      slides: [{ id: 's1', layout: 'cover', slots: { main: [{ id: 'b', type: 'heading', text: 'x', style: { color: '#ff0000' } }] } }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.path.includes('color'))).toBe(true);
  });

  it('rejects an unknown block type', () => {
    const res = validateDeck({
      ir_version: '1.0',
      slides: [{ id: 's1', layout: 'cover', slots: { main: [{ id: 'b', type: 'video', src: 'x' }] } }],
    });
    expect(res.ok).toBe(false);
  });

  it('rejects unknown top-level keys (strict schema)', () => {
    const res = validateDeck({
      ir_version: '1.0',
      surprise: true,
      slides: [{ id: 's1', layout: 'cover', slots: { main: [] } }],
    });
    expect(res.ok).toBe(false);
  });

  it('rejects a non-object input', () => {
    expect(validateDeck(null).ok).toBe(false);
    expect(validateDeck('nope').ok).toBe(false);
    expect(validateDeck({ ir_version: '1.0', slides: [] }).ok).toBe(false);
  });
});
