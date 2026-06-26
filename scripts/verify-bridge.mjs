// Bridge verification — the full closed loop, headless.
//
//   (1) start the bridge (HTTP+WS) and load keynote-target.html into it
//       (this is what MCP `slidesmith_open` does)
//   (2) open the Studio over http in a headless browser → it auto-connects the
//       WebSocket and receives the deck (assert: 已连接 badge + 36 slides)
//   (3) user writes an edit-request on a slide and hits "发送给 Claude"
//       → assert the bridge received it (this is `slidesmith_get_requests`)
//   (4) the "AI" returns a patched <section data-id> → bridge.applyPatch
//       (this is `slidesmith_apply_patch`) → assert the Studio shows the change
//       and that an export still contains it (persistence)
//   (5) bonus: spawn the real MCP server over stdio and assert tools/list
//
// Run: npx tsx scripts/verify-bridge.mjs
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// imports TS bridge sources → needs tsx. If launched with plain `node`, transparently
// re-exec under tsx so CI can just do `node scripts/verify-bridge.mjs`.
if (!process.env.SM_TSX) {
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SM_TSX: '1' } });
  process.exit(r.status ?? 1);
}
const { startBridge } = await import('../packages/bridge/src/index.ts');

const root = process.cwd();
const SENTINEL = 'BRIDGE-PATCH-OK-7Q';
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
const shotDir = resolve(root, 'docs/screenshots/bridge');
mkdirSync(shotDir, { recursive: true });

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

const bridge = await startBridge({ port: 0 });
console.log(`bridge at ${bridge.url}`);
// (1) MCP `slidesmith_open` equivalent: load the deck into the bridge up front.
bridge.openHtml('keynote-target.html', keynote);

const browser = await chromium.launch({ headless: true });
let requestSeen = null;
bridge.on('request', (r) => { requestSeen = r; });

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  // (2) open the Studio over HTTP — it should auto-connect + receive the deck
  await page.goto(bridge.url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_BRIDGE__ === 'function', { timeout: 8000 });
  await page.waitForFunction(() => window.__SM_BRIDGE__().connected === true, { timeout: 8000 });
  check('Studio connected to bridge over WebSocket', true);
  check('bridge sees the Studio connection', bridge.status().connected === 1, `connected=${bridge.status().connected}`);

  // the deck was pushed on connect → wait for the rendered slides in the preview iframe
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelectorAll('#deck .slide').length > 1);
  }, { timeout: 10000 });
  const slideCount = await page.evaluate(() =>
    document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide').length);
  check('deck auto-imported via bridge (push-on-connect)', slideCount >= 30, `${slideCount} slides`);
  const badge = await page.evaluate(() => (document.getElementById('bridgeBadge') || {}).textContent || '');
  check('header shows 已连接 badge', badge.includes('已连接'), JSON.stringify(badge));

  await page.screenshot({ path: resolve(shotDir, '01-connected-imported.png') });

  // (3) user submits an edit-request for slide index 4
  const targetId = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const sec = d.querySelectorAll('#deck .slide')[4];
    const id = sec.getAttribute('data-id');
    window.__SM_SET_INSTR__(id, '把这一页改成只有一个大标题：演示桥接闭环。');
    return id;
  });
  await page.evaluate(() => window.__SM_SEND_ALL__());
  // wait for the bridge to receive it
  for (let i = 0; i < 100 && !requestSeen; i++) await new Promise((r) => setTimeout(r, 50));
  check('bridge received the user edit-request', !!requestSeen, requestSeen ? requestSeen.name : 'none');

  // (3b) drain via the same API MCP uses — assert content carries the instruction + data-id
  const drained = bridge.getRequests(true);
  const reqText = drained.map((r) => r.content).join('\n');
  check('get_requests returns the prompt with target data-id', reqText.includes(targetId), `id=${targetId}`);
  check('get_requests carries the user instruction', reqText.includes('演示桥接闭环'), '');
  check('queue drains after read', bridge.status().pendingRequests === 0, `pending=${bridge.status().pendingRequests}`);

  // (4) the "AI" answers with a patched section (same data-id) → push down the bridge
  const patch = '```html\n' +
    `<section class="slide cover" data-id="${targetId}">` +
    `<h1 class="cover__title" style="font-size:120px">${SENTINEL}</h1>` +
    '</section>\n```';
  const applied = bridge.applyPatch(patch);
  check('apply_patch delivered to a connected Studio', applied.clients === 1, `clients=${applied.clients}`);

  // the Studio re-renders → the patched slide should now show the sentinel
  await page.waitForFunction(({ id, s }) => {
    const d = document.getElementById('preview').contentDocument;
    const sec = d && d.querySelector(`#deck .slide[data-id="${id}"]`);
    return !!(sec && sec.textContent.includes(s));
  }, { id: targetId, s: SENTINEL }, { timeout: 10000 });
  check('Studio applied the AI patch on the right slide', true);

  // persistence: an export still contains the patched content
  const exported = await page.evaluate(() => window.__SM_EXPORT_HTML__());
  check('export retains the patched slide', exported.includes(SENTINEL), '');
  check('export still has the other slides', (exported.match(/class="slide/g) || []).length >= 30,
    `${(exported.match(/class="slide/g) || []).length} slides`);

  await page.evaluate(({ id }) => {
    const d = document.getElementById('preview').contentDocument;
    const sec = d.querySelector(`#deck .slide[data-id="${id}"]`);
    if (sec) sec.scrollIntoView({ block: 'center' });
  }, { id: targetId });
  await page.screenshot({ path: resolve(shotDir, '02-patch-applied.png') });

  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  await bridge.close();
}

// (5) MCP stdio smoke — spawn the real server and list tools
console.log('\n--- MCP stdio smoke ---');
await mcpSmoke();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? '✗ FAIL' : '✓ PASS'} — ${checks.length - failed.length}/${checks.length} checks`);
process.exit(failed.length ? 1 : 0);

function mcpSmoke() {
  return new Promise((done) => {
    const child = spawn('npx', ['tsx', 'packages/cli/src/index.ts', 'mcp', '--port', '8799'], { cwd: root });
    let buf = '';
    let toolsOk = false;
    const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
    const timer = setTimeout(() => { check('MCP server lists the 4 tools', toolsOk); try { child.kill(); } catch {} done(); }, 15000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) { // initialize result → send initialized + tools/list
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        } else if (msg.id === 2 && msg.result && Array.isArray(msg.result.tools)) {
          const names = msg.result.tools.map((t) => t.name);
          toolsOk = ['slidesmith_open', 'slidesmith_get_requests', 'slidesmith_apply_patch', 'slidesmith_status']
            .every((n) => names.includes(n));
          check('MCP server lists the 4 tools', toolsOk, names.join(', '));
          clearTimeout(timer); try { child.kill(); } catch {} done();
        }
      }
    });
    child.on('error', () => { check('MCP server lists the 4 tools', false, 'spawn error'); clearTimeout(timer); done(); });
    // kick off the handshake
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } } });
  });
}
