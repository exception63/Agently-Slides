#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { validateDeck, type ValidationError } from '@slidesmith/ir';
import { parseMarkdownToIR } from '@slidesmith/parser-md';
import { renderDeckHtml, renderTranscriptHtml, renderPresenterHtml } from '@slidesmith/engine';
import { lintDeck, type LintIssue } from '@slidesmith/qa';
import { startEditor } from '@slidesmith/editor';
import { exportDeck, type ExportFormat } from './export';
import { auditDeck, type AuditFinding } from './audit';
import { startBridge, startMcp, DEFAULT_PORT } from '@slidesmith/bridge';

const STARTER = `---
theme: editorial
title: 新建演示
defaults:
  layout: bullets
---

# 标题写在这里
::: layout cover
::: note 这是封面对应的讲稿，可以用 **关键词** 提词。
:::cue 讲法提示（不念给观众）：开场先停两秒。
:::golden 想让全场记住的一句话。

---

## 这一页的小标题
- 第一点
- 第二点，可以用 **加粗** 强调
- 第三点
::: note 这一页要讲的话。
:::data 一个关键数字或事实。

---

::: layout two-col
::: slot left
## 左栏
- 左边内容
::: slot right
## 右栏
- 右边内容
::: note 两栏对比页的讲稿。

---

# 谢谢
::: layout end
`;

function loadIR(file: string): unknown {
  if (file === '-') return JSON.parse(readFileSync(0, 'utf8'));
  const raw = readFileSync(file, 'utf8');
  return extname(file).toLowerCase() === '.json' ? JSON.parse(raw) : parseMarkdownToIR(raw);
}

function printErrors(errors: ValidationError[]): void {
  console.error(`✗ ${errors.length} validation error(s):`);
  for (const e of errors) console.error(`  • ${e.path}: ${e.message} [${e.code}]`);
}

const LINT_ICON = { error: '✗', warn: '⚠', info: '·' } as const;
function printLint(issues: LintIssue[]): void {
  for (const it of issues) console.error(`  ${LINT_ICON[it.level]} ${it.path}: ${it.message} [${it.code}]`);
}

function printAudit(findings: AuditFinding[]): void {
  for (const f of findings) {
    const where = f.block ? `${f.slide}/${f.block}` : f.slide;
    console.error(`  ${LINT_ICON[f.level]} 第${f.index}页 ${where}: ${f.message} [${f.code}]`);
  }
}

function outName(file: string): string {
  if (file === '-') return 'deck';
  return basename(file).replace(/\.deck\.(md|json)$/i, '').replace(/\.(md|json)$/i, '') || 'deck';
}

const program = new Command();
program.name('slidesmith').description('AI-first HTML slides — Markdown/JSON → portable HTML deck').version('0.0.0');

program
  .command('new <name>')
  .description('scaffold a starter .deck.md')
  .option('-o, --out <dir>', 'output directory', '.')
  .action((name: string, opts: { out: string }) => {
    const file = join(opts.out, /\.md$/i.test(name) ? name : `${name}.deck.md`);
    if (existsSync(file)) { console.error(`✗ ${file} already exists`); process.exit(1); }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, STARTER, 'utf8');
    console.log(`✓ created ${file}`);
  });

program
  .command('validate <file>')
  .description('parse + validate a deck, then lint it (.md, .json, or - for stdin JSON)')
  .action((file: string) => {
    const res = validateDeck(loadIR(file));
    if (!res.ok) { printErrors(res.errors); process.exit(1); }
    console.log(`✓ valid — ${res.ir.slides.length} slides; anchors: ${res.anchors.join(', ')}`);
    const lint = lintDeck(res.ir);
    if (lint.issues.length) {
      console.error(`lint: ${lint.counts.error} error · ${lint.counts.warn} warn · ${lint.counts.info} info`);
      printLint(lint.issues);
      if (!lint.ok) process.exit(1);
    } else {
      console.log('✓ lint clean');
    }
  });

program
  .command('lint <file>')
  .description('lint a deck for likely product problems (overflow, missing alt/notes, empty slides)')
  .option('--strict', 'exit non-zero on warnings (not just errors)')
  .action((file: string, opts: { strict?: boolean }) => {
    const res = validateDeck(loadIR(file));
    if (!res.ok) { printErrors(res.errors); process.exit(1); }
    const lint = lintDeck(res.ir);
    console.log(`lint: ${lint.counts.error} error · ${lint.counts.warn} warn · ${lint.counts.info} info`);
    printLint(lint.issues);
    if (!lint.ok || (opts.strict && lint.counts.warn > 0)) process.exit(1);
    console.log('✓ ok');
  });

program
  .command('build <file>')
  .description('build a deck into single-file HTML: deck + transcript + presenter (.md, .json, or - for stdin JSON)')
  .option('-o, --out <dir>', 'output directory', 'dist')
  .option('-t, --theme <name>', 'theme override')
  .option('--deck-only', 'build only deck.html (skip transcript + presenter)')
  .action((file: string, opts: { out: string; theme?: string; deckOnly?: boolean }) => {
    const res = validateDeck(loadIR(file));
    if (!res.ok) { printErrors(res.errors); process.exit(1); }
    const base = outName(file);
    const theme = opts.theme;
    const transcriptName = `${base}.transcript.html`;
    const presenterName = `${base}.presenter.html`;
    mkdirSync(opts.out, { recursive: true });

    const deckHtml = renderDeckHtml(res.ir, {
      ...(theme ? { theme } : {}),
      ...(opts.deckOnly ? {} : { presenterUrl: presenterName }),
    });
    const deckFile = join(opts.out, `${base}.html`);
    writeFileSync(deckFile, deckHtml, 'utf8');
    console.log(`✓ built ${deckFile} — ${res.ir.slides.length} slides`);

    if (!opts.deckOnly) {
      const transcriptHtml = renderTranscriptHtml(res.ir, theme ? { theme } : {});
      writeFileSync(join(opts.out, transcriptName), transcriptHtml, 'utf8');
      console.log(`✓ built ${join(opts.out, transcriptName)} — 讲稿`);

      const presenterHtml = renderPresenterHtml(res.ir, {
        ...(theme ? { theme } : {}),
        transcriptUrl: transcriptName,
      });
      writeFileSync(join(opts.out, presenterName), presenterHtml, 'utf8');
      console.log(`✓ built ${join(opts.out, presenterName)} — 演讲者视图（主屏按 P 打开）`);
    }
  });

program
  .command('export <file>')
  .description('export a deck to PDF (one slide/page) or PNG (one file/slide) via headless Chromium')
  .option('-o, --out <dir>', 'output directory', 'dist')
  .option('-f, --format <fmt>', 'pdf | png', 'pdf')
  .option('-t, --theme <name>', 'theme override')
  .action(async (file: string, opts: { out: string; format: string; theme?: string }) => {
    const format = opts.format.toLowerCase();
    if (format !== 'pdf' && format !== 'png') {
      console.error(`✗ unknown --format "${opts.format}". Use pdf or png.`);
      process.exit(1);
    }
    const res = validateDeck(loadIR(file));
    if (!res.ok) { printErrors(res.errors); process.exit(1); }
    mkdirSync(opts.out, { recursive: true });
    try {
      const written = await exportDeck(res.ir, {
        format: format as ExportFormat,
        out: opts.out,
        base: outName(file),
        theme: opts.theme,
      });
      for (const f of written) console.log(`✓ ${f}`);
      console.log(
        format === 'pdf'
          ? `✓ exported PDF (${res.ir.slides.length} pages)`
          : `✓ exported ${written.length} image(s)`,
      );
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('audit <file>')
  .description('render the deck headless and check the *rendered* layout: overflow/clipping, contrast, broken images (catches what `lint` cannot)')
  .option('-o, --out <dir>', 'output directory for thumbnails', 'dist')
  .option('-t, --theme <name>', 'theme override')
  .option('--thumbs', 'write a PNG per slide so you can see the flagged slides')
  .option('--json', 'emit findings as JSON to stdout (machine-readable)')
  .action(async (file: string, opts: { out: string; theme?: string; thumbs?: boolean; json?: boolean }) => {
    const res = validateDeck(loadIR(file));
    if (!res.ok) { printErrors(res.errors); process.exit(1); }
    if (opts.thumbs) mkdirSync(opts.out, { recursive: true });
    try {
      const result = await auditDeck(res.ir, {
        out: opts.out,
        base: outName(file),
        theme: opts.theme,
        thumbs: opts.thumbs,
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(`visual audit: ${result.counts.error} error · ${result.counts.warn} warn · ${result.counts.info} info`);
        printAudit(result.findings);
        if (opts.thumbs && result.thumbs.length) console.log(`  ↳ thumbnails: ${result.thumbs[0]} … (${result.thumbs.length} 张)`);
        if (result.ok) console.log('✓ no visual errors');
      }
      if (!result.ok) process.exit(1);
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('doctor <file>')
  .description('one-shot pre-delivery gate for agents: validate + lint + visual audit (with thumbnails). Exit 1 on any error.')
  .option('-o, --out <dir>', 'output directory for thumbnails', 'dist')
  .option('-t, --theme <name>', 'theme override')
  .option('--no-thumbs', 'skip writing per-slide thumbnails')
  .action(async (file: string, opts: { out: string; theme?: string; thumbs?: boolean }) => {
    // 1) structure
    const res = validateDeck(loadIR(file));
    if (!res.ok) { printErrors(res.errors); process.exit(1); }
    console.log(`✓ valid IR — ${res.ir.slides.length} slides`);

    // 2) IR-level lint
    const lint = lintDeck(res.ir);
    console.log(`lint: ${lint.counts.error} error · ${lint.counts.warn} warn · ${lint.counts.info} info`);
    if (lint.issues.length) printLint(lint.issues);

    // 3) rendered visual audit (the new eyes)
    const wantThumbs = opts.thumbs !== false;
    if (wantThumbs) mkdirSync(opts.out, { recursive: true });
    let audit;
    try {
      audit = await auditDeck(res.ir, { out: opts.out, base: outName(file), theme: opts.theme, thumbs: wantThumbs });
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(1);
    }
    console.log(`visual: ${audit.counts.error} error · ${audit.counts.warn} warn · ${audit.counts.info} info`);
    if (audit.findings.length) printAudit(audit.findings);
    if (wantThumbs && audit.thumbs.length) console.log(`  ↳ 每页截图已存到 ${opts.out}/（看 [code] 标出的那几页）`);

    const ok = lint.ok && audit.ok;
    console.log(ok ? '✓ doctor: ready to build/deliver' : '✗ doctor: fix the errors above, then re-run');
    if (!ok) process.exit(1);
  });

program
  .command('serve [deck]')
  .description('start the local bridge: serves the Studio over http + WebSocket so Claude Code (MCP) and the browser Studio can talk. Optionally open a deck.')
  .option('-p, --port <n>', 'port', String(DEFAULT_PORT))
  .option('--no-open', 'do not auto-open the browser')
  .action(async (deck: string | undefined, opts: { port: string; open?: boolean }) => {
    try {
      const bridge = await startBridge({ port: parseInt(opts.port, 10) || DEFAULT_PORT });
      console.log(`✓ Slidesmith bridge running at ${bridge.url}`);
      if (deck) {
        if (!existsSync(deck)) { console.error(`✗ ${deck} not found`); process.exit(1); }
        const r = bridge.open(deck, false);
        console.log(`✓ loaded deck ${r.name} (${(r.bytes / 1024).toFixed(0)} KB)`);
      }
      if (opts.open !== false) { bridge.openBrowser(); console.log('  opening Studio in your browser…'); }
      else console.log(`  open ${bridge.url} in your browser to use the Studio (connected mode).`);
      bridge.on('request', (req) => console.log(`→ user submitted ${req.count} edit-request(s): ${req.name}`));
      console.log('  Ctrl+C to stop.');
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('run the bridge as an MCP server (stdio) for Claude Code: tools slidesmith_open / get_requests / apply_patch / status. stdout is the MCP stream — do not run interactively.')
  .option('-p, --port <n>', 'bridge http/ws port', String(DEFAULT_PORT))
  .action(async (opts: { port: string }) => {
    try {
      await startMcp({ port: parseInt(opts.port, 10) || DEFAULT_PORT });
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('edit <file>')
  .description('open the live-preview editor for a deck (.md or .json); saves to <name>.deck.json')
  .option('-p, --port <n>', 'port', '4321')
  .action(async (file: string, opts: { port: string }) => {
    if (!existsSync(file)) { console.error(`✗ ${file} not found`); process.exit(1); }
    try {
      const handle = await startEditor(file, { port: parseInt(opts.port, 10) || 4321 });
      console.log(`✓ Slidesmith editor running at ${handle.url}`);
      console.log('  open it in your browser; edits autosave to deck.json. Ctrl+C to stop.');
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
