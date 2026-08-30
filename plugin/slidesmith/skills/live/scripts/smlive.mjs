#!/usr/bin/env node
/**
 * smlive —— Slidesmith Live 管理台的命令行/AI 版。
 *
 * 管理台 `/` 的门是 msauth（浏览器登录，密码同 MySpace），AI 拿不到也不该拿到。
 * 所以服务端开了第二道门 `/api/agent/*` + Bearer 令牌，业务逻辑和管理台是同一份。
 * 这个 CLI 就是那道门的客户端。
 *
 *   node smlive.mjs setup --token <令牌>      只做一次，写进 ~/.slidesmith/live.json (0600)
 *   node smlive.mjs rooms
 *   node smlive.mjs new qygl2026 --name "企业管理 2026 级宣讲"
 *   node smlive.mjs sessions qygl2026
 *   node smlive.mjs items qygl2026            最近一场的全部提问
 *   node smlive.mjs export qygl2026 --fmt csv --out ~/Desktop/提问.csv
 *   node smlive.mjs clear|close|open qygl2026
 *   node smlive.mjs rename qygl2026 --name "…"   /   rm qygl2026 --yes
 *
 * 任何命令加 --json 出机器可读的原始结果。令牌在服务器 /etc/smrelay/token。
 */
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const CFG = join(homedir(), '.slidesmith', 'live.json');
const DEFAULT_BASE = 'https://live.zhouliying.com';

const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const pos = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] ?? d); };
const has = (n) => argv.includes('--' + n);
const JSONOUT = has('json');
const die = (m, code = 1) => { console.error('✗ ' + m); process.exit(code); };

// ── 配置 ────────────────────────────────────────────────────────────
function cfg() {
  let c = {};
  if (existsSync(CFG)) { try { c = JSON.parse(readFileSync(CFG, 'utf8')); } catch { } }
  const base = String(flag('base', c.base || DEFAULT_BASE)).replace(/\/$/, '');
  const token = flag('token', process.env.SMLIVE_TOKEN || c.token || '');
  return { base, token };
}

// ── 请求 ────────────────────────────────────────────────────────────
async function api(path, { method = 'GET', body = null, raw = false } = {}) {
  const { base, token } = cfg();
  if (!token) die(`还没配令牌。先跑：\n  node ${process.argv[1]} setup --token <令牌>\n令牌在服务器上：sudo cat /etc/smrelay/token`);
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) { die(`连不上 ${base}：${e.message}`); }
  if (res.status === 401) die('令牌不对。服务器上 sudo cat /etc/smrelay/token 看一眼，再 setup 一次。');
  if (raw) return { buf: Buffer.from(await res.arrayBuffer()), ct: res.headers.get('content-type') || '' };
  let j;
  try { j = await res.json(); } catch { die(`${path} 返回的不是 JSON（HTTP ${res.status}）—— 多半是被登录页挡了，检查 Caddy 里 /api/agent/* 有没有绕开 forward_auth`); }
  if (j.ok === false) die(j.error || '接口说不行');
  return j;
}

// ── 显示 ────────────────────────────────────────────────────────────
const t = (s) => (s ? new Date(s * 1000).toLocaleString('zh-CN', { hour12: false }) : '—');
// 一场＝一个自然日，所以这是「当天第一个动静到最后一个动静」的**跨度**，
// 不是连续讲了这么久（中间可能试机完隔了一个半小时才上课）。
const dur = (a, b) => {
  if (!a || !b) return '进行中';
  const m = Math.max(1, Math.round((b - a) / 60));
  return m < 60 ? m + ' 分钟' : Math.floor(m / 60) + ' 小时' + (m % 60 ? (m % 60) + ' 分' : '');
};
// 定宽列：中日韩字符占两格。**超长要截断**，否则那一格把后面所有列一起挤歪。
const cw = (c) => (/[⺀-￿]/.test(c) ? 2 : 1);
const w = (s, n) => {
  s = String(s ?? ''); let l = 0, o = '';
  for (const c of s) { if (l + cw(c) > n - 1) { o += '…'; l += 1; break; } o += c; l += cw(c); }
  return o + ' '.repeat(Math.max(0, n - l));
};
const out = (obj, human) => { if (JSONOUT) console.log(JSON.stringify(obj, null, 2)); else human(); };

// ── 命令 ────────────────────────────────────────────────────────────
const need = (what) => pos[0] || die(`要给${what}。例：node smlive.mjs ${cmd} qygl2026`);

/** 房间 → 最近一场的 id（items / export 允许直接给房间号） */
async function resolveSession(idOrRoom) {
  if (/^\d+$/.test(idOrRoom)) return +idOrRoom;
  const r = await api('/api/agent/sessions?room=' + encodeURIComponent(idOrRoom));
  if (!r.sessions?.length) die(`房间 ${idOrRoom} 还没有开讲记录`);
  return r.sessions[0].id;      // 接口按倒序，第一条就是最近一场
}

switch (cmd) {
  case 'setup': {
    const token = flag('token') || die('要 --token。服务器上：sudo cat /etc/smrelay/token');
    const base = String(flag('base', DEFAULT_BASE)).replace(/\/$/, '');
    mkdirSync(dirname(CFG), { recursive: true });
    writeFileSync(CFG, JSON.stringify({ base, token }, null, 2) + '\n');
    chmodSync(CFG, 0o600);
    const me = await api('/api/agent/whoami');
    console.log(`✓ 配好了 → ${CFG}（0600）`);
    console.log(`  ${base} · ${me.service} ${me.version} · ${me.rooms_total} 个房间`);
    break;
  }

  case 'whoami': {
    const r = await api('/api/agent/whoami');
    out(r, () => console.log(`✓ ${cfg().base} · ${r.service} ${r.version} · 在线房间 ${r.rooms_live} · 共 ${r.rooms_total} 个房间`));
    break;
  }

  case 'rooms': case 'ls': {
    const r = await api('/api/agent/overview');
    out(r, () => {
      if (!r.rooms.length) return console.log('还没有房间。建一个：node smlive.mjs new <房间号> --name "课程名"');
      console.log(w('房间号', 20) + w('名字', 30) + w('场次', 6) + w('累计', 6) + w('现在', 26) + '最近一场');
      console.log('─'.repeat(112));
      for (const m of r.rooms) {
        const on = m.online
          ? `放映${m.online.deck} 学生${m.online.ask}${m.closed ? ' · 已关提问' : ''}`
          : (m.closed ? '没人连着 · 已关提问' : '—');   // 关闭状态是落盘的，房间不在线也照样成立
        console.log(w(m.id, 20) + w(m.name || '（没起名）', 30) + w(m.sessions, 6) + w(m.items, 6) + w(on, 26)
          + (m.last ? t(m.last.started) + (m.last.ended ? '' : ' · 进行中') : '未开讲'));
      }
    });
    break;
  }

  case 'new': case 'create': {
    const r = await api('/api/agent/room', { method: 'POST', body: { action: 'create', id: pos[0] || '', name: flag('name', '') } });
    const { base } = cfg();
    out(r, () => {
      console.log(`✓ 房间 ${r.id} 建好了${flag('name') ? `（${flag('name')}）` : ''}`);
      console.log(`  学生扫码   ${base}/q/${r.id}`);
      console.log(`  你的 iPad  ${base}/r/${r.id}`);
      console.log(`  装进 deck  node <…>/skills/live/scripts/inject-live.mjs <deck.html> --room ${r.id}`);
    });
    break;
  }

  case 'rename': {
    const id = need('房间号'); const name = flag('name') || die('要 --name');
    await api('/api/agent/room', { method: 'POST', body: { action: 'rename', id, name } });
    console.log(`✓ ${id} 改名为「${name}」`);
    break;
  }

  case 'rm': case 'delete': {
    const id = need('房间号');
    if (!has('yes')) die(`删房间会**连同它所有场次和提问一起删掉，不可恢复**。确认请加 --yes：\n  node smlive.mjs rm ${id} --yes`);
    await api('/api/agent/room', { method: 'POST', body: { action: 'delete', id } });
    console.log(`✓ 房间 ${id} 和它的全部记录已删除`);
    break;
  }

  case 'sessions': {
    const room = need('房间号');
    const r = await api('/api/agent/sessions?room=' + encodeURIComponent(room));
    out(r, () => {
      console.log(`${room}${r.name ? ' · ' + r.name : ''}`);
      if (!r.sessions.length) return console.log('  还没有开讲记录。放映端第一次连上就会自动开一场。');
      console.log('  ' + w('场次', 8) + w('id', 8) + w('日期 · 首个动静', 22) + w('跨度', 12) + w('提问', 6) + '在线峰值');
      for (const s of r.sessions)
        console.log('  ' + w('第 ' + s.no + ' 场', 8) + w(s.id, 8) + w(t(s.started), 22) + w(dur(s.started, s.ended), 12) + w(s.items, 6) + (s.peak || 0));
    });
    break;
  }

  case 'items': case 'questions': {
    const sid = await resolveSession(need('房间号或场次 id'));
    const r = await api('/api/agent/items?session=' + sid);
    out(r, () => {
      if (!r.items.length) return console.log(`第 ${sid} 场没有提问。`);
      r.items.forEach((it, i) => console.log(
        `${String(i + 1).padStart(3)}. ${it.t}${it.hidden ? '   〔现场已撤下〕' : ''}\n     ${t(it.ts)}`));   // 接口给的一律是秒
      console.log(`\n共 ${r.items.length} 条（场次 ${sid}）`);
    });
    break;
  }

  case 'export': {
    const sid = await resolveSession(need('房间号或场次 id'));
    const fmt = flag('fmt', 'csv');
    const { buf } = await api(`/api/agent/export?session=${sid}&fmt=${encodeURIComponent(fmt)}`, { raw: true });
    const dest = flag('out', join(homedir(), 'Desktop', `slidesmith-live-${sid}.${fmt === 'md' ? 'md' : 'csv'}`));
    writeFileSync(dest, buf);
    console.log(`✓ 第 ${sid} 场导出 → ${dest}（${buf.length} 字节${fmt === 'csv' ? ' · 带 BOM，Excel 开中文不乱码' : ''}）`);
    break;
  }

  case 'clear': case 'close': case 'open': {
    const room = need('房间号');
    await api('/api/agent/control', { method: 'POST', body: { room, action: cmd } });
    console.log({ clear: `✓ ${room} 大屏已清空（**账本一条不少**，导出仍看得到）`,
                  close: `✓ ${room} 已关闭提问（学生再提交会被挡下）`,
                  open: `✓ ${room} 已重新开放提问` }[cmd]);
    break;
  }

  case 'urls': {
    const room = need('房间号'); const { base } = cfg();
    console.log(`房间号     ${room}\n学生扫码   ${base}/q/${room}\n你的 iPad  ${base}/r/${room}\n管理台     ${base}/`);
    break;
  }

  default:
    // 帮助就是文件头那段注释，别再维护第二份
    const src = readFileSync(new URL(import.meta.url), 'utf8').split('\n');
    console.log(src.slice(src.indexOf('/**') + 1, src.indexOf(' */')).join('\n').replace(/^ \* ?/gm, '').trim());
    if (cmd !== 'help') process.exitCode = 1;
}
