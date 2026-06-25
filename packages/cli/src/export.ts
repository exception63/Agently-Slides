import { join } from 'node:path';
import type { Deck } from '@slidesmith/ir';
import { renderDeckHtml } from '@slidesmith/engine';

export type ExportFormat = 'pdf' | 'png';

export interface ExportOptions {
  format: ExportFormat;
  out: string;
  base: string;
  theme?: string;
}

/**
 * Render a deck to PDF (one slide per page, 1920x1080) or PNG (one file per
 * slide) using headless Chromium via playwright-core. playwright-core is loaded
 * lazily so the rest of the CLI works without it. Returns the written paths.
 */
export async function exportDeck(deck: Deck, opts: ExportOptions): Promise<string[]> {
  let chromium: typeof import('playwright-core').chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error(
      'export needs playwright-core + a browser. Install with:\n' +
        '  npm i -w @slidesmith/cli playwright-core\n' +
        '  npx playwright-core install chromium-headless-shell',
    );
  }

  const html = renderDeckHtml(deck, opts.theme ? { theme: opts.theme } : {});
  const browser = await chromium.launch({ headless: true });
  const written: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(html, { waitUntil: 'load' });

    if (opts.format === 'pdf') {
      await page.emulateMedia({ media: 'print' });
      const file = join(opts.out, `${opts.base}.pdf`);
      await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
      written.push(file);
    } else {
      // PNG: present mode (chrome hidden), animations off for a clean still
      await page.evaluate(() => {
        document.body.classList.add('present');
        document.body.classList.remove('anim');
        const nav = document.querySelector('.sm-nav') as HTMLElement | null;
        if (nav) nav.style.display = 'none';
      });
      const total = (await page.evaluate(() => (window as unknown as { __SM_TOTAL__: number }).__SM_TOTAL__)) || deck.slides.length;
      const pad = String(total).length;
      for (let i = 0; i < total; i++) {
        await page.evaluate((n) => (window as unknown as { __SM_GO__: (n: number) => void }).__SM_GO__(n), i);
        await page.waitForTimeout(80);
        const file = join(opts.out, `${opts.base}-${String(i + 1).padStart(pad, '0')}.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
        written.push(file);
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}
