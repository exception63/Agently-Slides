#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-anim-gallery.py · 生成「所见即所得」动画库画廊 → ../gallery/animations.html
单一来源：内联 _fx.css（效果） + _fx.js（SMFX 助手），画廊卡片在运行时由 REGISTRY 数据驱动渲染。
改了 _fx.css / _fx.js 或下面的卡片数据，重跑本脚本即可。
用法：python3 build-anim-gallery.py
"""
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(BASE)

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

fx_css = read(os.path.join(BASE, "_fx.css"))
fx_js = read(os.path.join(BASE, "_fx.js"))
fx_canvas = read(os.path.join(BASE, "_fx-canvas.js"))

TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Slidesmith 动画库 · 所见即所得</title>
<style>
:root{ --accent:#c0392b; --paper:#f4f2ec; --ink:#1c1b19; }
*{ box-sizing:border-box; }
body{ margin:0; font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif; color:var(--ink); background:#e9e6df; }
.wrap{ max-width:1180px; margin:0 auto; padding:28px 26px 80px; }
header.hero{ padding:18px 0 10px; }
.hero h1{ font-size:30px; margin:0 0 6px; font-weight:800; letter-spacing:-.5px; }
.hero p{ margin:0; color:#5b574e; font-size:15px; line-height:1.6; }
.toolbar{ position:sticky; top:0; z-index:30; background:#e9e6df; padding:12px 0; margin:10px 0 6px; border-bottom:1px solid #cfcabd; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.toolbar input{ flex:1; min-width:200px; height:38px; padding:0 14px; border:1px solid #cfcabd; border-radius:9px; font-size:14px; background:#fff; }
.jump{ display:flex; flex-wrap:wrap; gap:6px; }
.jump a{ font-size:12px; text-decoration:none; color:#3a362e; background:#fff; border:1px solid #d7d2c5; padding:5px 10px; border-radius:7px; }
.jump a:hover{ background:var(--accent); color:#fff; border-color:var(--accent); }
section.cat{ margin:30px 0 8px; }
.cat-h{ display:flex; align-items:center; gap:10px; margin:0 0 4px; }
.cat-rule{ width:5px; height:24px; border-radius:3px; }
.cat-h h2{ font-size:19px; margin:0; font-weight:800; }
.cat-h .badge-new{ font-size:11px; font-weight:700; color:#0f6e56; background:#d8f0e7; padding:2px 8px; border-radius:20px; }
.cat-h .badge-star{ font-size:11px; font-weight:700; color:#854f0b; background:#faeeda; padding:2px 8px; border-radius:20px; }
.cat-note{ margin:0 0 14px; color:#6b665c; font-size:13px; }
.grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(248px, 1fr)); gap:14px; }
.card{ background:#fff; border:1px solid #ddd8cc; border-radius:14px; padding:12px; display:flex; flex-direction:column; }
.card-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:9px; }
.code{ font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace; padding:2px 8px; border-radius:7px; }
.nm{ font-size:13px; color:#3a362e; font-weight:600; }
.stage{ height:118px; border-radius:10px; background:var(--paper); display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; }
.demo-chip{ display:inline-block; padding:9px 18px; border-radius:9px; background:#fff; border:1px solid #e0dccf; font-weight:700; font-size:19px; color:#1a1a1a; }
.demo-big{ font-size:40px; font-weight:800; }
.row{ display:flex; gap:6px; margin-top:9px; align-items:center; }
.btn{ font-size:12px; padding:5px 11px; border-radius:8px; border:1px solid #d7d2c5; background:#faf8f3; cursor:pointer; color:#2c2922; }
.btn:hover{ background:var(--accent); color:#fff; border-color:var(--accent); }
.btn:active{ transform:scale(.97); }
.attr{ margin-top:8px; font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace; color:#9a6a3a; word-break:break-all; }
.loop-tag{ font-size:11px; color:#8a857a; }
.fr-list{ display:flex; flex-direction:column; gap:7px; align-items:flex-start; padding:0 16px; width:100%; }
.fr-list .fragment{ background:#fff; border:1px solid #e0dccf; border-radius:7px; padding:6px 12px; font-size:14px; font-weight:600; }
.tr-view{ width:80%; height:88px; position:relative; border-radius:8px; overflow:hidden; background:#fff; border:1px solid #e0dccf; }
.tr-pane{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:22px; }
.mm-stage{ position:relative; width:100%; height:100%; }
.mm-el{ position:absolute; padding:8px 14px; border-radius:9px; background:var(--accent); color:#fff; font-weight:800; transition:all .7s cubic-bezier(.5,0,.2,1); }
.planned{ margin-top:10px; font-size:12px; color:#7a756a; background:#f3f1ea; border:1px dashed #cfcabd; border-radius:8px; padding:8px 11px; }
.planned b{ color:#5b574e; }
.kb{ width:100%; height:100%; background:linear-gradient(120deg,#c0392b,#e8a13a 60%,#2b6cb0); }
.spot-row{ display:flex; gap:10px; }
footer.foot{ margin-top:40px; color:#7a756a; font-size:12px; line-height:1.7; border-top:1px solid #cfcabd; padding-top:16px; }
.hidden{ display:none !important; }
.picker-banner{ background:#1c3d5a; color:#fff; padding:11px 16px; border-radius:11px; margin:0 0 6px; font-size:13.5px; line-height:1.5; }
.pick-btn{ font-size:12.5px; font-weight:700; padding:7px 12px; border-radius:8px; border:1px solid #1d9e75; background:#1d9e75; color:#fff; cursor:pointer; width:100%; margin-top:9px; }
.pick-btn:hover{ background:#0f6e56; } .pick-btn:active{ transform:scale(.98); }

/* ——— 动画库 _fx.css（内联，单一来源）——— */
__FX_CSS__
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>Slidesmith 动画库 · 所见即所得</h1>
    <p>像剪辑 App 一样翻着挑：每个效果都有<b>编号</b>、<b>实时预览</b>、和它对应的<b>属性写法</b>。<br>
       做 slides 时只要对 AI 说编号（如「入场用 A8、关键数字 F1 神奇移动、关键词 H1 自绘线」），AI 就照着做。集众家所长 · 来源见 <code>docs/ANIMATION-LIBRARY-PLAN.md</code>。</p>
  </header>
  <div class="toolbar">
    <input id="q" type="search" placeholder="搜索动画名 / 编号 / 属性，如「神奇」「flip」「A8」">
    <nav class="jump" id="jump"></nav>
  </div>
  <main id="cats"></main>
  <footer class="foot">
    所见即所得画廊 · 由 <code>assets/build-anim-gallery.py</code> 生成（内联 <code>_fx.css</code> + <code>_fx.js</code>，单文件离线可用）。<br>
    标 <span style="color:#0f6e56;font-weight:700">新</span> = 本次集众家所长新增；标 <span style="color:#854f0b;font-weight:700">★</span> = 旗舰。规划中的效果列在各类末尾。
  </footer>
</div>

<script>
__FX_JS__
</script>
<script>
__FX_CANVAS__
</script>
<script>
/* ════ 动画库注册表（同时是 references/animations.md 的机器版） ════ */
var REG = [
 {key:'A', title:'入场 Entrance', color:'#378ADD', note:'翻到这页时元素怎么出现（播一次）', items:[
   {code:'A1', name:'淡入', kind:'enter', attr:'data-anim="fade"'},
   {code:'A2', name:'上升淡入', kind:'enter', attr:'data-anim="rise"'},
   {code:'A3', name:'弹出', kind:'enter', attr:'data-anim="pop"'},
   {code:'A4a', name:'从左进', kind:'enter', attr:'data-anim="in-left"'},
   {code:'A4b', name:'从右进', kind:'enter', attr:'data-anim="in-right"'},
   {code:'A6', name:'逐条浮现', kind:'enter-list', attr:'data-anim="stagger-list"'},
   {code:'A7', name:'字距展开', kind:'enter', attr:'data-anim="tracking-in"', _new:1},
   {code:'A8', name:'聚焦显影', kind:'enter', attr:'data-anim="focus-in"', _new:1},
   {code:'A9', name:'动感模糊滑入', kind:'enter', attr:'data-anim="slide-blur"', _new:1},
   {code:'A10', name:'翻牌入场', kind:'enter', attr:'data-anim="flip-in"', _new:1},
   {code:'A11', name:'纵深拉入', kind:'enter', attr:'data-anim="back-in"', _new:1},
 ], planned:'A5 数字滚动（counter-up，需结构）· A12 逐字/逐词浮现（split-reveal，需 JS 拆字）— 排期中'},

 {key:'B', title:'分步揭示 Build / Fragments', color:'#1D9E75', note:'点一下出一条，控制讲解节奏', _new:1, items:[
   {code:'B1', name:'逐点点出', kind:'frag', variant:'', attr:'class="fragment"'},
   {code:'B2', name:'方向点出', kind:'frag', variant:'up', attr:'class="fragment up"'},
   {code:'B3', name:'只此刻显', kind:'frag', variant:'current-visible', attr:'class="fragment current-visible"'},
   {code:'B4', name:'点出后变暗', kind:'frag', variant:'semi-out', attr:'class="fragment semi-out"'},
   {code:'B5', name:'放大点出', kind:'frag', variant:'grow', attr:'class="fragment grow"'},
   {code:'B6', name:'划掉', kind:'frag', variant:'strike', attr:'class="fragment strike"'},
   {code:'B7', name:'高亮', kind:'frag', variant:'highlight', attr:'class="fragment highlight"'},
 ], planned:'定序用 data-fragment-index（多元素可同序号一起出现）'},

 {key:'C', title:'强调 Emphasis', color:'#D85A30', note:'一次性"看这里！"的拍子（元素已可见再做手势）', _new:1, items:[
   {code:'C1', name:'嗒哒 tada', kind:'emph', attr:'data-emph="tada"'},
   {code:'C2', name:'橡皮筋', kind:'emph', attr:'data-emph="rubber-band"'},
   {code:'C3', name:'果冻', kind:'emph', attr:'data-emph="jello"'},
   {code:'C4', name:'心跳', kind:'emph', attr:'data-emph="heartbeat"'},
   {code:'C5', name:'摇头', kind:'emph', attr:'data-emph="headshake"'},
   {code:'C6', name:'抖动', kind:'emph', attr:'data-emph="shake"'},
   {code:'C7', name:'抬字', kind:'emph', attr:'data-emph="text-pop"'},
 ]},

 {key:'D', title:'持续动效 Motion', color:'#BA7517', note:'一直循环的氛围动效（无需点按）', items:[
   {code:'D1', name:'呼吸发光', kind:'motion', attr:'data-motion="glow"'},
   {code:'D2', name:'缩放呼吸', kind:'motion', attr:'data-motion="breathe"'},
   {code:'D3', name:'漂浮', kind:'motion', attr:'data-motion="float"'},
   {code:'D4', name:'闪烁', kind:'motion', attr:'data-motion="pulse"'},
   {code:'D5', name:'霓虹微闪', kind:'motion', attr:'data-motion="neon"'},
   {code:'D6', name:'强调脉冲', kind:'motion', attr:'data-motion="stress"'},
   {code:'D7', name:'流光溢彩', kind:'motion-shimmer', attr:'data-motion="shimmer"'},
 ]},

 {key:'E', title:'跨页转场 Transition', color:'#7F77DD', note:'从这页切到下页的方式（deck 级 body[data-transition]，单页可覆盖）', _new:1, items:[
   {code:'E2', name:'淡入淡出', kind:'tr', tr:'fade', attr:'data-transition="fade"'},
   {code:'E5', name:'滑动', kind:'tr', tr:'slide', attr:'data-transition="slide"'},
   {code:'E4', name:'推移', kind:'tr', tr:'push', attr:'data-transition="push"'},
   {code:'E8', name:'缩放', kind:'tr', tr:'zoom', attr:'data-transition="zoom"'},
   {code:'E9', name:'翻转', kind:'tr', tr:'flip', attr:'data-transition="flip"'},
   {code:'E6', name:'揭幕', kind:'tr', tr:'wipe', attr:'data-transition="wipe"'},
   {code:'E7', name:'对开', kind:'tr', tr:'split', attr:'data-transition="split"'},
 ], planned:'E1 瞬切 none · E3 过色淡变 · E10 立方体 cube · E11 百叶窗/棋盘（进阶 CSS 拼块）— 排期中'},

 {key:'F', title:'神奇移动 Magic Move', color:'#D85A30', note:'同一元素在两页间平滑飞过去（Keynote/PPT 同款）· 浏览器原生 View Transitions + FLIP 兜底', _star:1, items:[
   {code:'F1', name:'飞移 + 变大', kind:'mm', mm:'move', attr:'data-morph="hero"（两页同名）'},
   {code:'F3', name:'文字/数字变形', kind:'mm', mm:'text', attr:'data-morph="stat"'},
   {code:'F4', name:'颜色渐变', kind:'mm', mm:'color', attr:'data-morph="tag"'},
 ]},

 {key:'G', title:'消失 Exit', color:'#888780', note:'离开这页的方式（播完再翻页）', items:[
   {code:'G1', name:'淡出', kind:'exit', attr:'data-anim-out="fade-out"'},
   {code:'G2', name:'下沉', kind:'exit', attr:'data-anim-out="sink"'},
   {code:'G3', name:'缩小消失', kind:'exit', attr:'data-anim-out="zoom-out"'},
   {code:'G4a', name:'左滑出', kind:'exit', attr:'data-anim-out="out-left"'},
   {code:'G4b', name:'右滑出', kind:'exit', attr:'data-anim-out="out-right"'},
   {code:'G6', name:'翻牌离场', kind:'exit', attr:'data-anim-out="flip-out"', _new:1},
   {code:'G7', name:'蒸发', kind:'exit', attr:'data-anim-out="puff-out"', _new:1},
   {code:'G8', name:'纵深退场', kind:'exit', attr:'data-anim-out="back-out"', _new:1},
   {code:'G9', name:'文字虚化', kind:'exit', attr:'data-anim-out="text-blur-out"', _new:1},
 ]},

 {key:'H', title:'点睛 Accent', color:'#0F6E56', note:'让 slide 高级的特殊触感', _new:1, items:[
   {code:'H1', name:'线条自绘', kind:'draw', attr:'class="smfx-draw"（内含 <svg> path）'},
   {code:'H5', name:'聚光灯压暗', kind:'spot', attr:'class="smfx-spot"，目标加 data-focus'},
   {code:'H6', name:'Ken Burns', kind:'kenburns', attr:'class="smfx-kenburns"（内含 img）'},
   {code:'H7', name:'擦幕揭图', kind:'wipe', attr:'data-anim="clip-wipe"'},
 ], planned:'H2 手绘下划线 · H3 渐进连线箭头 · H4 手绘批注(Rough Notation) · H8 打字机 · H9 文字解码 · H10 滚轮数字 · H11 结尾撒花(confetti) — 排期中（H4/H11 为零依赖小脚本）'},

 {key:'I', title:'背景氛围 Ambient', color:'#534AB7', note:'整页的高级底子（无需点按）', _new:1, items:[
   {code:'I1', name:'极光渐变', kind:'aurora', attr:'class="smfx-aurora"'},
   {code:'I2', name:'胶片颗粒', kind:'grain', attr:'class="smfx-grain"'},
 ], planned:'I3 渐变流动 · I4 锥形光晕 — 排期中'},

 {key:'J', title:'Canvas 特效', color:'#0070f3', note:'真·粒子/canvas 大招（移植自 html-ppt-skill）· 读主题色 · 翻到该页才跑、离开即停 · 给元素加 data-fx', _new:1, _star:1, items:[
   {code:'J1', name:'极光团', kind:'canvas', attr:'data-fx="gradient-blob"', use:'满屏背景'},
   {code:'J2', name:'星座连线', kind:'canvas', attr:'data-fx="constellation"', use:'满屏背景'},
   {code:'J3', name:'知识图谱', kind:'canvas', attr:'data-fx="knowledge-graph"', use:'数据面板'},
   {code:'J4', name:'神经网络', kind:'canvas', attr:'data-fx="neural-net"', use:'数据面板'},
   {code:'J5', name:'数字爆炸', kind:'canvas', attr:'data-fx="counter-explosion"', use:'KPI 揭晓'},
   {code:'J6', name:'粒子迸发', kind:'canvas', attr:'data-fx="particle-burst"', use:'一次性爆点'},
   {code:'J7', name:'冲击波', kind:'canvas', attr:'data-fx="shockwave"', use:'冲击/发布'},
   {code:'J8', name:'星空穿越', kind:'canvas', attr:'data-fx="starfield"', use:'封面/暗场'},
   {code:'J9', name:'星系漩涡', kind:'canvas', attr:'data-fx="galaxy-swirl"', use:'封面/暗场'},
   {code:'J10', name:'矩阵雨', kind:'canvas', attr:'data-fx="matrix-rain"', use:'黑客/科技'},
   {code:'J11', name:'数据流', kind:'canvas', attr:'data-fx="data-stream"', use:'数据/安全'},
   {code:'J12', name:'礼花炮', kind:'canvas', attr:'data-fx="confetti-cannon"', use:'结尾庆祝'},
   {code:'J13', name:'多行打字机', kind:'canvas', attr:'data-fx="typewriter-multi"', use:'终端/启动日志'},
 ], planned:'更多可移植：orbit-ring 轨道 · chain-react 链式脉冲 · magnetic-field 磁力流 · letter-explode 标题字爆 — 排期中'},
];

/* ════ 选择模式（picker）：被 Studio 当子窗口打开时，每卡多一个「应用到选中」 ════ */
var PICKER = (location.hash.indexOf('picker') >= 0) || !!window.opener;
function cleanVal(attr){ var m = String(attr).match(/"([^"]+)"/); return m ? m[1] : ''; }
function pickSpec(it){
  var v = cleanVal(it.attr);
  switch(it.kind){
    case 'enter': case 'enter-list': return { mode:'attr', attr:'data-anim', val:v };
    case 'emph': return { mode:'attr', attr:'data-emph', val:v };
    case 'motion': return { mode:'attr', attr:'data-motion', val:v };
    case 'motion-shimmer': return { mode:'attr', attr:'data-motion', val:'shimmer' };
    case 'exit': return { mode:'attr', attr:'data-anim-out', val:v };
    case 'frag': return { mode:'class', add:('fragment'+(it.variant?(' '+it.variant):'')).split(' ').filter(Boolean), scope:'el' };
    case 'tr': return { mode:'attr', attr:'data-transition', val:v, scope:'slide' };
    case 'mm': return { mode:'morph' };
    case 'draw': return { mode:'class', add:['smfx-draw'], scope:'el' };
    case 'spot': return { mode:'class', add:['smfx-spot'], scope:'el' };
    case 'kenburns': return { mode:'class', add:['smfx-kenburns'], scope:'el' };
    case 'wipe': return { mode:'attr', attr:'data-anim', val:'clip-wipe' };
    case 'aurora': return { mode:'class', add:['smfx-aurora'], scope:'slide' };
    case 'grain': return { mode:'class', add:['smfx-grain'], scope:'slide' };
    case 'canvas': return { mode:'attr', attr:'data-fx', val:v, scope:'slide' };
  }
  return { mode:'attr', attr:'data-anim', val:v };
}

/* ════ 渲染 ════ */
var canvasStages = [];   // J 类 canvas 卡的台子，用 IntersectionObserver 只跑可见的（省电）
function el(tag, cls, html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
function tint(hex, a){ return hex + a; }

function replay(stage){ stage.classList.remove('smfx-go'); void stage.offsetWidth; stage.classList.add('smfx-arm','smfx-go'); }

function buildCard(it, color){
  var card = el('div','card');
  card.dataset.search = (it.code+' '+it.name+' '+it.attr).toLowerCase();
  var head = el('div','card-head');
  var code = el('span','code', it.code); code.style.background = tint(color,'22'); code.style.color = color;
  head.appendChild(code); head.appendChild(el('span','nm', it.name + (it._new?' <span class="badge-new">新</span>':'')));
  card.appendChild(head);

  var stage = el('div','stage');
  card.appendChild(stage);
  var row = el('div','row');
  card.appendChild(row);

  var k = it.kind;
  if(k==='enter'){
    stage.classList.add('smfx-arm');
    stage.appendChild(el('span','demo-chip', '标题')).setAttribute('data-anim', it.attr.match(/"(.+)"/)[1]);
    var b=el('button','btn','↻ 重播'); b.onclick=function(){ replay(stage); }; row.appendChild(b);
    setTimeout(function(){ stage.classList.add('smfx-go'); }, 120);
  } else if(k==='enter-list'){
    stage.classList.add('smfx-arm');
    var ul=el('ul','demo-chip'); ul.style.cssText='list-style:none;margin:0;padding:6px 14px;text-align:left;font-size:14px;';
    ul.setAttribute('data-anim','stagger-list'); ul.innerHTML='<li>第一条</li><li>第二条</li><li>第三条</li>';
    stage.appendChild(ul);
    var b=el('button','btn','↻ 重播'); b.onclick=function(){ replay(stage); }; row.appendChild(b);
    setTimeout(function(){ stage.classList.add('smfx-go'); }, 120);
  } else if(k==='emph'){
    var chip=el('span','demo-chip','关键词'); chip.setAttribute('data-emph', it.attr.match(/"(.+)"/)[1]); stage.appendChild(chip);
    var b=el('button','btn','↻ 重播'); b.onclick=function(){ stage.classList.remove('smfx-go'); void stage.offsetWidth; stage.classList.add('smfx-go'); }; row.appendChild(b);
    setTimeout(function(){ stage.classList.add('smfx-go'); }, 200);
  } else if(k==='motion'){
    var chip=el('span','demo-chip','关键词'); chip.style.color=color; chip.setAttribute('data-motion', it.attr.match(/"(.+)"/)[1]); stage.appendChild(chip);
    row.appendChild(el('span','loop-tag','● 持续循环'));
  } else if(k==='motion-shimmer'){
    var chip=el('span','demo-chip demo-big','流光'); chip.style.setProperty('--accent', color); chip.setAttribute('data-motion','shimmer'); stage.appendChild(chip);
    row.appendChild(el('span','loop-tag','● 持续循环'));
  } else if(k==='exit'){
    var chip=el('span','demo-chip','标题'); chip.setAttribute('data-anim-out', it.attr.match(/"(.+)"/)[1]); stage.appendChild(chip);
    var b=el('button','btn','↻ 重播'); b.onclick=function(){ stage.classList.remove('smfx-exit'); void stage.offsetWidth; stage.classList.add('smfx-exit'); setTimeout(function(){ stage.classList.remove('smfx-exit'); },900); }; row.appendChild(b);
  } else if(k==='frag'){
    var list=el('div','fr-list');
    ['① 第一点','② 第二点','③ 第三点'].forEach(function(t){ var f=el('div','fragment'+(it.variant?(' '+it.variant):''), t); list.appendChild(f); });
    stage.appendChild(list); stage.__step=0;
    if(window.SMFX) window.SMFX.applyFragState(stage,0);
    var bn=el('button','btn','→ 下一步'); bn.onclick=function(){ stage.__step=(stage.__step||0)+1; if(stage.__step>3) stage.__step=0; window.SMFX.applyFragState(stage, stage.__step); };
    var br=el('button','btn','重置'); br.onclick=function(){ stage.__step=0; window.SMFX.applyFragState(stage,0); };
    row.appendChild(bn); row.appendChild(br);
  } else if(k==='tr'){
    var view=el('div','tr-view');
    var pa=el('div','tr-pane','第 1 页'); pa.style.background='#fff'; pa.style.color='#333';
    var pb=el('div','tr-pane','第 2 页'); pb.style.background=color; pb.style.color='#fff'; pb.style.opacity='0';
    view.appendChild(pa); view.appendChild(pb); stage.appendChild(view); stage.__on=false;
    var b=el('button','btn','⇄ 切换'); b.onclick=function(){
      stage.__on=!stage.__on;
      var enter = stage.__on?pb:pa, leave = stage.__on?pa:pb;
      [pa,pb].forEach(function(p){ p.className='tr-pane'; p.style.opacity='0'; });
      enter.style.opacity='1';
      enter.classList.add('smfx-enter','smfx-tr-'+it.tr); leave.classList.add('smfx-leave','smfx-tr-'+it.tr); leave.style.opacity='1';
      setTimeout(function(){ leave.style.opacity='0'; leave.className='tr-pane'; enter.className='tr-pane'; enter.style.opacity='1'; },520);
    };
    row.appendChild(b);
  } else if(k==='mm'){
    var ms=el('div','mm-stage'); stage.appendChild(ms); stage.__on=false;
    var e2=el('div','mm-el'); ms.appendChild(e2);
    function setState(on){
      if(it.mm==='move'){ e2.textContent='42%'; if(on){ e2.style.left='62%'; e2.style.top='54%'; e2.style.fontSize='34px'; e2.style.transform='translate(-50%,-50%)'; } else { e2.style.left='14px'; e2.style.top='12px'; e2.style.fontSize='18px'; e2.style.transform='none'; } }
      else if(it.mm==='text'){ e2.style.left='50%'; e2.style.top='50%'; e2.style.transform='translate(-50%,-50%)'; e2.style.fontSize='34px'; e2.textContent= on?'89%':'42%'; }
      else if(it.mm==='color'){ e2.style.left='50%'; e2.style.top='50%'; e2.style.transform='translate(-50%,-50%)'; e2.style.fontSize='22px'; e2.textContent='标签'; e2.style.background= on?'#1D9E75':'#D85A30'; }
    }
    setState(false);
    var b=el('button','btn','▶ 播放'); b.onclick=function(){
      stage.__on=!stage.__on;
      if(window.SMFX && window.SMFX.hasViewTransitions){
        e2.style.viewTransitionName='mm-demo-'+it.code;
        var vt=document.startViewTransition(function(){ setState(stage.__on); });
        if(vt&&vt.finished) vt.finished.finally(function(){ e2.style.viewTransitionName=''; });
      } else { setState(stage.__on); }
    };
    row.appendChild(b);
    row.appendChild(el('span','loop-tag', (window.SMFX&&window.SMFX.hasViewTransitions)?'原生 View Transitions':'CSS 补间兜底'));
  } else if(k==='draw'){
    stage.classList.add('smfx-arm');
    var svg='<svg class="smfx-draw" width="180" height="60" viewBox="0 0 180 60">'
      +'<path pathLength="1" d="M10 42 C 50 50, 130 50, 170 40" fill="none" stroke="'+color+'" stroke-width="4" stroke-linecap="round"/></svg>';
    var box=el('div','', '<div style="font-size:22px;font-weight:800;margin-bottom:-6px">关键词</div>'+svg); box.style.textAlign='center';
    stage.appendChild(box);
    var b=el('button','btn','↻ 重播'); b.onclick=function(){ replay(stage); }; row.appendChild(b);
    setTimeout(function(){ stage.classList.add('smfx-go'); },150);
  } else if(k==='spot'){
    var sp=el('div','smfx-spot spot-row');
    sp.innerHTML='<span class="demo-chip">其它</span><span class="demo-chip" data-focus style="background:'+color+';color:#fff;border-color:'+color+'">重点</span><span class="demo-chip">其它</span>';
    stage.appendChild(sp);
    var b=el('button','btn','◉ 聚焦'); b.onclick=function(){ sp.classList.toggle('smfx-go'); }; row.appendChild(b);
  } else if(k==='kenburns'){
    var kb=el('div','smfx-kenburns'); kb.style.cssText='width:100%;height:100%'; kb.innerHTML='<div class="kb" style="width:100%;height:100%"></div>';
    kb.querySelector('.kb').setAttribute('data-motion','ken-burns');
    stage.appendChild(kb); row.appendChild(el('span','loop-tag','● 持续缓移'));
  } else if(k==='wipe'){
    stage.classList.add('smfx-arm');
    var w=el('div','smfx-wipe'); w.style.cssText='width:78%;height:70px;border-radius:9px;background:'+color+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:20px'; w.textContent='揭晓';
    stage.appendChild(w);
    var b=el('button','btn','↻ 重播'); b.onclick=function(){ replay(stage); }; row.appendChild(b);
    setTimeout(function(){ stage.classList.add('smfx-go'); },150);
  } else if(k==='aurora'){
    stage.classList.add('smfx-aurora'); stage.style.background='#14121c';
    stage.appendChild(el('span','demo-chip','极光底')).style.cssText='background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.2)';
    row.appendChild(el('span','loop-tag','● 持续漂移'));
  } else if(k==='grain'){
    stage.classList.add('smfx-grain'); stage.style.background='#2a2722';
    stage.appendChild(el('span','demo-chip','颗粒质感')).style.cssText='background:transparent;color:#f0ece2;border-color:rgba(255,255,255,.2)';
    row.appendChild(el('span','loop-tag','静态覆层'));
  } else if(k==='canvas'){
    var fxName = it.attr.match(/"(.+)"/)[1];
    stage.style.cssText += ';height:150px;background:#0b0d16;';
    stage.style.setProperty('--accent','#7c5cff'); stage.style.setProperty('--accent-2','#22d3ee'); stage.style.setProperty('--ink','#e9e9f3');
    stage.__fxName = fxName;
    stage.__initFx = function(){ if(stage.__fx&&stage.__fx.stop){ try{stage.__fx.stop();}catch(e){} } if(window.HPX&&window.HPX[fxName]) stage.__fx = window.HPX[fxName](stage); };
    stage.__stopFx = function(){ if(stage.__fx&&stage.__fx.stop){ try{stage.__fx.stop();}catch(e){} stage.__fx=null; } };
    canvasStages.push(stage);
    var b=el('button','btn','↻ 重播'); b.onclick=function(){ stage.__initFx(); }; row.appendChild(b);
    if(it.use) row.appendChild(el('span','loop-tag','● '+it.use));
  }

  card.appendChild(el('div','attr', it.attr));
  if(PICKER){
    var pk = el('button','pick-btn','＋ 应用到选中');
    pk.onclick = function(){
      try{ (window.opener||window.parent).postMessage({ type:'smfx-pick', code:it.code, name:it.name, spec:pickSpec(it) }, '*'); }catch(e){}
      pk.textContent = '✓ 已应用'; setTimeout(function(){ pk.textContent = '＋ 应用到选中'; }, 900);
    };
    card.appendChild(pk);
  }
  return card;
}

if(PICKER){
  var bn = el('div','picker-banner','🎬 选择模式：在 Studio 里先<b>选中一个元素</b>，再点任意效果的「＋ 应用到选中」即可套用 —— 这个窗口可一直开着当调色板。');
  document.querySelector('.toolbar').insertAdjacentElement('beforebegin', bn);
}
var catsEl = document.getElementById('cats'), jumpEl = document.getElementById('jump');
REG.forEach(function(cat){
  var sec = el('section','cat'); sec.id='cat-'+cat.key;
  var h = el('div','cat-h');
  var rule=el('span','cat-rule'); rule.style.background=cat.color; h.appendChild(rule);
  var badge = cat._star?' <span class="badge-star">★ 旗舰</span>':(cat._new?' <span class="badge-new">新</span>':'');
  h.appendChild(el('h2', null, cat.key+' · '+cat.title + badge));
  sec.appendChild(h);
  sec.appendChild(el('p','cat-note', cat.note));
  var grid=el('div','grid');
  cat.items.forEach(function(it){ grid.appendChild(buildCard(it, cat.color)); });
  sec.appendChild(grid);
  if(cat.planned) sec.appendChild(el('div','planned','<b>更多（规划中）：</b>'+cat.planned));
  catsEl.appendChild(sec);
  var a=el('a',null,cat.key); a.href='#cat-'+cat.key; a.title=cat.title; jumpEl.appendChild(a);
});

/* J 类 canvas：只跑滚到可见的（IntersectionObserver），离开视口就停，省电 */
if(canvasStages.length){
  try{
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        var s = en.target;
        if(en.isIntersecting){ if(!s.__fx) s.__initFx(); }
        else { s.__stopFx && s.__stopFx(); }
      });
    }, { rootMargin:'120px' });
    canvasStages.forEach(function(s){ io.observe(s); });
  }catch(e){ canvasStages.forEach(function(s){ s.__initFx(); }); }
}

/* 搜索过滤 */
document.getElementById('q').addEventListener('input', function(e){
  var q=e.target.value.trim().toLowerCase();
  document.querySelectorAll('.card').forEach(function(c){ c.classList.toggle('hidden', q && c.dataset.search.indexOf(q)<0); });
  document.querySelectorAll('section.cat').forEach(function(s){
    var any=Array.prototype.some.call(s.querySelectorAll('.card'), function(c){ return !c.classList.contains('hidden'); });
    s.classList.toggle('hidden', q && !any);
  });
});
</script>
</body>
</html>
"""

out = os.path.join(SKILL, "gallery", "animations.html")
html = TEMPLATE.replace("__FX_CSS__", fx_css).replace("__FX_JS__", fx_js).replace("__FX_CANVAS__", fx_canvas)
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
n = html.count('{code:')
print("✓ animations.html 生成 → %s（%d 字节）" % (out, len(html)))
