// 假放映端 —— 用**真讲稿**（DYQ 答辩那份）说话，验原生端解析
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
const S='/private/tmp/claude-501/-Users-zhouliying------Claude-Projects-SlidesHTML-presentsystems/f885e8c6-d935-414d-b45e-05e0dd643779/scratchpad';
const TXB64 = readFileSync(S+'/tx.b64','utf8').trim();
const PAIRS = JSON.parse(readFileSync(S+'/slides.json','utf8'));
const ROOM='testroom01'; let idx=0;
const ws=new WebSocket(`ws://127.0.0.1:8799/ws?room=${ROOM}&role=deck`);
const st=()=>({slideIdx:idx,total:PAIRS.length,anchor:PAIRS[idx][0],title:PAIRS[idx][1],
  prevTitle:idx>0?PAIRS[idx-1][1]:'',nextTitle:idx<PAIRS.length-1?PAIRS[idx+1][1]:'',source:'slides'});
const send=o=>{try{ws.send(JSON.stringify(o));}catch{}};
ws.on('open',()=>console.log('[deck] connected · '+PAIRS.length+' 页 · 讲稿 '+TXB64.length+' 字符 b64'));
ws.on('message',d=>{let m;try{m=JSON.parse(d.toString());}catch{return;}
  if(m.type==='need-info'){console.log('[deck] <- need-info → 推真讲稿');
    send({type:'deck-info',txb64:TXB64,title:'增强现实营销中的补偿效应研究',state:st()});}
  else if(m.type==='cmd'&&m.action){
    if(m.action==='next')idx=Math.min(PAIRS.length-1,idx+1);
    else if(m.action==='prev')idx=Math.max(0,idx-1);
    else if(m.action==='first')idx=0; else if(m.action==='last')idx=PAIRS.length-1;
    console.log('[deck] <- cmd '+m.action+' → 第 '+(idx+1)+' 页 ['+PAIRS[idx][0]+'] '+PAIRS[idx][1]);
    send({type:'state',state:st()});}
  else console.log('[deck] <- '+m.type);});
