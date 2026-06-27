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

// animation library gallery (the WYSIWYG picker, reused as the Studio's effect-browser sub-window)
const galleryHtml = read(
  join(root, 'plugin/slidesmith/skills/editorial-slides/gallery/animations.html'),
);
const animGalleryMod = `export const galleryHtml = ${JSON.stringify(galleryHtml)};`;

// canvas FX engine (the "J · Canvas 特效" library) — injected into every assembled deck so
// data-fx effects actually run in the Studio preview + export, same as a built editorial deck.
const fxCanvasJs = read(
  join(root, 'plugin/slidesmith/skills/editorial-slides/assets/_fx-canvas.js'),
);
const fxCanvasMod = `export const fxCanvasJs = ${JSON.stringify(fxCanvasJs)};`;

// editorial-slides 的 21 张皮，做成「可注入 bundle」：Studio 换皮下拉选一个，就把这套 CSS 叠加
// 到当前 deck 上重新着皮。薄皮需要共享的组件层 + 版式层；厚皮自带组件，但仍要版式层（P4）。
const edDir = join(root, 'plugin/slidesmith/skills/editorial-slides/assets');
const componentsCss = read(join(edDir, '_components.css'));
const layoutsCss = read(join(edDir, '_layouts.css'));
const SKIN_ORDER = ['editorial', 'academic', 'keynote-dark', 'acrylic', 'cartesian', 'signal', 'vellum', 'daisy-days',
  'dracula', 'nord', 'tokyo-night', 'catppuccin-mocha', 'catppuccin-latte', 'vaporwave', 'swiss-grid',
  'bauhaus', 'cyberpunk-neon', 'glassmorphism', 'y2k-chrome', 'neo-brutalism', 'terminal-green', 'rose-pine'];
const SKIN_LABEL = { editorial: '杂志风', academic: '学术', 'keynote-dark': '暗场主旨', acrylic: '亚克力毛玻璃', cartesian: '极简网格',
  signal: '机构正式', vellum: '暗色学术', 'daisy-days': '温暖活泼', dracula: 'Dracula', nord: 'Nord',
  'tokyo-night': '东京夜', 'catppuccin-mocha': 'Catppuccin Mocha', 'catppuccin-latte': 'Catppuccin Latte',
  vaporwave: '蒸汽波', 'swiss-grid': '瑞士网格', bauhaus: '包豪斯', 'cyberpunk-neon': '赛博朋克',
  glassmorphism: '玻璃拟态', 'y2k-chrome': 'Y2K 铬', 'neo-brutalism': '新野兽派', 'terminal-green': '终端绿', 'rose-pine': 'Rosé Pine' };
const SKIN_DARK = new Set(['keynote-dark', 'acrylic', 'vellum', 'dracula', 'nord', 'tokyo-night', 'catppuccin-mocha',
  'vaporwave', 'cyberpunk-neon', 'glassmorphism', 'terminal-green', 'rose-pine']);
const skinBundles = {};
for (const n of SKIN_ORDER) {
  const css = read(join(edDir, 'skins', n + '.css'));
  const thin = css.includes('/* uses-base */');
  const fontM = css.match(/\/\*\s*FONTS\s+(\S+)\s*\*\//);
  const bundle = (thin ? componentsCss + '\n' + layoutsCss : layoutsCss) + '\n' + css;
  skinBundles[n] = { css: bundle, font: fontM ? fontM[1] : '', label: SKIN_LABEL[n] || n, dark: SKIN_DARK.has(n) };
}
const skinsMod = `
export const SKINS = ${JSON.stringify(skinBundles)};
export const SKIN_ORDER = ${JSON.stringify(SKIN_ORDER)};
`;

const virtualPlugin = {
  name: 'slidesmith-virtual',
  setup(build) {
    const virt = {
      '@slidesmith/runtime': runtimeMod,
      '@slidesmith/themes': themesMod,
      '@slidesmith/anim-gallery': animGalleryMod,
      '@slidesmith/fx-canvas': fxCanvasMod,
      '@slidesmith/skins': skinsMod,
      'gray-matter': grayMatterShim,
    };
    build.onResolve({ filter: /^(@slidesmith\/(runtime|themes|anim-gallery|fx-canvas|skins)|gray-matter)$/ }, (args) => ({
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
