import { WebSocket } from 'ws'; import { readFileSync } from 'node:fs';
const S='/private/tmp/claude-501/-Users-zhouliying------Claude-Projects-SlidesHTML-presentsystems/f885e8c6-d935-414d-b45e-05e0dd643779/scratchpad';
const TX=readFileSync(S+'/tx.b64','utf8').trim(), P=JSON.parse(readFileSync(S+'/slides.json','utf8'));
// 作者定稿的提词表：故意和讲稿 <strong> 说不同的话
const CUES={ 'p1':['作者定稿的词'], 'p2':['第二页定稿词'] };
let i=0; const ws=new WebSocket('ws://127.0.0.1:8799/ws?room=testroom01&role=deck');
const st=()=>({slideIdx:i,total:P.length,anchor:P[i][0],title:P[i][1],prevTitle:'',nextTitle:i<P.length-1?P[i+1][1]:'',source:'slides'});
ws.on('open',()=>console.log('[deck] up'));
ws.on('message',d=>{let m;try{m=JSON.parse(d.toString());}catch{return;}
 if(m.type==='need-info'){console.log('[deck] 推 deck-info（含 cues）');
   ws.send(JSON.stringify({type:'deck-info',txb64:TX,title:'优先级测试',state:st(),cues:CUES}));}
 else if(m.type==='cmd'){ if(m.action==='next')i=Math.min(P.length-1,i+1); else if(m.action==='prev')i=Math.max(0,i-1);
   console.log('[deck] → 第 '+(i+1)+' 页'); ws.send(JSON.stringify({type:'state',state:st()}));}});
