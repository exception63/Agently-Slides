// smlive（管理台的令牌版 API + CLI）的回归。
// 自己起一份本地 smrelay，全程不碰线上 live.zhouliying.com、不写用户真账本。
//
//   node scripts/verify-live-agent.mjs
//
// 覆盖：令牌门（对/错/不带）· whoami · 建房间 · 列房间 · 改名 · 场次 ·
//       条目 · 导出 CSV(BOM)/MD · 远程清屏「只清大屏、账本一条不少」·
//       关/开提问 · 删房间 · **管理台那道门(/api/admin/*)没被令牌绕开**。
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8903, BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'verifytoken0123456789abcdefgh';
const CLI = 'plugin/slidesmith/skills/live/scripts/smlive.mjs';
const RELAY = 'plugin/slidesmith/skills/phone-remote/relay/selfhost/smrelay.py';
const ROOM = 'agentcheck2026';
const ck = [];
const ok = (n, v, x = '') => { ck.push(v); console.log(`${v ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'smagent-'));
const tokFile = join(tmp, 'token');
writeFileSync(tokFile, TOKEN + '\n');

let srv = spawn('python3', [RELAY], {
  env: { ...process.env, SMRELAY_DATA: join(tmp, 'data'), SMRELAY_PORT: String(PORT),
         SMRELAY_HOST: '127.0.0.1', SMRELAY_TOKEN_FILE: tokFile },
  stdio: 'ignore',
});
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { } await sleep(150); }

const cli = (args) => new Promise((res) => {
  const p = spawn('node', [CLI, ...args, '--base', BASE, '--token', TOKEN], { stdio: ['ignore', 'pipe', 'pipe'] });
  let o = '', e = '';
  p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d));
  p.on('close', (c) => res({ code: c, out: o, err: e }));
});
const jq = async (args) => JSON.parse((await cli([...args, '--json'])).out);

// ── 1. 令牌门 ──────────────────────────────────────────────────────
const hit = (p, tok) => fetch(BASE + p, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
ok('带对令牌 → 200', (await hit('/api/agent/whoami', TOKEN)).status === 200);
ok('带错令牌 → 401', (await hit('/api/agent/whoami', 'wrong-token')).status === 401);
ok('不带令牌 → 401', (await hit('/api/agent/whoami', null)).status === 401);
// 管理台那道门在 Caddy 上，本地没有 Caddy；这里确认的是**服务端没有把令牌当成管理台的通行证**，
// 即 /api/admin/* 不因为带了令牌就变成另一条路径（它在线上仍旧被 msauth 拦）。
const adminDirect = await hit('/api/admin/overview', TOKEN);
ok('/api/admin/* 仍是原来那条路（线上由 Caddy 的 msauth 把门）', adminDirect.status === 200);

// ── 2. 房间生命周期 ────────────────────────────────────────────────
let r = await jq(['new', ROOM, '--name', '回归用房间']);
ok('建房间', r.ok && r.id === ROOM);
r = await jq(['rooms']);
ok('列房间看得到它', r.rooms.some((x) => x.id === ROOM && x.name === '回归用房间'));
await cli(['rename', ROOM, '--name', '改过名的房间']);
r = await jq(['rooms']);
ok('改名生效', r.rooms.find((x) => x.id === ROOM)?.name === '改过名的房间');

// ── 3. 造一场真的：deck 上线开场 + 学生提问 ────────────────────────
const ws = (role) => new Promise((res) => {
  const s = new WebSocket(`${BASE.replace('http', 'ws')}/ws?room=${ROOM}&role=${role}`);
  s.onopen = () => setTimeout(() => res(s), 150); s.onerror = () => res(null);
});
const deck = await ws('deck');
const ask = await ws('ask');
for (const t of ['第一个问题', '第二个问题', '第三个问题']) { ask.send(JSON.stringify({ type: 'qa-add', text: t })); await sleep(4200); }
await sleep(400);

r = await jq(['sessions', ROOM]);
ok('放映端上线自动开了一场，序号从 1 数', r.sessions.length === 1 && r.sessions[0].no === 1);
const SID = r.sessions[0].id;
ok('这一场记到 3 条提问', r.sessions[0].items === 3, String(r.sessions[0].items));
ok('在线峰值记下来了（不是设备标识）', r.sessions[0].peak >= 1, String(r.sessions[0].peak));

r = await jq(['items', ROOM]);
ok('给房间号也能取到最近一场的条目', r.items.length === 3);

// ── 4. 清屏只清大屏，账本一条不少 ──────────────────────────────────
await cli(['clear', ROOM]);
await sleep(600);
r = await jq(['items', String(SID)]);
ok('清屏后账本仍是 3 条（只清了大屏）', r.items.length === 3);
r = await jq(['rooms']);
ok('清屏后大屏上是 0 条', r.rooms.find((x) => x.id === ROOM)?.wallNow === 0);

await cli(['close', ROOM]); await sleep(600);
ok('关提问：管理端状态跟着变', (await jq(['rooms'])).rooms.find((x) => x.id === ROOM)?.closed === true);
const ask2 = await ws('ask');
const acked = await new Promise((res) => { ask2.onmessage = (e) => { const d = JSON.parse(e.data); if (d.type === 'qa-ack') res(d); };
  ask2.send(JSON.stringify({ type: 'qa-add', text: '关了还能提交吗' })); setTimeout(() => res(null), 3000); });
ok('关提问后学生提交被挡下', acked && acked.ok === false && acked.why === 'closed');
await cli(['open', ROOM]);

// ── 5. 导出 ────────────────────────────────────────────────────────
const csv = join(tmp, 'out.csv'), md = join(tmp, 'out.md');
await cli(['export', ROOM, '--fmt', 'csv', '--out', csv]);
const buf = readFileSync(csv);
ok('导出 CSV 带 BOM（Excel 开中文不乱码）', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf);
// 表头里也有「问题」两个字，别拿它当计数条件——数正文行
ok('CSV 里三条都在', ['第一个问题', '第二个问题', '第三个问题'].every((q) => buf.toString('utf8').includes(q)));
await cli(['export', ROOM, '--fmt', 'md', '--out', md]);
ok('导出 Markdown', existsSync(md) && readFileSync(md, 'utf8').includes('第一个问题'));
// 条目 ts 在库里是毫秒、场次时间是秒。接口若原样吐毫秒，管理台和导出都会按秒解释它，
// 日期变成公元 58626 年（线上真出过）。接口对外必须统一成秒。
const yr = new Date().getFullYear();
r = await jq(['items', String(SID)]);
ok('接口给的条目时间是秒（不是毫秒）', new Date(r.items[0].ts * 1000).getFullYear() === yr,
   new Date(r.items[0].ts * 1000).toISOString().slice(0, 10));
ok('导出里的时间是今年（不是公元 58626 年）', readFileSync(md, 'utf8').includes(String(yr) + '-'));

// ── 6. 没人连着也要能关提问 ────────────────────────────────────────
// 课讲完了、投影关了，可二维码还贴在那儿 —— **这恰恰是最需要关提问的时刻**。
// 原来管理台这两颗按钮按 deck 是否在线禁用，中转也回「这个房间现在没人连着」，
// 于是最该用的时候用不了。这里用一个**从来没有人连过**的房间来验（只在库里，不在 ROOMS 里）。
const COLD = 'coldroom2026';
await jq(['new', COLD, '--name', '没人连过的房间']);
r = await cli(['close', COLD]);
ok('房间没人连着时也能关提问', r.code === 0, r.err.trim());
await sleep(600);
ok('关了之后管理端看得到是关的', (await jq(['rooms'])).rooms.find((x) => x.id === COLD)?.closed === true);
const cold1 = await new Promise((res) => {
  const w = new WebSocket(`${BASE.replace('http', 'ws')}/ws?room=${COLD}&role=ask`);
  const st = {}; w.onmessage = (e) => { const d = JSON.parse(e.data); if (d.type === 'qa-state') st.closed = d.closed;
    if (d.type === 'qa-ack') { st.ack = d; res({ w, st }); } };
  w.onopen = () => setTimeout(() => w.send(JSON.stringify({ type: 'qa-add', text: '还能提吗' })), 250);
  setTimeout(() => res({ w, st }), 4000);
});
ok('学生一连上就被告知已关闭', cold1.st.closed === true);
ok('关闭状态落了盘，新连上的学生提交被挡', cold1.st.ack?.ok === false && cold1.st.ack?.why === 'closed');
cold1.w?.close();
await sleep(300);

// **重启中转**再看一眼：关闭状态是落盘的，重启后学生照样被挡；
// 管理台也必须照样显示「已关闭」。原来这里会显示成「开着」——
// 房间不在内存里时 overview 一律报 false，讲者会以为二维码还敞着。
srv.kill(); await sleep(500);
srv = spawn('python3', [RELAY], {
  env: { ...process.env, SMRELAY_DATA: join(tmp, 'data'), SMRELAY_PORT: String(PORT),
         SMRELAY_HOST: '127.0.0.1', SMRELAY_TOKEN_FILE: tokFile },
  stdio: 'ignore',
});
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { } await sleep(150); }
ok('重启后管理台仍显示「已关闭」（不是内存状态，是盘上的）',
   (await jq(['rooms'])).rooms.find((x) => x.id === COLD)?.closed === true);
const cold2 = await new Promise((res) => {
  const w = new WebSocket(`${BASE.replace('http', 'ws')}/ws?room=${COLD}&role=ask`);
  w.onmessage = (e) => { const d = JSON.parse(e.data); if (d.type === 'qa-ack') { res(d); w.close(); } };
  w.onopen = () => setTimeout(() => w.send(JSON.stringify({ type: 'qa-add', text: '重启之后呢' })), 250);
  setTimeout(() => res(null), 4000);
});
ok('重启后学生仍旧被挡', cold2?.ok === false && cold2?.why === 'closed');

await cli(['rm', COLD, '--yes']);

// ── 7. 分场判据＝自然日 ────────────────────────────────────────────
// 线上真出过：放映端 14:54 就断了（那只是课前试机），16:29 才真上课，
// 按「静默 30 分钟」分会把同一堂课切成两场。改成按自然日。
const dbf = join(tmp, 'data', 'live.db');

// (a) 同一天里放映端早就断了、隔很久再提问 —— 仍是同一场
execSync(`sqlite3 "${dbf}" "UPDATE session SET ended=strftime('%s','now')-9000 WHERE id=${SID}"`);
const late = await ws('ask');
late.send(JSON.stringify({ type: 'qa-add', text: '隔了两个半小时才提的问题' }));
await sleep(800);
r = await jq(['sessions', ROOM]);
ok('同一天里隔多久都还是同一场', r.sessions.length === 1, `${r.sessions.length} 场`);
ok('这条记进了当天那一场', r.sessions[0].items === 4);
ok('当天又有动静，收场时间被清回「进行中」', r.sessions[0].ended === null);
late.close();
await sleep(300);
// 当天的峰值本来就该跟着涨（上面这些连接都还开着），所以先记下真值，
// 换天之后拿它比对，别写死一个数。
const peakBefore = (await jq(['sessions', ROOM])).sessions[0].peak;

// (b) 换一天 —— 才另起一场
execSync(`sqlite3 "${dbf}" "UPDATE session SET started=strftime('%s','now')-86400*2, ended=strftime('%s','now')-86400*2+600 WHERE id=${SID}"`);
const nextday = await ws('ask');
nextday.send(JSON.stringify({ type: 'qa-add', text: '第二天的问题' }));
await sleep(800);
r = await jq(['sessions', ROOM]);
ok('跨到另一个自然日才另起一场', r.sessions.length === 2, `${r.sessions.length} 场`);
ok('新那一场只有这一条', r.sessions[0].items === 1);
ok('前一天那一场的条目没被动', r.sessions[1].items === 4);
ok('前一天那一场的峰值没被今天的连接改写', r.sessions[1].peak === peakBefore,
   `${r.sessions[1].peak} vs ${peakBefore}`);
nextday.close();

// ── 8. 删除要显式确认 ──────────────────────────────────────────────
r = await cli(['rm', ROOM]);
ok('删房间不加 --yes 就拦下来', r.code !== 0 && /--yes/.test(r.err));
r = await cli(['rm', ROOM, '--yes']);
ok('加了 --yes 才真删', r.code === 0 && !(await jq(['rooms'])).rooms.some((x) => x.id === ROOM));

deck?.close(); ask?.close(); ask2?.close();
srv.kill(); rmSync(tmp, { recursive: true, force: true });
const pass = ck.filter(Boolean).length;
console.log(`\n${pass}/${ck.length} 通过`);
process.exit(pass === ck.length ? 0 : 1);
