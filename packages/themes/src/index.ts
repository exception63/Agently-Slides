import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export interface Theme {
  name: string;
  /** Full CSS (tokens + typography + components + layouts) to inline into the deck. */
  css: string;
}

const THEME_FILES: Record<string, string> = {
  editorial: join(here, 'editorial', 'theme.css'),
  'keynote-dark': join(here, 'keynote-dark', 'theme.css'),
  academic: join(here, 'academic', 'theme.css'),
};

export const DEFAULT_THEME = 'editorial';

/** Display order for runtime cycling (`T` key) — flagship first. */
export const THEME_ORDER = ['keynote-dark', 'editorial', 'academic'] as const;

export function listThemes(): string[] {
  return Object.keys(THEME_FILES);
}

export function getTheme(name: string = DEFAULT_THEME): Theme {
  const resolved = THEME_FILES[name] ? name : DEFAULT_THEME;
  return { name: resolved, css: readFileSync(THEME_FILES[resolved], 'utf8') };
}

/** All registered themes, ordered for the runtime switcher. */
export function allThemes(): Theme[] {
  const names = THEME_ORDER.filter((n) => THEME_FILES[n]);
  for (const n of Object.keys(THEME_FILES)) if (!names.includes(n as never)) names.push(n as never);
  return names.map((n) => ({ name: n, css: readFileSync(THEME_FILES[n], 'utf8') }));
}
