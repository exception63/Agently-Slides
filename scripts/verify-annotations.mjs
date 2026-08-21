// 批注 → 一次性交给 AI 的验证。覆盖两件事：
//
//   1a「找不到发送键」——用户写完批注后卡住了：发送键只在右栏 AI tab 里，讲稿弹窗里一颗都没有。
//      修法是 ① AI tab 上挂待办数角标（人在别的 tab 也知道有东西挂着）
//            ② 讲稿弹窗底部补一条底栏：说清这一按发的是**整个待办**，外加一颗发送键。
//   1b「slides 上的元素批注」——预览里点中元素 → gizmo 上第三颗把手 💬 → 写一条批注，
//      和改字 / 配图 / 导入图 / 讲稿批注凑成同一个待办，**一次发送**。
//      锚点用「原文开头 40 字」（跟着那句话走），tag + 本页第几个 只作兜底。
//
// 关键边界（都在下面测了）：角标只属于编辑态 —— 放映时整层藏掉、导出的文件里一个字都没有。
//
// 用测试专用 deck 名 __verify-ann__，不碰用户的图片库。
// 跑：npx tsx scripts/verify-annotations.mjs   （或直接 node，脚本自己 re-exec）
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
const shotDir = resolve(root, 'docs/screenshots/annotations');
mkdirSync(shotDir, { recursive: true });

// 讲稿要能被 Studio 读到，靠的是 deck 里 window.__TXB64__ 那一句（一体版才有）。
// 锚点必须和 slideAnchor(i) 对得上，也就是这份 deck 自己的 SLIDE_MAP —— 对不上的话
// 批注会挂到「整份」上（那是兜底路径，不是这里要测的东西）。
const anchors = JSON.parse(readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8').match(/SLIDE_MAP=(\[[^\]]*\])/)[1]);
const transcript = `<html><body>
<h3 id="${anchors[0]}">开场</h3><p>各位好，今天讲的是<strong>无缝嵌入</strong>这件事。</p><p class="cue">停两秒再往下</p>
<h3 id="${anchors[1]}">第二页</h3><p>这里的三个要点分别是甲、乙、丙。</p>
<h3 id="${anchors[2]}">第三页</h3><p>最后落到一句话上。</p>
</body></html>`;
const b64 = Buffer.from(transcript, 'utf8').toString('base64');
let deck = readFileSync(resolve(root, 'docs/style-reference/keynote-target.html'), 'utf8');
deck = deck.replace(/<\/body>/i, `<script>window.__TXB64__ = "${b64}";</script>\n</body>`);

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

const bridge = await startBridge({ port: 0 });
bridge.openHtml('__verify-ann__.html', deck);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(bridge.url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__SM_ANN_ADD__ === 'function', { timeout: 8000 });
  await page.waitForFunction(() => window.__SM_BRIDGE__().connected === true, { timeout: 8000 });
  await page.waitForFunction(() => { const d = document.getElementById('preview')?.contentDocument; return d && d.querySelectorAll('#deck .slide').length > 6; }, { timeout: 10000 });
  await page.click('.htab[data-htab="ai"]');
  const ids = await page.evaluate(() => Array.from(document.querySelector('#preview').contentDocument.querySelectorAll('#deck .slide')).map((s) => s.getAttribute('data-id')));
  const p1 = ids[1], p2 = ids[2];

  // ============ 1a · AI tab 上的待办数角标 ============
  const badge0 = await page.evaluate(() => { const b = document.getElementById('aiTabNum'); return { exists: !!b, hidden: b.hidden, txt: b.textContent }; });
  check('① 待办为空时角标不出现（也不留个 "0" 污染 tab 文本）', badge0.exists && badge0.hidden && badge0.txt === '', JSON.stringify(badge0));

  await page.evaluate((sid) => window.__SM_SET_INSTR__(sid, '标题改大、加副标题'), p1);
  await page.evaluate((sid) => window.__SM_GEN_MARK__(sid, 'vector', '一张上扬的增长曲线'), p2);
  const badge2 = await page.evaluate(() => { const b = document.getElementById('aiTabNum'); return { hidden: b.hidden, txt: b.textContent, title: b.title, todo: window.__SM_TODO__().length }; });
  check('① 角标＝待办条数，tooltip 说明构成', !badge2.hidden && badge2.txt === String(badge2.todo) && /改字 1/.test(badge2.title) && /配图/.test(badge2.title), `${badge2.txt} · ${badge2.title}`);

  // 折起右栏，窄条上也得看得见（不然折叠等于把提示一起收走了）
  await page.click('.htabs .railtog');
  const strip = await page.evaluate(() => { const s = document.querySelector('#railStripTabs .striptab .stripnum'); return { n: s && s.textContent, lbl: document.querySelector('#railStripTabs .striptab')?.getAttribute('aria-label') }; });
  check('① 折叠成窄条后角标还在，且图标 aria-label 没被数字污染', strip.n === badge2.txt && strip.lbl === 'AI', JSON.stringify(strip));
  await page.click('.railstrip .railtog');

  // ============ 1a · 讲稿弹窗底部的发送键 ============
  await page.click('.htab[data-htab="script"]');
  await page.click('#notesOpen');
  await page.waitForFunction(() => document.getElementById('notesModal').style.display === 'flex', { timeout: 5000 });
  const foot1 = await page.evaluate(() => ({ txt: document.getElementById('notesFootTxt').textContent, btn: document.getElementById('notesSendAll').textContent, off: document.getElementById('notesSendAll').disabled }));
  check('② 讲稿弹窗里有发送键（原先一颗都没有），且按钮带条数', !foot1.off && /2 项/.test(foot1.btn), foot1.btn);
  check('② 底栏写清构成：改字 / 配图 各几条', /改字 1/.test(foot1.txt) && /配图/.test(foot1.txt), foot1.txt);

  // 讲稿 iframe 里划一段 → 加批注（走真实的 postMessage 通道）
  await page.waitForFunction((a) => { const f = document.getElementById('notesFrame'); return f && f.contentDocument && f.contentDocument.getElementById(a); }, anchors[1], { timeout: 8000 });
  await page.evaluate((a) => window.postMessage({ type: 'sm-note-pick', anchor: a, quote: '这里的三个要点分别是甲、乙、丙。' }, '*'), anchors[1]);
  await page.waitForFunction(() => document.getElementById('notePickBox').style.display !== 'none', { timeout: 4000 });
  await page.fill('#noteText', '这段太长了，砍一半');
  await page.click('#noteAdd');
  await page.waitForFunction(() => window.__SM_TODO__().some((t) => t.cls === 'note'), { timeout: 4000 });
  const foot2 = await page.evaluate(() => document.getElementById('notesFootTxt').textContent);
  check('② 加完批注，底栏点明「连同其余待办一起」而不是只发这几条', /讲稿批注 1/.test(foot2) && /一起/.test(foot2), foot2);
  const notePg = await page.evaluate(() => window.__SM_TODO__().filter((t) => t.cls === 'note')[0]?.page);
  check('② 讲稿批注认到了它所属的那一页（锚点对上了，不是掉进「整份」兜底）', notePg === 2, `page=${notePg}`);
  await page.screenshot({ path: resolve(shotDir, '01-notes-send.png') });

  await page.click('#notesSendAll');
  const got1 = await bridge.waitForRequests(8000);
  const r1 = got1.length === 1 ? got1[0] : null;
  check('② 一按发的是整个待办：改字 + 配图 + 讲稿批注 同在一个 .ai-tasks.md 里',
    !!r1 && /ai-tasks\.md$/.test(r1.name) && r1.content.includes('标题改大') && r1.content.includes('矢量配图规则') && r1.content.includes('这段太长了，砍一半'), r1?.name);
  const after = await page.evaluate(() => ({ open: document.getElementById('notesModal').style.display, tab: document.querySelector('.htab.active')?.dataset.htab }));
  check('② 发完关掉弹窗并切回 AI tab（让人当场看见送走了什么）', after.open === 'none' && after.tab === 'ai', JSON.stringify(after));

  // ============ 1b · slides 上的元素批注 ============
  // 走真实交互：预览里点中一个元素 → gizmo 冒出来 → 上面第三颗把手 💬
  const sel = await page.evaluate((sid) => {
    const d = document.getElementById('preview').contentDocument;
    const slide = d.querySelector(`#deck .slide[data-id="${sid}"]`);
    const el = Array.from(slide.querySelectorAll('h1,h2,h3,p,li')).filter((e) => (e.textContent || '').trim().length > 4)[0];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });   // 真人是滚到那一页才点的；角标只画视口里的
    el.click();
    return { tag: el.tagName.toLowerCase(), text: (el.textContent || '').replace(/\s+/g, ' ').trim() };
  }, p2);
  const giz = await page.evaluate(() => { const g = document.getElementById('preview').contentDocument.querySelector('.sm-gizmo'); return { on: !!g, mv: !!g?.querySelector('.mv'), ann: !!g?.querySelector('.ann'), se: !!g?.querySelector('.se') }; });
  check('③ 选中元素后 gizmo 有三颗把手：✥ 移动 · 💬 批注 · ◢ 缩放', giz.on && giz.mv && giz.ann && giz.se, JSON.stringify(giz));

  await page.evaluate(() => document.getElementById('preview').contentDocument.querySelector('.sm-gizmo .ann').click());
  await page.waitForFunction(() => document.getElementById('annModal').style.display === 'flex', { timeout: 4000 });
  const modal = await page.evaluate(() => ({ where: document.getElementById('annWhere').textContent, snip: document.getElementById('annSnip').textContent }));
  check('③ 💬 打开批注小窗，写明「第几页 · 什么标签 · 本页第几个」+ 原文',
    /第 3 页/.test(modal.where) && modal.where.includes(`<${sel.tag}>`) && modal.snip.includes(sel.text.slice(0, 10)), `${modal.where} ${modal.snip}`);

  await page.fill('#annText', '这句改口语一点');
  await page.click('#annAdd');
  await page.waitForFunction(() => window.__SM_ANN_LIST__().length === 1, { timeout: 4000 });
  const ann = (await page.evaluate(() => window.__SM_ANN_LIST__()))[0];
  check('③ 批注存的是「原文 40 字」主锚点 + tag/本页第几个 兜底', ann.slideId === p2 && ann.page === 3 && ann.sel.tag === sel.tag && ann.sel.nth >= 1 && ann.sel.snippet.length > 0 && sel.text.startsWith(ann.sel.snippet), JSON.stringify(ann.sel));
  await page.screenshot({ path: resolve(shotDir, '02-element-ann.png') });
  await page.evaluate(() => window.__SM_ANN_CLOSE__());

  const badges = await page.evaluate(() => window.__SM_ANN_BADGES__());
  check('③ 幻灯片上留下序号角标（点开可看 / 可删）', badges === 1, `badges=${badges}`);
  await page.screenshot({ path: resolve(shotDir, '03-badge-on-slide.png') });
  const leftDot = await page.evaluate(() => { const r = document.querySelectorAll('#slides .srow')[2]; const b = r?.querySelector('.sbadge'); return { cls: b?.className, tip: b?.title }; });
  check('③ 左栏那一页也挂上 ● —— 批注完往回翻，看得出哪几页动过', leftDot.cls === 'sbadge todo' && /元素批注/.test(leftDot.tip || ''), JSON.stringify(leftDot));
  // 角标是浮层（position:fixed 按元素实时算），滚开必须消失、滚回来必须回来
  const follow = await page.evaluate(async () => {
    const w = document.getElementById('preview').contentWindow;
    const el = document.getElementById('preview').contentDocument.querySelector('#deck .slide[data-sm-annprobe], #deck .slide');
    w.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 250));
    const away = window.__SM_ANN_BADGES__();
    w.scrollTo(0, el ? 0 : 0);
    return away;
  });
  check('③ 滚开后角标不再画（视口外不占开销）', follow === 0, `away=${follow}`);
  await page.evaluate(() => { const d = document.getElementById('preview').contentDocument; d.querySelectorAll('#deck .slide')[2].scrollIntoView({ block: 'center' }); });
  await page.waitForFunction(() => window.__SM_ANN_BADGES__() === 1, { timeout: 4000 }).catch(() => {});
  check('③ 滚回来角标自己回来（跟着滚动重算，不用手动刷新）', (await page.evaluate(() => window.__SM_ANN_BADGES__())) === 1);

  // 第二条批注挂在同一页的另一个元素上 —— 一页多条要能并存
  await page.evaluate((sid) => window.__SM_ANN_ADD__(sid, 'p,li,h2,h3', '这里再补一句数据'), p2);
  const todo = await page.evaluate(() => window.__SM_TODO__());
  const annItems = todo.filter((t) => t.cls === 'ann');
  check('③ 待办里多一类「批注 · 元素」，与改字 / 配图 / 讲稿批注并列', annItems.length === 2 && annItems.every((t) => t.page === 3) && todo.some((t) => t.cls === 'edit'), todo.map((t) => t.cls).join(','));
  const tabN = await page.evaluate(() => document.getElementById('aiTabNum').textContent);
  check('③ 元素批注也计入 AI tab 角标', tabN === String(todo.length), `${tabN}/${todo.length}`);

  // 同一页同时有「整页修改意见」和多条元素批注 —— 两者一起给 AI
  await page.evaluate((sid) => window.__SM_SET_INSTR__(sid, '整页压缩到三行'), p2);
  const req = await page.evaluate(() => window.__SM_ALL_REQUEST__());
  const c = req.content;
  check('④ 请求里带上「认位置的规矩」：原文为主、tag/序号兜底、只改被点名的元素',
    c.includes('元素批注规则') && c.includes('原文开头') && c.includes('兜底') && c.includes('只动被点名的元素'));
  check('④ 每条批注都给了 原文 + tag + 本页第几个',
    c.includes('**元素批注（针对本页里的具体元素，逐条照办）：**') && c.includes(`\`<${sel.tag}>\``) && c.includes('原文开头「') && c.includes('这句改口语一点') && c.includes('这里再补一句数据'));
  check('④ 整页修改意见和元素批注同页并存，不互相顶掉', c.includes('整页压缩到三行') && c.includes('这句改口语一点'));
  check('④ 按钮上写几项，桥就收到几项', req.count === (await page.evaluate(() => window.__SM_TODO__().length)), `count=${req.count}`);

  // ============ 边界：角标只属于编辑态 ============
  const present = await page.evaluate(() => {
    const d = document.getElementById('preview').contentDocument;
    const layer = d.getElementById('sm-annlayer');
    const before = getComputedStyle(layer).display;
    d.body.classList.add('present');
    const during = getComputedStyle(layer).display;
    d.body.classList.remove('present');
    return { before, during, after: getComputedStyle(layer).display };
  });
  check('⑤ 一进放映角标整层消失，退出自动回来（CSS 挂选择器，不靠 JS 监听）',
    present.before !== 'none' && present.during === 'none' && present.after !== 'none', JSON.stringify(present));
  const exported = await page.evaluate(() => window.__SM_EXPORT_HTML__());
  check('⑤ 导出的文件里一个字都没有（角标不进 htmlSlides，也不进 cleanSectionHtml）',
    !/sm-annlayer|sm-annbadge|sm-ann-css|sm-annring/.test(exported));

  // ============ AI 改完那一页 → 该页批注算办完 ============
  await page.evaluate(([sid]) => window.__SM_APPLY_PATCH__(`<section class="slide" data-id="${sid}"><h2>AI 改写版</h2><p>短了</p></section>`), [p2]);
  await page.waitForFunction(() => window.__SM_ANN_LIST__().length === 0, { timeout: 6000 });
  const leftover = await page.evaluate(() => ({ anns: window.__SM_ANN_LIST__().length, badges: window.__SM_ANN_BADGES__(), todo: window.__SM_TODO__().filter((t) => t.cls === 'ann').length }));
  check('⑥ AI 改完那一页，该页的元素批注跟着清掉（和「改字」→ ✓ 已改 同一个道理）',
    leftover.anns === 0 && leftover.badges === 0 && leftover.todo === 0, JSON.stringify(leftover));

  check('no page errors', errs.length === 0, errs[0] || '');
} finally {
  await browser.close();
  bridge.close && bridge.close();
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
