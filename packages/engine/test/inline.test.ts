import { describe, it, expect } from 'vitest';
import { inlineMd, escapeHtml } from '../src/inline';

describe('inline', () => {
  it('converts **bold** to <strong>', () => {
    expect(inlineMd('a **b** c')).toBe('a <strong>b</strong> c');
  });
  it('escapes HTML', () => {
    expect(escapeHtml('<x> & "y"')).toBe('&lt;x&gt; &amp; &quot;y&quot;');
  });
  it('escapes before applying markdown (no injection)', () => {
    expect(inlineMd('<b> **x**')).toBe('&lt;b&gt; <strong>x</strong>');
  });
});
