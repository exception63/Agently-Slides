// Verify the "连接 Claude" one-click flow: CORS + /api/open hand-off on the bridge,
// and the offline Studio's connect button → probe → detected → "打开连接版".
// Run: npx tsx scripts/verify-connect.mjs
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// imports TS bridge sources → needs tsx. Re-exec under tsx if launched with plain node.
if (!process.env.SM_TSX) {
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SM_TSX: '1' } });
  process.exit(r.status ?? 1);
}
const { startBridge } = await import('../packages/bridge/src/index.ts');
const root = process.cwd();
const studio = 'file://' + resolve(root, 'studio/slidesmith-studio.html');
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
const out = []; const ck = (n, o, x = '') => { out.push((o ? '✓' : '✗') + ' ' + n + (x ? ' — ' + x : '')); };

const bridge = await startBridge({ port: 0 });           // test bridge on an ephemeral port
const base = bridge.url;                                   // e.g. http://localhost:54xxx/
// --- bridge: CORS preflight + healthz CORS + /api/open hand-off ---
const pre = await fetch(base + 'api/status', { method: 'OPTIONS' });
ck('OPTIONS preflight → 204 + CORS', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*');
const hz = await fetch(base + 'healthz');
ck('healthz exposes CORS header', hz.headers.get('access-control-allow-origin') === '*');
await fetch(base + 'api/open?name=keynote-target.html', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: keynote });
ck('POST /api/open loads the deck into the bridge', bridge.status().hasDeck && bridge.status().deckName === 'keynote-target.html');

// --- Studio: offline connect button → modal → probe finds the (test) bridge ---
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.addInitScript((u) => { window.__SM_BRIDGE_URL__ = u; }, base);  // point probe at our test bridge
  await page.goto(studio, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_IMPORT__ === 'function');
  await page.evaluate((h) => window.__SM_IMPORT__('keynote-target.html', h), keynote);
  await page.waitForTimeout(300);
  ck('offline mode shows the 🔌 连接 Claude button', await page.$eval('#connectBtn', (e) => e.style.display !== 'none'));
  await page.click('#connectBtn'); await page.waitForTimeout(200);
  ck('clicking opens the connect modal', await page.$eval('#connectModal', (e) => e.style.display === 'flex'));
  await page.waitForFunction(() => !!document.querySelector('#cgo'), { timeout: 5000 });   // probe detects bridge → 打开连接版 appears
  ck('bridge detected → shows ✅ + 打开连接版 button', await page.$eval('#cstate', (e) => /检测到本地服务/.test(e.textContent)) && !!(await page.$('#cgo')));
  await page.screenshot({ path: resolve(root, 'docs/screenshots/editor/04-connect-modal.png') });
  // not-found path: point at a dead port, reopen
  await page.evaluate(() => { window.__SM_BRIDGE_URL__ = 'http://localhost:9/'; document.querySelector('#cclose').click(); });
  await page.click('#connectBtn'); await page.waitForTimeout(400);
  ck('no bridge → shows the simple step-by-step guide', await page.$eval('#cstate', (e) => /打开.*Claude Code|正在检测/.test(e.textContent)) && !(await page.$('#cgo')));
} finally { await browser.close(); await bridge.close(); }

console.log(out.join('\n'));
console.log(out.every((l) => l.startsWith('✓')) ? '\n✓ PASS' : '\n✗ FAIL');
process.exit(out.every((l) => l.startsWith('✓')) ? 0 : 1);
