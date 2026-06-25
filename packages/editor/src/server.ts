import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, basename, dirname, join } from 'node:path';
import { validateDeck, LAYOUTS, ANIM_NAMES } from '@slidesmith/ir';
import type { Deck } from '@slidesmith/ir';
import { parseMarkdownToIR } from '@slidesmith/parser-md';
import { renderDeckHtml, renderTranscriptHtml, renderPresenterHtml } from '@slidesmith/engine';
import { listThemes } from '@slidesmith/themes';
import { editorAppHtml } from './app';
import { previewBridge } from './bridge';

export interface EditorHandle {
  url: string;
  close(): Promise<void>;
}

export interface EditorOptions {
  port?: number;
  host?: string;
}

function loadDeck(file: string): Deck {
  const raw = readFileSync(file, 'utf8');
  const ir = extname(file).toLowerCase() === '.json' ? JSON.parse(raw) : parseMarkdownToIR(raw);
  const res = validateDeck(ir);
  if (!res.ok) {
    throw new Error('invalid deck:\n' + res.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n'));
  }
  return res.ir;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}
function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

/**
 * Start the local Slidesmith editor: a browser app that live-previews the deck
 * (reusing the render engine), lets the user inline-edit text and tweak
 * theme/layout/animation/slides via panels, and saves back to deck.json — all
 * with zero AI calls. (ARCHITECTURE §11.)
 */
export function startEditor(file: string, opts: EditorOptions = {}): Promise<EditorHandle> {
  let deck = loadDeck(file);
  const outDir = dirname(file) || '.';
  const base =
    basename(file)
      .replace(/\.deck\.(md|json)$/i, '')
      .replace(/\.(md|json)$/i, '') || 'deck';
  const jsonPath = join(outDir, `${base}.deck.json`);

  const meta = {
    themes: listThemes(),
    layouts: Object.keys(LAYOUTS),
    layoutSlots: LAYOUTS,
    anims: ANIM_NAMES as readonly string[],
    file: base,
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (req.method === 'GET' && path === '/') return sendHtml(res, editorAppHtml(deck.metadata?.title ?? base));
      if (req.method === 'GET' && path === '/preview') {
        const html = renderDeckHtml(deck).replace('</body>', `<script>\n${previewBridge}\n</script>\n</body>`);
        return sendHtml(res, html);
      }
      if (req.method === 'GET' && path === '/api/deck') return sendJson(res, 200, deck);
      if (req.method === 'GET' && path === '/api/meta') return sendJson(res, 200, meta);

      if (req.method === 'POST' && path === '/api/deck') {
        const body = await readBody(req);
        const parsed = JSON.parse(body);
        const result = validateDeck(parsed);
        if (!result.ok) return sendJson(res, 400, { ok: false, errors: result.errors });
        deck = result.ir;
        writeFileSync(jsonPath, JSON.stringify(deck, null, 2), 'utf8');
        return sendJson(res, 200, { ok: true, saved: jsonPath });
      }

      if (req.method === 'POST' && path === '/api/rebuild') {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(jsonPath, JSON.stringify(deck, null, 2), 'utf8');
        const transcriptName = `${base}.transcript.html`;
        const presenterName = `${base}.presenter.html`;
        writeFileSync(join(outDir, `${base}.html`), renderDeckHtml(deck, { presenterUrl: presenterName }), 'utf8');
        writeFileSync(join(outDir, transcriptName), renderTranscriptHtml(deck), 'utf8');
        writeFileSync(join(outDir, presenterName), renderPresenterHtml(deck, { transcriptUrl: transcriptName }), 'utf8');
        return sendJson(res, 200, {
          ok: true,
          files: [`${base}.html`, transcriptName, presenterName, `${base}.deck.json`],
          dir: outDir,
        });
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    } catch (e) {
      sendJson(res, 500, { ok: false, error: (e as Error).message });
    }
  });

  return new Promise((resolve) => {
    server.listen(opts.port ?? 4321, opts.host ?? '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 4321);
      resolve({
        url: `http://${opts.host ?? '127.0.0.1'}:${port}/`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
