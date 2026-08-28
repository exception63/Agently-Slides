// Studio「嵌入手机遥控」的两个新控件：中转二选一 + 遥控密码。
// 红线：默认必须仍是 Cloudflare（这条一直用得好，不能被悄悄改掉）。
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash as sha } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.SM_TSX) {
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SM_TSX: '1' } });
  process.exit(r.status ?? 1);
}
const { startBridge } = await import('../packages/bridge/src/index.ts');
const deck = readFileSync(resolve(process.cwd(), 'docs/style-reference/keynote-target.html'), 'utf8');
const ck = []; const ok = (n, v, x = '') => { ck.push(v); console.log(`${v ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
const b = await startBridge({ port: 0 }); b.openHtml('__verify-relay__.html', deck);
const br = await chromium.launch({ headless: true });
try {
  const p = await br.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto(b.url, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.__SM_EXPORT_HTML__ === 'function', { timeout: 8000 });
  await p.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return d && d.querySelectorAll('#deck .slide').length > 6; }, { timeout: 10000 });

  // 这组控件在「导出」下拉里，得先把菜单打开（不打开元素不可见，点不动）
  await p.evaluate(() => document.querySelector('.expmenu')?.classList.add('show'));
  const hidden = await p.evaluate(() => getComputedStyle(document.getElementById('relayWrap')).display === 'none');
  ok('没勾「嵌入手机遥控」时，中转/密码那组控件不出现', hidden);

  await p.click('#embedRemote');
  const shown = await p.evaluate(() => ({
    on: getComputedStyle(document.getElementById('relayWrap')).display !== 'none',
    opts: [...document.querySelectorAll('#relaySel option')].map(o => o.value + ':' + o.textContent),
    val: document.getElementById('relaySel').value,
    hint: document.getElementById('relayHint').textContent,
  }));
  ok('勾上后出现中转下拉，两个选项', shown.on && shown.opts.length === 2, shown.opts.join(' / '));
  ok('★ 默认仍是 Cloudflare（没有被悄悄改掉）', shown.val === 'cf' && /Cloudflare/.test(shown.opts[0]));
  ok('选项带一句说明（帮人选对）', shown.hint.length > 10, shown.hint.slice(0, 30) + '…');

  // 默认导出：Cloudflare，无密码
  let html = await p.evaluate(() => window.__SM_EXPORT_HTML__());
  ok('默认导出烘的是 Cloudflare 地址', /__SM_CLOUD_RELAY__="https:\/\/slidesmith-remote\.zly-scu\.workers\.dev"/.test(html));
  // 只认真正的赋值：`__SM_PASS__` 这个词在 pair-client 的注释里也出现，光搜词会误判
const PASSSET = /window\.__SM_PASS__\s*=\s*"[0-9a-f]{64}"/;
ok('没填密码 → 不烘密码（行为与以前一致）', !PASSSET.test(html));

  // 切到新加坡 + 设密码 1989
  await p.selectOption('#relaySel', 'sg');
  await p.fill('#remotePass', '1989');
  await p.waitForTimeout(300);
  html = await p.evaluate(() => window.__SM_EXPORT_HTML__());
  ok('切到新加坡后烘的是 live.zhouliying.com', /__SM_CLOUD_RELAY__="https:\/\/live\.zhouliying\.com"/.test(html));
  const want = sha('sha256').update('slidesmith-remote:1989').digest('hex');
  ok('★ 烘进去的是密码哈希、不是明文', PASSSET.test(html) && html.includes(want), want.slice(0, 16) + '…');
  ok('二维码里的地址跟着中转走', /live\.zhouliying\.com/.test(html));

  // 切回去要能切回去
  await p.selectOption('#relaySel', 'cf');
  await p.fill('#remotePass', '');
  await p.waitForTimeout(300);
  html = await p.evaluate(() => window.__SM_EXPORT_HTML__());
  ok('切回 Cloudflare、清空密码后恢复原状', /workers\.dev/.test(html) && !PASSSET.test(html));

  ok('无页面错误', errs.length === 0, errs[0] || '');
} finally { await br.close(); b.close && b.close(); }
const pass = ck.filter(Boolean).length;
console.log(`\n${pass}/${ck.length} 通过`);
process.exit(pass === ck.length ? 0 : 1);
