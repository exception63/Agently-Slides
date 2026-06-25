// The editor browser app: 3-panel GUI (slide list / live preview / inspector).
// Served at `/`. Vanilla JS talks to the server API and drives the preview
// iframe. Client JS avoids template literals / ${} so it can live inside this
// TS template literal safely.

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;color:#1c1c1f}
body{display:flex;flex-direction:column;background:#f4f4f5}
.ehead{height:48px;flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:0 16px;background:#1b1b1d;color:#eee;font-size:14px}
.ehead .title{font-weight:600}
.ehead .grow{flex:1}
.ehead #status{font-size:12px;color:#9bd29b;min-width:96px;text-align:right}
.ehead button{background:#2c2c2f;color:#eee;border:1px solid #3a3a3d;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}
.ehead button:hover{background:#3a3a3d}
.ehead button.primary{background:#B5402A;border-color:#B5402A}
.emain{flex:1;display:flex;min-height:0}
.left{width:248px;flex:0 0 auto;background:#fff;border-right:1px solid #e2e2e4;display:flex;flex-direction:column}
.lbar{display:flex;gap:6px;padding:10px;border-bottom:1px solid #eee}
.lbar button{flex:1;background:#f1f1f2;border:1px solid #e0e0e2;border-radius:6px;padding:6px 0;cursor:pointer;font-size:14px}
.lbar button:hover{background:#e8e8ea}
#slides{flex:1;overflow:auto;padding:8px}
.srow{display:flex;gap:9px;align-items:center;padding:9px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.srow:hover{background:#f6f6f7}
.srow.active{background:#fbeae6;border-color:#e7b5aa}
.srow .snum{font-variant-numeric:tabular-nums;color:#B5402A;font-weight:700;min-width:1.6em}
.srow .stt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.center{flex:1;min-width:0;background:#202022;display:flex;align-items:center;justify-content:center;padding:14px}
#preview{width:100%;height:100%;border:0;background:#000;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
.right{width:300px;flex:0 0 auto;background:#fff;border-left:1px solid #e2e2e4;overflow:auto;padding:16px}
.right h3{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9a9a9e;margin:20px 0 8px}
.right h3:first-child{margin-top:0}
.right select,.right input{width:100%;padding:8px 10px;border:1px solid #d8d8da;border-radius:6px;font-size:14px;background:#fff}
.field{margin-bottom:10px}
.field label{display:block;font-size:12px;color:#6a6a6e;margin-bottom:4px}
#blksel{display:none;border-top:1px dashed #e2e2e4;padding-top:14px;margin-top:14px}
.tag{display:inline-block;background:#f1f1f2;border:1px solid #e0e0e2;border-radius:4px;padding:2px 8px;font-size:12px;color:#555}
.hint{font-size:12px;color:#9a9a9e;line-height:1.6;margin-top:18px;border-top:1px solid #eee;padding-top:12px}
.hint b{color:#6a6a6e}
`;

const CLIENT_JS = `
var deck=null, meta=null, cur=0, selBid=null, saveTimer=null;
var $=function(s){return document.querySelector(s);};
var preview=$('#preview');

function api(path, method, body){
  return fetch(path, {method:method||'GET', headers: body?{'content-type':'application/json'}:undefined, body: body?JSON.stringify(body):undefined}).then(function(r){return r.json();});
}
function esc(t){ return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function trim(t){ t=(t||'').replace(/\\s+/g,' ').trim(); return t.length>20?t.slice(0,19)+'\\u2026':t; }

Promise.all([api('/api/meta'), api('/api/deck')]).then(function(res){
  meta=res[0]; deck=res[1]; buildPanels(); renderLeft(); selectSlide(0);
});

function slideTitle(s){
  var all=[]; for(var k in s.slots){ all=all.concat(s.slots[k]); }
  for(var i=0;i<all.length;i++){ if(all[i].type==='heading') return all[i].text; }
  for(var a=0;a<all.length;a++){ if(all[a].type==='quote') return trim(all[a].text); }
  for(var b=0;b<all.length;b++){ if(all[b].type==='text') return trim(all[b].text); }
  return s.id;
}

function renderLeft(){
  var box=$('#slides'); box.innerHTML='';
  deck.slides.forEach(function(s,i){
    var row=document.createElement('div'); row.className='srow'+(i===cur?' active':'');
    row.innerHTML='<span class="snum">'+(i+1)+'</span><span class="stt">'+esc(slideTitle(s))+'</span>';
    row.addEventListener('click', function(){ selectSlide(i); });
    box.appendChild(row);
  });
}

function selectSlide(i){
  cur=Math.max(0,Math.min(deck.slides.length-1,i));
  [].forEach.call(document.querySelectorAll('.srow'), function(r,idx){ r.classList.toggle('active', idx===cur); });
  gotoPreview(cur); refreshSlidePanel();
}
function gotoPreview(i){ try{ var w=preview.contentWindow; if(w && w.__SM_GO__) w.__SM_GO__(i); }catch(e){} }

function buildPanels(){
  var th=$('#theme');
  meta.themes.forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; th.appendChild(o); });
  th.value=deck.theme||'editorial';
  th.addEventListener('change', function(){ deck.theme=th.value; commitReload(); });
  var an=$('#anim');
  meta.anims.forEach(function(a){ var o=document.createElement('option'); o.value=a; o.textContent=a; an.appendChild(o); });
  an.addEventListener('change', function(){ setAnim(an.value); });
  $('#layout').addEventListener('change', function(){ deck.slides[cur].layout=$('#layout').value; commitReload(); });
  $('#add').addEventListener('click', addSlide);
  $('#del').addEventListener('click', delSlide);
  $('#up').addEventListener('click', function(){ moveSlide(-1); });
  $('#down').addEventListener('click', function(){ moveSlide(1); });
  $('#rebuild').addEventListener('click', rebuild);
  $('#openp').addEventListener('click', function(){ window.open('/preview','_blank'); });
}

function refreshSlidePanel(){
  var s=deck.slides[cur]; var keys=Object.keys(s.slots);
  var lay=$('#layout'); lay.innerHTML='';
  meta.layouts.forEach(function(L){
    var contract=meta.layoutSlots[L]||[];
    var ok=keys.every(function(k){ return contract.indexOf(k)>=0; });
    if(ok){ var o=document.createElement('option'); o.value=L; o.textContent=L; lay.appendChild(o); }
  });
  lay.value=s.layout||'bullets';
}

function findBlock(bid){
  for(var i=0;i<deck.slides.length;i++){ var sl=deck.slides[i];
    for(var k in sl.slots){ var arr=sl.slots[k];
      for(var j=0;j<arr.length;j++){ if(arr[j].id===bid) return arr[j];
        if(arr[j].type==='group'){ var ch=arr[j].children||[]; for(var c=0;c<ch.length;c++){ if(ch[c].id===bid) return ch[c]; } }
      }
    }
  }
  return null;
}

window.addEventListener('message', function(e){
  var d=e.data; if(!d||typeof d!=='object') return;
  if(d.type==='sm-edit'){ applyEdit(d.bid,d.field,d.value); }
  else if(d.type==='sm-select'){ selBid=d.bid; showBlock(d.bid,d.btype); }
  else if(d.type==='sm-ready'){ gotoPreview(cur); }
});

function applyEdit(bid,field,value){
  var b=findBlock(bid); if(!b) return;
  if(field==='items'){ if(value && value.length){ b.items=value; } }
  else { b[field]=value; }
  save();
}

function showBlock(bid,btype){
  var b=findBlock(bid); if(!b) return;
  $('#blksel').style.display='block';
  $('#blktype').textContent=btype||b.type;
  $('#anim').value=(b.build&&b.build.anim)||'none';
}

function setAnim(val){
  if(!selBid) return; var b=findBlock(selBid); if(!b) return;
  b.build=b.build||{}; b.build.anim=val; commitReload();
}

function uid(prefix){
  var ids={}; deck.slides.forEach(function(s){ ids[s.id]=1; for(var k in s.slots){ s.slots[k].forEach(function(b){ ids[b.id]=1; (b.children||[]).forEach(function(c){ids[c.id]=1;}); }); } });
  var n=1; while(ids[prefix+n]) n++; return prefix+n;
}

function addSlide(){
  var s={ id:uid('s'), layout:'bullets', slots:{ main:[{ id:uid('b'), type:'heading', text:'\\u65b0\\u9875\\u9762', level:2 }] } };
  deck.slides.splice(cur+1,0,s); cur=cur+1; renderLeft(); commitReload();
}
function delSlide(){
  if(deck.slides.length<=1) return;
  deck.slides.splice(cur,1); if(cur>=deck.slides.length) cur=deck.slides.length-1;
  renderLeft(); selectSlide(cur); commitReload();
}
function moveSlide(dir){
  var j=cur+dir; if(j<0||j>=deck.slides.length) return;
  var t=deck.slides[cur]; deck.slides[cur]=deck.slides[j]; deck.slides[j]=t;
  cur=j; renderLeft(); selectSlide(cur); commitReload();
}

function reloadPreview(){ preview.src='/preview?t='+(new Date().getTime()); }

// debounced save for inline text edits (no preview reload needed)
function save(){
  status('\\u4fdd\\u5b58\\u4e2d\\u2026');
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer=setTimeout(commit, 350);
}
// immediate save; returns a promise so structural changes can reload AFTER it lands
function commit(){
  status('\\u4fdd\\u5b58\\u4e2d\\u2026');
  return api('/api/deck','POST',deck).then(function(r){ status(r&&r.ok?'\\u5df2\\u4fdd\\u5b58':'\\u4fdd\\u5b58\\u5931\\u8d25'); if(r&&!r.ok) console.warn(r.errors); return r; });
}
function commitReload(){ commit().then(function(){ reloadPreview(); }); }
function status(t){ $('#status').textContent=t; }

function rebuild(){
  status('\\u91cd\\u5efa\\u4e2d\\u2026');
  api('/api/rebuild','POST',{}).then(function(r){ status(r&&r.ok?('\\u5df2\\u91cd\\u5efa '+r.files.length+' \\u4e2a\\u6587\\u4ef6'):'\\u91cd\\u5efa\\u5931\\u8d25'); });
}
`;

export function editorAppHtml(title: string): string {
  const t = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t} · Slidesmith 编辑器</title>
<style>${CSS}</style>
</head>
<body>
<div class="ehead">
  <span class="title">✎ Slidesmith 编辑器</span>
  <span style="opacity:.6">${t}</span>
  <span class="grow"></span>
  <span id="status">就绪</span>
  <button id="openp">预览新窗口</button>
  <button id="rebuild" class="primary">重建产物</button>
</div>
<div class="emain">
  <aside class="left">
    <div class="lbar">
      <button id="add" title="在当前页后插入">＋</button>
      <button id="del" title="删除当前页">🗑</button>
      <button id="up" title="上移">↑</button>
      <button id="down" title="下移">↓</button>
    </div>
    <div id="slides"></div>
  </aside>
  <main class="center"><iframe id="preview" src="/preview"></iframe></main>
  <aside class="right">
    <h3>主题（配色）</h3>
    <div class="field"><select id="theme"></select></div>
    <h3>本页布局</h3>
    <div class="field"><select id="layout"></select></div>
    <div id="blksel">
      <h3>选中块</h3>
      <div class="field"><span class="tag" id="blktype">—</span></div>
      <div class="field"><label>入场动画</label><select id="anim"></select></div>
    </div>
    <div class="hint">
      <b>怎么改：</b><br>
      · 在中间预览里<b>直接点文字</b>就能改（标题/正文/要点/引用）。<br>
      · 右侧换<b>主题配色</b>、改<b>本页布局</b>；点中一个块可调它的<b>动画</b>。<br>
      · 左侧 ＋/🗑/↑/↓ <b>加/删/移动</b>幻灯片。<br>
      · 改动<b>自动保存</b>到 deck.json；点<b>重建产物</b>重新生成可投屏的 HTML。
    </div>
  </aside>
</div>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}
