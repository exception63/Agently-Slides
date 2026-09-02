// 批次三（界面）的回归：AI 面板渐进披露 · 设计 tab 皮肤只读+去换装 · 格式 tab 无孤儿插入 ·
// 画布藏掉 deck 自带顶栏按钮 + Studio 顶栏有放映/演讲者 · ⌘K 命令面板 · AI 回写带 summary ·
// 现场互动就在 Studio 里（插入 → 装进 deck → 状态卡 → 关提问 → 拆掉）。
// 现场互动的管理台用本地假服务顶替（SMLIVE_CONFIG 指到临时配置），不碰线上。
// Run: node scripts/verify-studio-premium.mjs
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
if (!process.env.SM_TSX) {
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SM_TSX: '1' } });
  process.exit(r.status ?? 1);
}
// ── 假管理台 ──
const fake = { rooms: [], controls: [] };
const relay = createServer((req, res) => {
  let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    const out = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer faketoken') { res.writeHead(401); res.end('{"ok":false}'); return; }
    if (req.url === '/api/agent/overview') return out({ ok: true, rooms: fake.rooms.map((r) => ({ ...r, online: { deck: 1, ask: 7 }, wallNow: 3, sessions: 1, items: 3, closed: fake.controls.some((c) => c.room === r.id && c.action === 'close') && !fake.controls.some((c, i) => c.room === r.id && c.action === 'open' && i > fake.controls.findIndex((x) => x.action === 'close')) })) });
    if (req.url === '/api/agent/room') { fake.rooms.push({ id: j.id, name: j.name }); return out({ ok: true, id: j.id }); }
    if (req.url === '/api/agent/control') { fake.controls.push(j); return out({ ok: true }); }
    out({ ok: false, error: 'unknown' });
  });
});
await new Promise((r) => relay.listen(0, '127.0.0.1', r));
const tmp = mkdtempSync(join(tmpdir(), 'smprem-'));
writeFileSync(join(tmp, 'live.json'), JSON.stringify({ base: `http://127.0.0.1:${relay.address().port}`, token: 'faketoken' }));
process.env.SMLIVE_CONFIG = join(tmp, 'live.json');
const { startBridge } = await import('../packages/bridge/src/index.ts');

const ck = []; const ok = (n, v, x = '') => { ck.push(v); console.log(`${v ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
const root = process.cwd();
const keynote = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
const bridge = await startBridge({ port: 0 });
bridge.openHtml('premium-deck.html', keynote);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(bridge.url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_ALL_REQUEST__ === 'function' && window.__SM_BRIDGE__().connected === true, { timeout: 8000 });
  await page.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return d && d.querySelectorAll('#deck .slide').length > 6; }, { timeout: 10000 });
  const nSlides = await page.evaluate(() => document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide').length);

  // ── 1. AI 面板渐进披露 ──
  await page.click('.htab[data-htab="ai"]');
  const fold = await page.evaluate(() => ({
    details: [...document.querySelectorAll('.hpane[data-hpane="ai"] details.aimore')].map((d) => [d.id, d.open]),
    // 闭合的 <details> 用 content-visibility 藏内容，offsetHeight 仍有数；要用 checkVisibility()
    pageBoxVisible: document.getElementById('aiInstruction').checkVisibility(),
    deckBoxVisible: document.getElementById('aiDeckInstruction').checkVisibility(),
    help: document.querySelectorAll('.hpane[data-hpane="ai"] .ihelp').length,
    dbg: { ai: [getComputedStyle(document.getElementById('aiInstruction')).display, document.getElementById('aiInstruction').offsetHeight], deck: [getComputedStyle(document.getElementById('aiDeckInstruction')).display, document.getElementById('aiDeckInstruction').offsetHeight], pane: getComputedStyle(document.querySelector('.hpane[data-hpane="ai"]')).display },
  }));
  ok('四个不常用区默认折叠，本页输入框直接可见', fold.details.length === 4 && fold.details.every(([, o]) => !o) && fold.pageBoxVisible && !fold.deckBoxVisible, JSON.stringify(fold.details) + ' ' + JSON.stringify(fold.dbg));
  ok('AI 面板只剩 1 颗问号', fold.help === 1, String(fold.help));
  // 折叠着的时候往里写字（比如从 ⌘K 或脚本填进去）→ 那一区要自己展开
  await page.evaluate(() => { const d = document.getElementById('aimoreDeck'); d.open = false; const t = document.getElementById('aiDeckInstruction'); t.value = '统一标题字号'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  const autoOpen = await page.evaluate(() => document.getElementById('aimoreDeck').open);
  ok('整份 deck 写了字 → 那个折叠区自动展开', autoOpen);

  // ── 2. 设计 tab：皮肤只读 + 去换装 ──
  await page.click('.htab[data-htab="design"]');
  const d1 = await page.evaluate(() => ({ now: document.getElementById('hSkinNow').textContent, selHidden: document.getElementById('hSkin').hidden, go: !!document.getElementById('hSkinGo') }));
  ok('设计 tab 显示当前皮肤（只读）、旧下拉藏起、有「去换装」', /保持原样/.test(d1.now) && d1.selHidden && d1.go, d1.now);
  await page.click('#hSkinGo');
  ok('「去换装」跳到左栏换装', await page.evaluate(() => document.querySelector('.ltab[data-ltab="skins"]').classList.contains('active') && !document.querySelector('.lpane[data-lpane="skins"]').hidden));
  await page.click('.skincard[data-skin="academic"]');
  await page.waitForTimeout(400);
  ok('换了皮之后设计 tab 的「当前皮肤」跟着变', /学术|academic/i.test(await page.evaluate(() => document.getElementById('hSkinNow').textContent)));

  // ── 3. 格式 tab 没有孤儿「插入」；插入面板的卡仍能触发插图 ──
  const fmt = await page.evaluate(() => ({ orphan: [...document.querySelectorAll('.hpane[data-hpane="fmt"] .sechead')].some((h) => /^插入/.test(h.textContent.trim())), btnInRow: !!document.querySelector('#hSel .oprow #hInsertImg') }));
  ok('格式 tab 没有独立的「插入」小节，插入图片并进了选中元素那一排', !fmt.orphan && fmt.btnInRow);

  // ── 4. 画布：deck 自带顶栏的按钮藏掉；Studio 顶栏有放映 / 演讲者 ──
  const chrome = await page.evaluate(() => { const d = document.getElementById('preview').contentDocument; const g = (id) => { const el = d.getElementById(id); return el ? getComputedStyle(el).display : 'absent'; }; return { play: g('playBtn'), presenter: g('presenterBtn'), brand: d.querySelector('.topbar__brand') ? getComputedStyle(d.querySelector('.topbar__brand')).display : 'absent', tb: !!document.getElementById('tbPlay') && !!document.getElementById('tbPresenter') }; });
  ok('编辑态 deck 自带的「全屏播放 / 演讲者」藏起，品牌文字留着', chrome.play === 'none' && chrome.presenter === 'none' && chrome.brand !== 'none' && chrome.brand !== 'absent', JSON.stringify(chrome));
  ok('Studio 顶栏有「放映」「演讲者」', chrome.tb);
  await page.click('#tbPlay'); await page.waitForTimeout(300);
  const present = await page.evaluate(() => document.getElementById('preview').contentDocument.body.classList.contains('present'));
  ok('点「放映」→ deck 进入放映排版（headless 进不了全屏也要能放）', present);
  // headless 里 iframe 真的进了全屏（top layer），Studio 其它元素都点不到、焦点也给不出去——
  // 这是全屏的本义，不是 bug。退出全屏后 Studio 的 fullscreenchange 要把放映态收掉。
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);
  ok('退出全屏后 deck 自动退出放映排版', !(await page.evaluate(() => document.getElementById('preview').contentDocument.body.classList.contains('present'))));

  // ── 5. ⌘K ──
  // 焦点这时在预览 iframe 里（放映把焦点给了 deck）——⌘K 也得能从那里呼出来
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.getElementById('cmdk').style.display !== 'none', { timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => document.activeElement === document.getElementById('cmdkQ'), { timeout: 3000 }).catch(() => {});
  ok('Ctrl/⌘K 打开命令面板（焦点在预览里也行）', await page.evaluate(() => document.getElementById('cmdk').style.display !== 'none' && document.activeElement === document.getElementById('cmdkQ')));
  await page.keyboard.type('第 3 页');
  await page.waitForTimeout(100);
  const first = await page.evaluate(() => document.querySelector('#cmdkList .cmdk-item.on .cmdk-l')?.textContent || '');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok('输「第 3 页」回车 → 跳到第 3 页', /^第 3 页/.test(first) && await page.evaluate(() => document.querySelectorAll('.srow')[2].classList.contains('active') || document.querySelector('.srow.active')?.textContent.trim().startsWith('3')), first);
  await page.keyboard.press('Control+k'); await page.keyboard.type('nord'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok('输「nord」回车 → 换皮 nord', await page.evaluate(() => /nord/i.test(document.getElementById('hSkinNow').textContent)));
  await page.keyboard.press('Control+k'); await page.keyboard.type('zzzz不存在的'); await page.waitForTimeout(100);
  ok('没匹配时给空态', await page.evaluate(() => !!document.querySelector('#cmdkList .cmdk-empty')));
  await page.keyboard.press('Escape');
  ok('Esc 关闭', await page.evaluate(() => document.getElementById('cmdk').style.display === 'none'));

  // ── 6. AI 回写带 summary ──
  const sid = await page.evaluate(() => document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide')[1].getAttribute('data-id'));
  const r = await fetch(`${bridge.url}api/patch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections: `<section class="slide" data-id="${sid}" data-title="改过的页"><h2 class="title">改过了</h2></section>`, summary: '标题改成三个字，去掉铺垫' }) }).then((x) => x.json());
  await page.waitForTimeout(600);
  const log = await page.evaluate(() => { const b = document.getElementById('aiChangeLog'); return { hidden: b.hidden, text: b.textContent }; });
  ok('回写后「AI 改了什么」显示页名 + 一句话', r.ok && !log.hidden && /第 2 页/.test(log.text) && /标题改成三个字/.test(log.text), log.text.slice(0, 80));

  // ── 7. 现场互动就在 Studio 里 ──
  await page.click('.ltab[data-ltab="insert"]');
  await page.click('.inscard[data-act="live"]');
  const form = await page.evaluate(() => ({ shown: !document.getElementById('liveCard').hidden, room: document.getElementById('liveRoom')?.value, go: !!document.getElementById('liveGo') && !document.getElementById('liveGo').disabled }));
  ok('插入 → 现场互动：出表单，房间号有默认值，能装', form.shown && /^[A-Za-z0-9_-]{4,}$/.test(form.room || '') && form.go, form.room);
  await page.fill('#liveRoom', 'premroom2026'); await page.fill('#liveName', '回归用课程');
  await page.click('#liveGo');
  await page.waitForFunction(() => document.getElementById('liveStat') !== null, { timeout: 20000 });
  await page.waitForFunction(() => !/读取中/.test(document.getElementById('liveStat').textContent), { timeout: 10000 });
  const after = await page.evaluate(() => ({ n: document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide').length, qa: !!document.getElementById('preview').contentDocument.querySelector('#deck .qa-slide'), stat: document.getElementById('liveStat').textContent, urls: [...document.querySelectorAll('#liveCard .liveurls a')].map((a) => a.href) }));
  ok('装进 deck：多了一页扫码提问页', after.n === nSlides + 1 && after.qa, `${nSlides} → ${after.n}`);
  ok('管理台里房间建好并起了名', fake.rooms.some((x) => x.id === 'premroom2026' && x.name === '回归用课程'));
  ok('状态卡读到在线 7 台 · 大屏 3 条', /7/.test(after.stat) && /3/.test(after.stat), after.stat.replace(/\s+/g, ' ').slice(0, 80));
  ok('三个网址都指向房间', after.urls.length === 3 && after.urls.filter((u) => u.includes('premroom2026')).length === 2, after.urls.join(' '));
  await page.click('#liveClose2'); await page.waitForTimeout(600);
  ok('点「关闭提问」→ 管理台收到 close', fake.controls.some((c) => c.room === 'premroom2026' && c.action === 'close'));
  await page.waitForFunction(() => /已关闭/.test(document.getElementById('liveStat').textContent), { timeout: 8000 }).catch(() => {});
  ok('状态卡显示提问已关闭、按钮换成「开放提问」', await page.evaluate(() => /已关闭/.test(document.getElementById('liveStat').textContent) && document.getElementById('liveClose2').hidden && !document.getElementById('liveOpen2').hidden));
  ok('⌘K 里出现互动动作', await page.evaluate(() => { const w = window; return true; }) && (await (async () => { await page.keyboard.press('Control+k'); await page.keyboard.type('清空大屏'); await page.waitForTimeout(100); const t = await page.evaluate(() => document.querySelector('#cmdkList .cmdk-item.on .cmdk-l')?.textContent || ''); await page.keyboard.press('Escape'); return /清空大屏/.test(t); })()));
  page.on('dialog', (d) => d.accept());
  await page.click('#liveRemoveBtn');
  await page.waitForFunction((n) => document.getElementById('preview').contentDocument.querySelectorAll('#deck .slide').length === n, nSlides, { timeout: 20000 });
  ok('「拆掉互动页」→ 页数回到原样、卡片回到表单', await page.evaluate(() => !!document.getElementById('liveGo')));
  ok('全程无页面错误', errs.length === 0, errs.join(' | ').slice(0, 200));
} finally {
  await browser.close(); await bridge.close(); relay.close(); rmSync(tmp, { recursive: true, force: true });
}
const pass = ck.filter(Boolean).length;
console.log(`\n${pass}/${ck.length} 通过`);
process.exit(pass === ck.length ? 0 : 1);
