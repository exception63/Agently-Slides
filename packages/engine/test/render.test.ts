import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderDeckHtml, renderTranscriptHtml, renderPresenterHtml } from '../src/index';
import { validateDeck } from '@slidesmith/ir';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const examplesDir = join(root, 'examples');
const previewDir = join(examplesDir, 'preview');

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(examplesDir, name), 'utf8'));
}

function emit(name: string, html: string): void {
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(join(previewDir, name), html, 'utf8');
}

describe('renderDeckHtml', () => {
  it('renders minimal deck into a self-contained HTML document', () => {
    const deck = load('minimal.deck.json');
    expect(validateDeck(deck).ok).toBe(true);
    const html = renderDeckHtml(deck as never);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('演示即数据');
    expect(html).toContain('class="slide"');
    expect(html).toContain('window.__SM__');
    // single-file: no external resources
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    emit('minimal.html', html);
  });

  it('renders with-notes deck and embeds derived anchors == slide ids', () => {
    const deck = load('with-notes.deck.json');
    const html = renderDeckHtml(deck as never);
    expect(html).toContain('18%');
    expect(html).toContain('"anchors":["s1","s2","s3"]');
    emit('with-notes.html', html);
  });

  it('renders every block type', () => {
    const deck = {
      ir_version: '1.0',
      slides: [
        {
          id: 's1',
          layout: 'bullets',
          slots: {
            main: [
              { id: 'h', type: 'heading', text: 'H', level: 2 },
              { id: 't', type: 'text', text: 'a **b**' },
              { id: 'l', type: 'list', items: ['x', 'y'] },
              { id: 'img', type: 'image', src: 'pic.png', alt: 'cap' },
              { id: 'c', type: 'code', code: 'const a=1;', lang: 'js' },
              { id: 'q', type: 'quote', text: 'wise', cite: 'me' },
              { id: 'tb', type: 'table', headers: ['A'], rows: [['1']] },
              { id: 'ch', type: 'chart', chartType: 'bar', data: [] },
              { id: 'g', type: 'group', children: [{ id: 'gi', type: 'text', text: 'in' }] },
            ],
          },
        },
      ],
    };
    const html = renderDeckHtml(deck as never);
    expect(html).toContain('<h2');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<ul');
    expect(html).toContain('<img src="pic.png"');
    expect(html).toContain('<pre');
    expect(html).toContain('<blockquote');
    expect(html).toContain('<table');
    expect(html).toContain('data-chart="bar"');
    expect(html).toContain('blk group group-col');
  });

  it('maps style tokens to utility classes (no inline color styles in markup)', () => {
    const deck = load('minimal.deck.json');
    const html = renderDeckHtml(deck as never);
    expect(html).toContain('c-accent');
    expect(html).toContain('fs-display');
    // slide blocks carry classes, not inline color styles
    const body = html.slice(html.indexOf('<body'));
    expect(body).not.toMatch(/style="[^"]*color:/i);
  });

  it('deck embeds presenterUrl + exposes the present button', () => {
    const deck = load('with-notes.deck.json');
    const html = renderDeckHtml(deck as never, { presenterUrl: 'x.presenter.html' });
    expect(html).toContain('data-act="present"');
    expect(html).toContain('"presenterUrl":"x.presenter.html"');
    expect(html).toContain('"segs":');
  });

  it('inlines all themes media-gated; active is "all", others "not all"', () => {
    const deck = load('minimal.deck.json');
    const html = renderDeckHtml(deck as never, { theme: 'keynote-dark' });
    expect(html).toContain('data-sm-theme="keynote-dark" media="all"');
    expect(html).toContain('data-sm-theme="editorial" media="not all"');
    expect(html).toContain('"themes":["keynote-dark","editorial","academic"]');
    expect(html).toContain('"theme":"keynote-dark"');
  });

  it('emits declarative animation attributes from block.build', () => {
    const deck = load('minimal.deck.json');
    const html = renderDeckHtml(deck as never);
    // minimal.deck.json has a stagger-list build on the pillars list
    expect(html).toContain('data-anim="stagger-list"');
    expect(html).toContain('data-anim-mode="by-item"');
    expect(html).toContain('data-anim-stagger="80"');
  });

  it('emits continuous motion effects from block.build.motion', () => {
    const deck = {
      ir_version: '1.0',
      slides: [
        {
          id: 's1',
          layout: 'cover',
          slots: {
            main: [
              { id: 'b1', type: 'heading', text: 'Glow', level: 1, build: { anim: 'pop', motion: 'glow' } },
              { id: 'b2', type: 'text', text: 'still', build: { motion: 'none' } },
            ],
          },
        },
      ],
    };
    expect(validateDeck(deck).ok).toBe(true);
    const html = renderDeckHtml(deck as never);
    expect(html).toContain('data-anim="pop"');
    expect(html).toContain('data-motion="glow"');
    // motion:'none' is not emitted
    expect(html).not.toContain('data-motion="none"');
  });
});

describe('renderTranscriptHtml', () => {
  it('renders a self-contained transcript whose anchors === slide ids', () => {
    const deck = load('with-notes.deck.json');
    const html = renderTranscriptHtml(deck as never);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('逐字稿');
    expect(html).toContain('class="smt-slide" id="s1"');
    expect(html).toContain('class="smt-slide" id="s2"');
    expect(html).toContain('class="smt-slide" id="s3"');
    // single-file, no external resources
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    emit('with-notes.transcript.html', html);
  });

  it('renders cue / golden / data note blocks with inline emphasis', () => {
    const deck = {
      ir_version: '1.0',
      slides: [
        {
          id: 's1',
          layout: 'cover',
          notes: '正文 **强调**',
          noteBlocks: [
            { kind: 'cue', text: '讲法提示' },
            { kind: 'golden', text: '金句一句' },
            { kind: 'data', text: '42% 增长' },
          ],
          slots: { main: [{ id: 'h', type: 'heading', text: '标题', level: 1 }] },
        },
      ],
    };
    expect(validateDeck(deck).ok).toBe(true);
    const html = renderTranscriptHtml(deck as never);
    expect(html).toContain('smt-note--cue');
    expect(html).toContain('smt-note--golden');
    expect(html).toContain('smt-note--data');
    expect(html).toContain('<strong>强调</strong>');
  });
});

describe('renderPresenterHtml', () => {
  it('renders a dark presenter shell that injects boot + loads transcript', () => {
    const deck = load('with-notes.deck.json');
    const html = renderPresenterHtml(deck as never, { transcriptUrl: 'with-notes.transcript.html' });
    expect(html).toContain('id="smpFrame"');
    expect(html).toContain('window.__SMP__');
    expect(html).toContain('"anchors":["s1","s2","s3"]');
    expect(html).toContain('"transcriptUrl":"with-notes.transcript.html"');
    // primary sync channel is window.opener postMessage (not BroadcastChannel)
    expect(html).toContain('window.opener');
    expect(html).not.toContain('new BroadcastChannel');
    emit('with-notes.presenter.html', html);
  });
});
