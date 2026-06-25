#!/usr/bin/env node
// Build the self-contained Slidesmith Studio: bundle the browser app + inline
// all assets/themes into a single HTML file you can just open (file://).
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(root, 'packages', ...p);
const read = (p) => readFileSync(p, 'utf8');
const outFile = process.argv[2] || join(root, 'studio', 'slidesmith-studio.html');

// --- gather inlined assets at build time ---
const runtimeDir = P('runtime', 'src');
const runtimeMod = `
export const coreCss = ${JSON.stringify(read(join(runtimeDir, 'core.css')))};
export const runtimeJs = ${JSON.stringify(read(join(runtimeDir, 'engine.js')))};
export const transcriptCss = ${JSON.stringify(read(join(runtimeDir, 'transcript.css')))};
export const transcriptJs = ${JSON.stringify(read(join(runtimeDir, 'transcript.js')))};
export const presenterCss = ${JSON.stringify(read(join(runtimeDir, 'presenter.css')))};
export const presenterJs = ${JSON.stringify(read(join(runtimeDir, 'presenter.js')))};
`;

const themesDir = P('themes', 'src');
const themeNames = readdirSync(themesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const themeCssMap = {};
for (const n of themeNames) themeCssMap[n] = read(join(themesDir, n, 'theme.css'));
const themesMod = `
const THEMES = ${JSON.stringify(themeCssMap)};
const ORDER = ['keynote-dark','editorial','academic'].filter(function(n){return THEMES[n];});
Object.keys(THEMES).forEach(function(n){ if(ORDER.indexOf(n)<0) ORDER.push(n); });
export const DEFAULT_THEME = 'editorial';
export const THEME_ORDER = ORDER;
export function listThemes(){ return Object.keys(THEMES); }
export function getTheme(name){ var n = THEMES[name] ? name : DEFAULT_THEME; return { name:n, css:THEMES[n] }; }
export function allThemes(){ return ORDER.map(function(n){ return { name:n, css:THEMES[n] }; }); }
`;

// browser-safe frontmatter parser (replaces gray-matter's Node Buffer deps).
// Handles the fields parser-md reads: top-level scalars + one nested map (defaults).
const grayMatterShim = `
function scalar(v){ v=v.trim(); if((v[0]==='"'&&v.slice(-1)==='"')||(v[0]==="'"&&v.slice(-1)==="'")) return v.slice(1,-1); return v; }
export default function matter(src){
  src = String(src).replace(/\\r\\n/g,'\\n');
  var m = /^---\\n([\\s\\S]*?)\\n---\\n?/.exec(src);
  if(!m) return { data:{}, content:src };
  var content = src.slice(m[0].length);
  var data = {}, cur = null;
  m[1].split('\\n').forEach(function(line){
    if(!line.trim()) return;
    var indented = /^\\s+/.test(line);
    var mm = /^\\s*([A-Za-z0-9_-]+):\\s*(.*)$/.exec(line);
    if(!mm) return;
    var key = mm[1], val = mm[2];
    if(!indented){ if(val===''){ cur={}; data[key]=cur; } else { data[key]=scalar(val); cur=null; } }
    else if(cur){ cur[key]=scalar(val); }
  });
  return { data:data, content:content };
}
`;

const virtualPlugin = {
  name: 'slidesmith-virtual',
  setup(build) {
    const virt = {
      '@slidesmith/runtime': runtimeMod,
      '@slidesmith/themes': themesMod,
      'gray-matter': grayMatterShim,
    };
    build.onResolve({ filter: /^(@slidesmith\/(runtime|themes)|gray-matter)$/ }, (args) => ({
      path: args.path,
      namespace: 'sm-virtual',
    }));
    build.onLoad({ filter: /.*/, namespace: 'sm-virtual' }, (args) => ({
      contents: virt[args.path],
      loader: 'js',
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [P('studio', 'src', 'main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2019',
  write: false,
  alias: {
    '@slidesmith/ir': P('ir', 'src', 'index.ts'),
    '@slidesmith/engine': P('engine', 'src', 'index.ts'),
    '@slidesmith/parser-md': P('parser-md', 'src', 'index.ts'),
  },
  plugins: [virtualPlugin],
  logLevel: 'info',
});

const js = result.outputFiles[0].text;
const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Slidesmith Studio</title>
</head>
<body>
<script>${js}</script>
</body>
</html>`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ built ${outFile} (${kb} KB, self-contained)`);
