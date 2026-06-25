import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Structural CSS for the deck chrome + stage (theme-agnostic mechanics). */
export const coreCss: string = readFileSync(join(here, 'core.css'), 'utf8');

/** Browser runtime JS (navigation, scaling, thumbnails, presenter sync) for the deck. */
export const runtimeJs: string = readFileSync(join(here, 'engine.js'), 'utf8');

/** Transcript document CSS (magazine reading layout; reuses theme tokens). */
export const transcriptCss: string = readFileSync(join(here, 'transcript.css'), 'utf8');

/** Transcript runtime JS (embedded scroll/highlight/cue listener + key forwarding). */
export const transcriptJs: string = readFileSync(join(here, 'transcript.js'), 'utf8');

/** Presenter shell CSS (dark second-screen chrome). */
export const presenterCss: string = readFileSync(join(here, 'presenter.css'), 'utf8');

/** Presenter runtime JS (window.opener postMessage primary sync channel). */
export const presenterJs: string = readFileSync(join(here, 'presenter.js'), 'utf8');
