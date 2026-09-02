// ---- preview bridge: injected into the deck iframe for inline editing ----
const BRIDGE = `
(function(){
  'use strict';
  if(window.parent===window) return;
  var P=window.parent;
  function post(m){ try{P.postMessage(m,'*');}catch(e){} }
  // ⌘K / Ctrl+K：焦点常常落在预览里，键盘事件不跨 frame，这里代收一下转给 Studio
  document.addEventListener('keydown',function(e){ if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'){ e.preventDefault(); e.stopPropagation(); post({type:'sm-cmdk'}); } },true);
  function toMd(el){
    var h=el.innerHTML
      .replace(/<strong[^>]*>/gi,'**').replace(/<\\/strong>/gi,'**')
      .replace(/<b[^>]*>/gi,'**').replace(/<\\/b>/gi,'**')
      .replace(/<em[^>]*>/gi,'*').replace(/<\\/em>/gi,'*')
      .replace(/<i[^>]*>/gi,'*').replace(/<\\/i>/gi,'*')
      .replace(/<br\\s*\\/?>/gi,'\\n').replace(/<[^>]+>/g,'');
    var t=document.createElement('textarea'); t.innerHTML=h;
    return t.value.replace(/\\u00a0/g,' ').replace(/\\n{2,}/g,'\\n').trim();
  }
  function editable(el,commit,sel){
    el.setAttribute('contenteditable','true'); el.classList.add('sm-editable');
    el.addEventListener('focus',sel);
    el.addEventListener('mousedown',function(e){e.stopPropagation();});
    el.addEventListener('keydown',function(e){e.stopPropagation();});
    el.addEventListener('blur',commit);
  }
  function wire(blk){
    var bid=blk.getAttribute('data-bid');
    var type=(blk.className.match(/blk\\s+(\\w+)/)||[])[1]||'';
    var sel=function(){post({type:'sm-select',bid:bid,btype:type});};
    blk.addEventListener('click',sel);
    if(blk.matches('h1,h2,h3')||blk.classList.contains('p')){
      editable(blk,function(){post({type:'sm-edit',bid:bid,field:'text',value:toMd(blk)});},sel);
    } else if(blk.classList.contains('list')){
      blk.querySelectorAll('li').forEach(function(li){
        editable(li,function(){
          var items=[].map.call(blk.querySelectorAll('li'),function(x){return toMd(x);}).filter(function(s){return s.length;});
          post({type:'sm-edit',bid:bid,field:'items',value:items});
        },sel);
      });
    } else if(blk.classList.contains('quote')){
      var p=blk.querySelector('p'); if(p) editable(p,function(){post({type:'sm-edit',bid:bid,field:'text',value:toMd(p)});},sel);
      var c=blk.querySelector('cite'); if(c) editable(c,function(){post({type:'sm-edit',bid:bid,field:'cite',value:toMd(c)});},sel);
    } else if(blk.classList.contains('fig')){
      var cap=blk.querySelector('figcaption'); if(cap) editable(cap,function(){post({type:'sm-edit',bid:bid,field:'alt',value:toMd(cap)});},sel);
    }
  }
  window.addEventListener('message',function(e){
    var d=e.data; if(!d||typeof d!=='object') return;
    if(d.type==='sm-goto' && typeof d.idx==='number'){ try{ if(window.__SM_GO__) window.__SM_GO__(d.idx); }catch(x){} }
  });
  function init(){
    document.querySelectorAll('.sm-deck [data-bid]').forEach(wire);
    var st=document.createElement('style');
    st.textContent='.sm-editable{outline:1px dashed rgba(120,120,120,.45);outline-offset:3px;cursor:text;border-radius:2px}'
      +'.sm-editable:hover{outline-color:rgba(181,64,42,.7)}'
      +'.sm-editable:focus{outline:2px solid #B5402A;background:rgba(181,64,42,.06)}'
      +'.sm-topbar,.sm-sidebar,.sm-nav{display:none!important}'
      +'.sm-stage{top:0!important;left:0!important;padding:14px!important}';
    document.head.appendChild(st);
    try{window.dispatchEvent(new Event('resize'));}catch(e){}
    post({type:'sm-ready'});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
`;

const EXAMPLE: Deck = {
  ir_version: '1.0',
  theme: 'keynote-dark',
  metadata: { title: '示例演示', author: 'Slidesmith' },
  defaults: { layout: 'bullets' },
  slides: [
    { id: 's1', layout: 'cover', notes: '开场用一句话点题。',
      slots: { main: [
        { id: 'b1', type: 'text', text: 'SLIDESMITH STUDIO', style: { color: 'accent', size: 'small', weight: 'bold' } },
        { id: 'b2', type: 'heading', text: '点文字就能改', level: 1, style: { size: 'display' } },
        { id: 'b3', type: 'text', text: '像 Keynote 一样编辑，导出可投屏 HTML', style: { color: 'muted' } },
      ] } },
    { id: 's2', layout: 'bullets', seg: '1', segName: '段1 · 怎么用',
      slots: { main: [
        { id: 'b4', type: 'heading', text: '三步走', level: 2 },
        { id: 'b5', type: 'list', items: ['导入 HTML deck', '点文字直接改、右侧换主题', '保存 / 导出 PDF 投屏'],
          build: { anim: 'stagger-list', mode: 'by-item', stagger: 90 } },
      ] } },
    { id: 's3', layout: 'quote', seg: '2', segName: '段2 · 收尾',
      slots: { main: [{ id: 'b6', type: 'quote', text: '让 AI 生成，让人类精修。', cite: 'Slidesmith' }] } },
  ],
};

const meta = {
  themes: listThemes(),
  layouts: Object.keys(LAYOUTS),
  layoutSlots: LAYOUTS as Record<string, readonly string[]>,
  anims: ANIM_NAMES as readonly string[],
  animOuts: ANIM_OUT_NAMES as readonly string[],
  motions: MOTION_NAMES as readonly string[],
  emphs: EMPH_NAMES as readonly string[],
  colors: COLOR_TOKENS as readonly string[],
  sizes: SIZE_TOKENS as readonly string[],
  aligns: ALIGN_TOKENS as readonly string[],
  weights: WEIGHT_TOKENS as readonly string[],
};

// friendly Chinese labels for the inspector
const MOTION_LABEL: Record<string, string> = {
  none: '无', glow: '呼吸灯（发光）', breathe: '呼吸（缩放）', float: '漂浮', pulse: '闪烁', neon: '霓虹微闪', stress: '强调脉冲', shimmer: '流光溢彩', 'ken-burns': '缓慢推拉',
};
const ANIM_LABEL: Record<string, string> = {
  none: '无', fade: '淡入', rise: '上升淡入', 'fade-up': '上移淡入', pop: '弹出', 'in-left': '从左进', 'in-right': '从右进', 'stagger-list': '逐条浮现', 'counter-up': '数字滚动', morph: '形变',
  'tracking-in': '字距展开', 'focus-in': '聚焦显影', 'slide-blur': '模糊滑入', 'flip-in': '翻牌入场', 'back-in': '纵深拉入', 'num-pop': '数字弹入', 'texts-reveal': '多行浮现', 'clip-wipe': '裁切揭示',
};
const EMPH_LABEL: Record<string, string> = {
  none: '无', tada: '嗒哒', 'rubber-band': '橡皮筋', jello: '果冻', heartbeat: '心跳', headshake: '摇头', shake: '抖动', 'text-pop': '抬字',
};
const ANIM_OUT_LABEL: Record<string, string> = {
  none: '无', 'fade-out': '淡出', sink: '下沉淡出', 'zoom-out': '缩小淡出', 'out-left': '向左退出', 'out-right': '向右退出',
};

