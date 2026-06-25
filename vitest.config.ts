import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Internal packages resolve to their TypeScript source during dev/test.
// (The CLI bundles them at the app boundary in a later milestone.)
const pkg = (p: string) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@slidesmith/ir': pkg('ir'),
      '@slidesmith/themes': pkg('themes'),
      '@slidesmith/runtime': pkg('runtime'),
      '@slidesmith/engine': pkg('engine'),
      '@slidesmith/parser-md': pkg('parser-md'),
      '@slidesmith/qa': pkg('qa'),
      '@slidesmith/editor': pkg('editor'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
