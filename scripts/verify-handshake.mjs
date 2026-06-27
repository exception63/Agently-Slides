// Handshake auto-loop verification — the upgrade from "manual pull" to a
// handshake-based auto-collaboration loop (option B), headless end-to-end.
//
//   (1) start the bridge, open the Studio over http (auto-connects WS)
//   (2) HANDSHAKE: bridge.handshake('keynote') → Studio top bar shows
//       「会话 keynote · 端口 N」 (session ownership — no more ambiguity)
//   (3) LONG-POLL: a waitForRequests() blocks (doesn't return early); the user
//       submits from Studio → it resolves *instantly* with the request. This is
//       what wakes the session — zero manual pull.
//   (4) HTTP /api/wait: same, over the wire (the curl a background loop runs)
//   (5) AUTO mode (改前先问我 off): apply_patch lands live, no proposal bar
//   (6) CONFIRM mode (改前先问我 on): request carries confirm=true; a preview
//       patch shows the 保留/还原 proposal bar; 还原 rolls it back
//   (7) TIMEOUT: waitForRequests returns empty after its timeout (idle heartbeat)
//
// Run: npx tsx scripts/verify-handshake.mjs   (or plain node — self re-execs)
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.SM_TSX) {
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SM_TSX: '1' } });
  process.exit(r.status ?? 1);
}
const { startBridge } = await import('../packages/bridge/src/index.ts');

const root = process.cwd();
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
const shotDir = resolve(root, 'docs/screenshots/handshake');
mkdirSync(shotDir, { recursive: true });

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bridge = await startBridge({ port: 0 });
console.log(`bridge at ${bridge.url}`);
bridge.openHtml('keynote-target.html', keynote);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(bridge.url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_BRIDGE__ === 'function', { timeout: 8000 });
  await page.waitForFunction(() => window.__SM_BRIDGE__().connected === true, { timeout: 8000 });
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelectorAll('#deck .slide').length > 1);
  }, { timeout: 10000 });
  check('Studio connected + deck imported', true);

  // ---- (2) HANDSHAKE ----
  // before handshake, Studio is connected but has no owner
  const ownerBefore = await page.evaluate(() => window.__SM_BRIDGE__().owner);
  check('no owner before handshake', ownerBefore === null, JSON.stringify(ownerBefore));
  const o = bridge.handshake('keynote');
  check('bridge.handshake returns owner label', o.label === 'keynote', o.label);
  check('status() carries owner', bridge.status().owner && bridge.status().owner.label === 'keynote', JSON.stringify(bridge.status().owner));
  // the hello re-broadcast reaches the Studio → badge updates
  await page.waitForFunction(() => { const b = window.__SM_BRIDGE__(); return b.owner && b.owner.label === 'keynote' && b.port > 0; }, { timeout: 5000 });
  const badge = await page.evaluate(() => (document.getElementById('bridgeBadge') || {}).textContent || '');
  check('Studio badge shows 会话 + 端口', badge.includes('会话 keynote') && badge.includes('端口'), JSON.stringify(badge));
  await page.screenshot({ path: resolve(shotDir, '01-handshake-badge.png') });

  // ---- (3) LONG-POLL via programmatic waitForRequests (the auto-wake) ----
  let resolved = false;
  const waitP = bridge.waitForRequests(6000).then((r) => { resolved = true; return r; });
  await sleep(400);
  check('waitForRequests blocks while idle (no early return)', resolved === false, `resolved=${resolved}`);
  // user submits from Studio
  const targetId = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const sec = d.querySelectorAll('#deck .slide')[3];
    const id = sec.getAttribute('data-id');
    window.__SM_SET_INSTR__(id, '把这一页的大标题改成「握手自动环 ✅」。');
    window.__SM_SET_CONFIRM__(false); // auto mode for this round
    window.__SM_SEND_ALL__();
    return id;
  });
  const t0 = Date.now();
  const got = await waitP;
  const dt = Date.now() - t0;
  check('long-poll resolved instantly on submit (auto-wake)', got.length === 1 && dt < 2500, `${got.length} req in ${dt}ms`);
  check('request carries the target data-id + instruction', got[0].content.includes(targetId) && got[0].content.includes('握手自动环'), `id=${targetId}`);
  check('auto-mode request has confirm=false', got[0].confirm === false, `confirm=${got[0].confirm}`);

  // ---- (5) AUTO mode: apply_patch lands live, no proposal bar ----
  const autoPatch = '```html\n' + `<section class="slide cover" data-id="${targetId}"><h1 class="cover__title" style="font-size:120px">握手自动环 ✅</h1></section>\n` + '```';
  const ar = bridge.applyPatch(autoPatch);
  check('apply_patch delivered to Studio', ar.clients === 1, `clients=${ar.clients}`);
  await page.waitForFunction(({ id }) => {
    const d = document.getElementById('preview').contentDocument;
    const sec = d && d.querySelector(`#deck .slide[data-id="${id}"]`);
    return !!(sec && sec.textContent.includes('握手自动环'));
  }, { id: targetId }, { timeout: 8000 });
  const propAfterAuto = await page.evaluate(() => window.__SM_PROPOSAL__());
  check('auto mode: change is live, no proposal bar', propAfterAuto.visible === false && propAfterAuto.count === 0, JSON.stringify(propAfterAuto));

  // ---- (4) HTTP /api/wait long-poll (the curl a background loop runs) ----
  const waitHttp = fetch(bridge.url + 'api/wait?timeout=8000').then((r) => r.json());
  await sleep(300);
  const target2 = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const sec = d.querySelectorAll('#deck .slide')[5];
    const id = sec.getAttribute('data-id');
    window.__SM_SET_INSTR__(id, '把这一页改成只有一行字：HTTP 长轮询命中。');
    window.__SM_SET_CONFIRM__(true); // confirm mode for this round
    window.__SM_SEND_ALL__();
    return id;
  });
  const httpRes = await waitHttp;
  check('GET /api/wait returned the submitted request', httpRes.ok && httpRes.count === 1 && !httpRes.timedOut, JSON.stringify({ count: httpRes.count, timedOut: httpRes.timedOut }));
  check('confirm-mode request has confirm=true over HTTP', !!(httpRes.requests && httpRes.requests[0] && httpRes.requests[0].confirm), JSON.stringify(httpRes.requests && httpRes.requests[0] && httpRes.requests[0].confirm));

  // ---- (6) CONFIRM mode: preview patch → proposal bar → 还原 ----
  const beforeText = await page.evaluate(({ id }) => {
    const sec = document.getElementById('preview').contentDocument.querySelector(`#deck .slide[data-id="${id}"]`);
    return sec ? sec.textContent : '';
  }, { id: target2 });
  const prevPatch = '```html\n' + `<section class="slide" data-id="${target2}"><h2 class="head__title">HTTP 长轮询命中</h2></section>\n` + '```';
  const pr = bridge.applyPatch(prevPatch, { preview: true });
  check('preview apply_patch delivered', pr.clients === 1, `clients=${pr.clients}`);
  await page.waitForFunction(() => { const p = window.__SM_PROPOSAL__(); return p.visible && p.count === 1; }, { timeout: 8000 });
  check('confirm mode: proposal bar visible (保留/还原)', true);
  // switch the right panel to the AI tab so the proposal bar is actually on screen
  await page.evaluate(() => { const t = document.querySelector('.htab[data-htab="ai"]'); if (t) t.click(); });
  await sleep(250);
  await page.screenshot({ path: resolve(shotDir, '02-proposal-bar.png') });
  // 还原 rolls it back to pre-AI
  await page.evaluate(() => document.getElementById('aiRevertAll').click());
  await page.waitForFunction(() => window.__SM_PROPOSAL__().visible === false, { timeout: 5000 });
  const afterRevert = await page.evaluate(({ id }) => {
    const sec = document.getElementById('preview').contentDocument.querySelector(`#deck .slide[data-id="${id}"]`);
    return sec ? sec.textContent : '';
  }, { id: target2 });
  check('还原 rolled the proposal back', !afterRevert.includes('HTTP 长轮询命中'), JSON.stringify(afterRevert.slice(0, 40)));

  // ---- (7) TIMEOUT heartbeat ----
  const tStart = Date.now();
  const idle = await bridge.waitForRequests(1200);
  const idleDt = Date.now() - tStart;
  check('waitForRequests times out empty when idle', idle.length === 0 && idleDt >= 1100 && idleDt < 3000, `${idle.length} req in ${idleDt}ms`);

  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  await bridge.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? '✗ FAIL' : '✓ PASS'} — ${checks.length - failed.length}/${checks.length} checks`);
process.exit(failed.length ? 1 : 0);
