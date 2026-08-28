// Slidesmith Live（自托管互动服务）的回归。
// 跑法：先在本地起一份服务，再跑这个脚本 ——
//   SMRELAY_DATA=/tmp/livedata SMRELAY_PORT=8899 python3 <技能>/relay/selfhost/smrelay.py &
//   SP=/tmp node scripts/verify-live-service.mjs
// 覆盖：建房间 · 自动开场 · 提问入账 · 在线峰值 · 管理台远程控制 ·
//       清屏不动账本 · 隔场自动分场 · 刷新不另起一场 · 导出 CSV/MD · 改名删除。
import { chromium } from '/Users/zhouliying/同步空间/Claude Projects/SlidesHTML/presentsystems/node_modules/playwright-core/index.mjs';
const B='http://127.0.0.1:8899';
const ck=[]; const ok=(n,v,x='')=>{ck.push(v);console.log(`${v?'✓':'✗'} ${n}${x?' — '+x:''}`)};
const api=(p,o)=>fetch(B+p,o).then(r=>r.json());
const br=await chromium.launch({headless:true});
const conn=async(role,room,extra='')=>{const p=await br.newPage();await p.goto(B+'/health');
  await p.evaluate(([b,r,rm,e])=>new Promise(res=>{window.__m=[];
    const ws=new WebSocket(b.replace('http','ws')+'/ws?room='+rm+'&role='+r+e);window.__ws=ws;
    ws.onmessage=x=>window.__m.push(JSON.parse(x.data));ws.onopen=()=>setTimeout(res,250);
    ws.onerror=()=>res();setTimeout(res,4000);}),[B,role,room,extra]);return p;};
const send=(p,o)=>p.evaluate(o=>window.__ws.send(JSON.stringify(o)),o);

// 建房间
let r = await api('/api/admin/room',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'create',name:'营销学 2026 秋'})});
ok('管理台能新建房间（房间号自动生成）', r.ok && /^[a-z0-9]{4,}$/.test(r.id), r.id);
const RID=r.id;

// 第一场
const deck1=await conn('deck',RID);
await deck1.waitForFunction(()=>window.__m.some(m=>m.type==='joined'),null,{timeout:5000});
const a1=await conn('ask',RID), a2=await conn('ask',RID), a3=await conn('ask',RID);
for (const [p,t] of [[a1,'第一场问题甲'],[a2,'第一场问题乙'],[a3,'第一场问题丙']]) {
  await send(p,{type:'qa-add',text:t});
  await p.waitForFunction(()=>window.__m.some(m=>m.type==='qa-ack'&&m.ok),null,{timeout:5000});
}
let ov=await api('/api/admin/overview');
let room=ov.rooms.find(x=>x.id===RID);
ok('放映端一上线就自动开了一场', room.sessions===1, `场次 ${room.sessions}`);
ok('提问实时进账本', room.items===3, `${room.items} 条`);
ok('管理台看得到当前在线（放映端 + 学生台数）', room.online.deck===1 && room.online.ask===3, JSON.stringify(room.online));
let ss=await api('/api/admin/sessions?room='+RID);
ok('在线峰值记下来了（只是个数字，不含任何设备标识）', ss.sessions[0].peak===3, `峰值 ${ss.sessions[0].peak}`);

// 管理台远程控制
await api('/api/admin/control',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({room:RID,action:'close'})});
await a1.waitForFunction(()=>window.__m.some(m=>m.type==='qa-state'&&m.closed),null,{timeout:5000});
ok('管理台「关闭提问」→ 学生端立刻生效（不用掏 iPad）', true);
await api('/api/admin/control',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({room:RID,action:'open'})});
await a1.waitForFunction(()=>window.__m.some(m=>m.type==='qa-state'&&!m.closed),null,{timeout:5000});
const wall=await conn('wall',RID);
await api('/api/admin/control',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({room:RID,action:'clear'})});
await wall.waitForFunction(()=>window.__m.some(m=>m.type==='qa-cleared'),null,{timeout:5000});
ok('管理台「清屏」→ 大屏清空', true);
ov=await api('/api/admin/overview'); room=ov.rooms.find(x=>x.id===RID);
ok('★ 清屏只清大屏，账本一条不少', room.items===3, `账本仍 ${room.items} 条`);

// 场次分割：放映端下线再上线（模拟隔了一次课）
for (const p of [deck1,a1,a2,a3,wall]) await p.close();
await new Promise(r=>setTimeout(r,600));
// 直接改库把上一场推远，模拟"隔了一天"
const { execSync } = await import('node:child_process');
execSync(`sqlite3 "${process.env.SP}/livedata/live.db" "UPDATE session SET ended=strftime('%s','now')-4000 WHERE room='${RID}'"`);
const deck2=await conn('deck',RID);
await deck2.waitForFunction(()=>window.__m.some(m=>m.type==='joined'),null,{timeout:5000});
const b1=await conn('ask',RID);
await send(b1,{type:'qa-add',text:'第二场的问题'});
await b1.waitForFunction(()=>window.__m.some(m=>m.type==='qa-ack'&&m.ok),null,{timeout:5000});
ss=await api('/api/admin/sessions?room='+RID);
ok('★ 隔了一次课再开讲 = 自动分成第二场', ss.sessions.length===2, `${ss.sessions.length} 场`);
ok('新问题记在第二场，不和上一场混', ss.sessions[0].items===1 && ss.sessions[1].items===3,
   `新场 ${ss.sessions[0].items} 条 / 旧场 ${ss.sessions[1].items} 条`);

// 刷新页面不该另起一场
await deck2.close(); await new Promise(r=>setTimeout(r,400));
const deck3=await conn('deck',RID);
await deck3.waitForFunction(()=>window.__m.some(m=>m.type==='joined'),null,{timeout:5000});
ss=await api('/api/admin/sessions?room='+RID);
ok('★ 中途刷新/断线重连仍算同一场（现场天天发生）', ss.sessions.length===2, `${ss.sessions.length} 场`);

// 导出
const sid=ss.sessions[1].id;
// fetch().text() 按规范会把 BOM 吃掉，所以验字节而不是验字符串
const csvBuf=new Uint8Array(await fetch(B+'/api/admin/export?session='+sid+'&fmt=csv').then(r=>r.arrayBuffer()));
const csv=new TextDecoder().decode(csvBuf);
ok('导出 CSV（带 BOM，Excel 开中文不乱码）',
   csvBuf[0]===0xEF && csvBuf[1]===0xBB && csvBuf[2]===0xBF && csv.includes('第一场问题甲'),
   'BOM ' + [...csvBuf.slice(0,3)].map(b=>b.toString(16)).join(' '));
const md=await fetch(B+'/api/admin/export?session='+sid+'&fmt=md').then(r=>r.text());
ok('导出 Markdown（可直接塞进备课稿）', md.includes('# ') && md.includes('第一场问题甲'));

// 改名 / 删除
await api('/api/admin/room',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'rename',id:RID,name:'营销学 2026 秋（改过）'})});
ov=await api('/api/admin/overview');
ok('改名生效', ov.rooms.find(x=>x.id===RID).name.includes('改过'));
await api('/api/admin/room',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'delete',id:RID})});
ov=await api('/api/admin/overview');
ok('删除房间连同场次和提问一起清掉', !ov.rooms.find(x=>x.id===RID));
ok('★ 别的房间不受影响（老数据还在）', !!ov.rooms.find(x=>x.id==='oldroom01'));

await br.close();
const pass=ck.filter(Boolean).length; console.log(`\n${pass}/${ck.length} 通过`);
process.exit(pass===ck.length?0:1);
