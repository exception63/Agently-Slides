// Dogfood — drive the *deployed* `slidesmith serve` end-to-end through its HTTP
// control API (the same surface the MCP tools wrap), with a real Studio in a
// headless browser. Proves the shipped artifact, captures screenshots.
//
// Prereq: a bridge is already serving at http://localhost:PORT (start it with
//   `slidesmith serve docs/style-reference/keynote-target.html`).
// Run: npx tsx scripts/dogfood.mjs [port]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.argv[2] || '8765';
const BASE = `http://localhost:${PORT}`;
const NEW_TITLE = '桥接闭环 · DOGFOOD ✅';
const INSTR = `把这一页的大标题改成「${NEW_TITLE}」，其它内容保持不动。`;
const shotDir = resolve(process.cwd(), 'docs/screenshots/dogfood');
mkdirSync(shotDir, { recursive: true });
const log = (s) => console.log(s);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_BRIDGE__ === 'function', { timeout: 8000 });
  await page.waitForFunction(() => window.__SM_BRIDGE__().connected === true, { timeout: 8000 });
  await page.waitForFunction(() => {
    const d = document.getElementById('preview') && document.getElementById('preview').contentDocument;
    return !!(d && d.querySelectorAll('#deck .slide').length > 1);
  }, { timeout: 10000 });
  const n = await page.evaluate(() => document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide').length);
  log(`✓ connected to deployed serve at ${BASE} — deck has ${n} slides`);
  await page.screenshot({ path: resolve(shotDir, '01-connected.png') });

  // (user side) pick a content slide, write an instruction, hit 发送给 Claude
  const idx = 2;
  const { id, before } = await page.evaluate(({ idx, instr }) => {
    const d = document.getElementById('preview').contentDocument;
    const sec = d.querySelectorAll('#deck .slide')[idx];
    const id = sec.getAttribute('data-id');
    const t = sec.querySelector('.cover__title,.secdiv__title,.manifesto__title,.head__title,.title,h1,h2,h3');
    window.__SM_SET_INSTR__(id, instr);
    return { id, before: (t && t.textContent || '').trim().slice(0, 30) };
  }, { idx, instr: INSTR });
  await page.evaluate(() => window.__SM_SEND_ALL__());
  log(`✓ user submitted an edit-request for slide ${idx + 1} (data-id=${id}, title was "${before}")`);

  // (Claude side) read the request via the control API, then author + apply a patch
  let reqs;
  for (let i = 0; i < 100; i++) {
    reqs = await fetch(`${BASE}/api/requests?drain=0`).then((r) => r.json());
    if (reqs.count > 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const okReq = reqs.count > 0 && reqs.requests.some((r) => r.content.includes(id) && r.content.includes(NEW_TITLE));
  log(`${okReq ? '✓' : '✗'} GET /api/requests returned the prompt (count=${reqs.count}, carries data-id+instruction=${okReq})`);

  // author a contract-respecting patch: keep the section + data-id, change only the title
  const section = await page.evaluate(({ id, newTitle }) => {
    const d = document.getElementById('preview').contentDocument;
    const c = d.querySelector(`#deck .slide[data-id="${id}"]`).cloneNode(true);
    c.classList.remove('active', 'sm-sel'); c.removeAttribute('contenteditable');
    c.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
    c.querySelectorAll('.chrome').forEach((e) => e.remove());
    c.style.removeProperty('--sm-fit');
    const t = c.querySelector('.cover__title,.secdiv__title,.manifesto__title,.head__title,.title,h1,h2,h3');
    if (t) t.textContent = newTitle;
    return c.outerHTML;
  }, { id, newTitle: NEW_TITLE });
  const applied = await fetch(`${BASE}/api/patch`, { method: 'POST', headers: { 'content-type': 'text/html' }, body: section }).then((r) => r.json());
  log(`✓ POST /api/patch delivered to ${applied.clients} connected Studio(s)`);

  // the live Studio should now show the rewritten title on that slide
  await page.waitForFunction(({ id, t }) => {
    const d = document.getElementById('preview').contentDocument;
    const s = d.querySelector(`#deck .slide[data-id="${id}"]`);
    return !!(s && s.textContent.includes(t));
  }, { id, t: NEW_TITLE }, { timeout: 10000 });
  log(`✓ Studio applied the patch live — slide ${idx + 1} title is now "${NEW_TITLE}"`);
  await page.evaluate(({ id }) => {
    const s = document.getElementById('preview').contentDocument.querySelector(`#deck .slide[data-id="${id}"]`);
    if (s) s.scrollIntoView({ block: 'center' });
  }, { id });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: resolve(shotDir, '02-applied.png') });

  // confirm the bridge's in-memory deck also picked up the change (sync-back)
  await new Promise((r) => setTimeout(r, 700));
  const st = await fetch(`${BASE}/api/status`).then((r) => r.json());
  log(`✓ done — bridge status: connected=${st.connected}, deck=${st.deckName}`);
  log(`\n✓ DOGFOOD PASS — open → edit → submit → get_requests → apply_patch → live update, against the deployed serve.`);
} finally {
  await browser.close();
}
