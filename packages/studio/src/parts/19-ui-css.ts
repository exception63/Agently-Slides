// ---------------- UI ----------------
const CSS = `
/* ===== Studio 界面设计令牌 =====================================================
   「--sm-*」前缀是有意的：deck 自己的令牌叫 --accent / --ink / --paper（换皮和
   调色板在用），两套名字撞上会非常难查。界面的一律 --sm- 开头。
   深色模式只重定义这些变量，不再逐条 body.dark 覆盖。
   ============================================================================ */
:root{
  --sm-bg:#f4f4f5;            /* 窗口底 */
  --sm-surface:#ffffff;       /* 面板 / 卡片 */
  --sm-surface-2:#f7f7f8;     /* 行 hover / 次级底 */
  --sm-surface-3:#f1f1f2;     /* 控件底 / 代码底 */
  --sm-surface-4:#e8e8ea;     /* 控件 hover */
  --sm-line:#ececee;          /* 细分隔线 */
  --sm-line-2:#e2e2e4;        /* 面板 / 控件边框 */
  --sm-line-warm:#d8d6cf;     /* 暖灰边（暂存盘那一族） */
  --sm-ink:#1c1c1f;           /* 正文 */
  --sm-ink-2:#3a3a3e;         /* 次要正文 */
  --sm-ink-3:#6a6a6e;         /* 标签 / 小标题 */
  --sm-ink-4:#9a9a9e;         /* 弱提示 */
  --sm-accent:#B5402A;        /* 强调（文字 / 描边） */
  --sm-accent-solid:#B5402A;  /* 强调实心底（永远配白字，深色下也不换琥珀） */
  --sm-accent-deep:#9c3623;   /* 强调 hover */
  --sm-accent-tint:#fbeae6;   /* 强调淡底 */
  --sm-accent-line:#e7b5aa;   /* 强调淡边 */
  --sm-ok:#1D9E75; --sm-ok-ink:#0f6e56; --sm-ok-tint:#e1f5ee; --sm-ok-line:#b9e3cc;
  --sm-info:#185FA5; --sm-info-2:#378ADD; --sm-info-ink:#0c447c; --sm-info-tint:#e6f1fb; --sm-info-line:#b5d4f4;
  --sm-warn:#D85A30; --sm-warn-ink:#993C1D; --sm-warn-tint:#FAEEDA; --sm-warn-line:#fac775;
  --sm-r-xs:5px; --sm-r-sm:7px; --sm-r-md:9px; --sm-r-lg:12px; --sm-r-pill:999px;
  --sm-warm-1:#faf8f4;        /* 暂存盘 / 图片库那一族暖底 */
  --sm-warm-2:#f1efe9;        /* 暖控件底（缩略图衬底） */
  --sm-warm-line:#e0ded7;
  --sm-warm-ink:#5f5e5a;
  --sm-mark:#ffe9a8;          /* 讲稿划选高亮 */
  --sm-mark-line:#e0c063;
  --sm-mark-ink:#8a6a2a;
  --sm-tip-bg:#2a2a2d;        /* 悬浮提示气泡 */
  --sm-tip-ink:#f1f1f3;
  --sm-shadow-1:0 4px 14px rgba(0,0,0,.10);
  --sm-shadow-2:0 20px 60px rgba(0,0,0,.35);
}
body.dark{
  --sm-bg:#151517;
  --sm-surface:#1b1b1d;
  --sm-surface-2:#242427;
  --sm-surface-3:#2c2c2f;
  --sm-surface-4:#3a3a3d;
  --sm-line:#2c2c2f;
  --sm-line-2:#3a3a3d;
  --sm-line-warm:#3a3a3d;
  --sm-ink:#f0f0f2;
  --sm-ink-2:#e6e6e8;
  --sm-ink-3:#cfd2d8;
  --sm-ink-4:#9a9a9e;
  --sm-accent:#f0b34a;        /* 朱红在深底上发闷，前景强调换琥珀——沿用原来的做法 */
  --sm-accent-deep:#e7714f;
  --sm-accent-tint:#3a2417;
  --sm-accent-line:#7a4a2c;
  --sm-ok:#3fd39b; --sm-ok-ink:#7fe0a0; --sm-ok-tint:#13321f; --sm-ok-line:#2c6b48;
  --sm-info:#5aa2e8; --sm-info-2:#5aa2e8; --sm-info-ink:#9ecbf5; --sm-info-tint:#152738; --sm-info-line:#2b4d70;
  --sm-warn:#e08b4a; --sm-warn-ink:#f0b34a; --sm-warn-tint:#3a2f15; --sm-warn-line:#7a5e22;
  --sm-warm-1:#1e2027; --sm-warm-2:#16181d; --sm-warm-line:#33363d; --sm-warm-ink:#a8a49c;
  --sm-mark:#4a3a12; --sm-mark-line:#8a6a2a; --sm-mark-ink:#f0d49a;
  --sm-tip-bg:#0f0f12; --sm-tip-ink:#f1f1f3;
  --sm-shadow-2:0 20px 60px rgba(0,0,0,.55);
}

*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;color:var(--sm-ink);display:flex;flex-direction:column;background:var(--sm-bg)}
.ehead{height:50px;flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 16px;background:var(--sm-surface);color:var(--sm-ink);border-bottom:1px solid var(--sm-line-2);font-size:14px}
.ehead .brand{font-weight:700}
/* app 壳里这两样是重复的：品牌名菜单栏有，文件名标题栏那颗药丸有 */
body.inapp .ehead .brand,body.inapp .ehead .dn{display:none}.ehead .dn{opacity:.6;font-size:13px}.ehead .grow{flex:1}
.ehead button{background:var(--sm-bg);color:var(--sm-ink);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:7px 13px;font-size:13px;cursor:pointer}
.ehead button:hover{background:var(--sm-surface-4)}.ehead button.primary{background:var(--sm-accent-solid);border-color:var(--sm-accent);color:#fff}.ehead button.primary:hover{background:var(--sm-accent-deep)}
.ehead .iconbtn{padding:6px 10px;font-size:15px;line-height:1}
.ehead .sep{width:1px;height:22px;background:var(--sm-line-2);margin:0 2px;flex:0 0 auto}
.ehead .grp{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.ehead .iconbtn.on{background:var(--sm-accent-tint);border-color:var(--sm-accent-line);color:var(--sm-accent)}
.expwrap{position:relative}
.expmenu{position:absolute;right:0;top:calc(100% + 9px);z-index:80;width:300px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-md);box-shadow:var(--sm-shadow-1);padding:11px 13px 4px;display:none;text-align:left}
.expmenu.show{display:block}
.expmenu .expmenu-t{font-size:11px;font-weight:600;color:var(--sm-ink-4);letter-spacing:.04em;margin-bottom:6px}
.expmenu .embedck{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--sm-ink-2);padding:9px 0;line-height:1.5}
.expmenu .embedck + .embedck{border-top:1px solid var(--sm-line)}
.expmenu .embedck input{margin:3px 0 0;flex:0 0 auto}
.expmenu .ck-sub{display:block;font-size:11px;color:var(--sm-ink-4);margin-top:3px;line-height:1.55}
.ehead .bridge-badge{font-size:12px;padding:3px 10px;border-radius:var(--sm-r-lg);line-height:1.4}
.ehead .bridge-badge.on{background:var(--sm-ok-tint);color:var(--sm-ok-ink);border:1px solid var(--sm-ok-line)}
.ehead .connect-btn{background:var(--sm-info);border-color:var(--sm-info);color:#fff;font-weight:600}
.ehead .connect-btn:hover{background:var(--sm-info-ink)}
.cmodal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100}
.cbox{background:var(--sm-surface);border-radius:var(--sm-r-lg);padding:20px 22px;width:460px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.cbox .ctitle{font-size:16px;font-weight:700;margin-bottom:14px;color:var(--sm-ink)}
.cbox .cstatus{font-size:14px;padding:10px 13px;border-radius:var(--sm-r-md);background:var(--sm-surface-3);color:var(--sm-ink-3)}
.cbox .cstatus.ok{background:var(--sm-ok-tint);color:var(--sm-ok-ink);font-weight:600}
.cbox .chint{font-size:13px;color:var(--sm-ink-3);margin:14px 0 6px;font-weight:600}
.cbox .csteps{margin:0;padding-left:22px;font-size:13px;line-height:1.95;color:var(--sm-ink-2)}
.cbox code{background:var(--sm-surface-3);border-radius:var(--sm-r-xs);padding:1px 6px;font-size:12px;font-family:ui-monospace,Menlo,monospace}
.cfaint{font-size:11.5px;color:var(--sm-ink-4);line-height:1.65;margin:2px 0 9px}
#cueBody .oprow{flex-wrap:wrap}
#cueBody .oprow button{flex:1 1 auto;font-size:12px;padding:6px 8px;white-space:nowrap}
.cbox .cfaint{font-size:12px;color:var(--sm-ink-4);margin-top:14px;line-height:1.7;border-top:1px solid var(--sm-line);padding-top:11px}
.cbox .cclose{margin-top:16px;width:100%}
.emain{flex:1;display:flex;min-height:0}
.left{width:240px;flex:0 0 auto;background:var(--sm-surface);border-right:1px solid var(--sm-line-2);display:flex;flex-direction:column}
body.navcollapsed .left{display:none}
.lbar{display:flex;gap:6px;padding:10px;border-bottom:1px solid var(--sm-line)}
.lbar button{flex:1;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:7px 0;cursor:pointer;font-size:15px}
.lbar button:hover{background:var(--sm-surface-4)}
#slides{flex:1;overflow:auto;padding:8px}
.srow{display:flex;gap:9px;align-items:center;padding:9px 10px;border-radius:var(--sm-r-md);cursor:pointer;border:1px solid transparent}
.srow:hover{background:var(--sm-surface-2)}.srow.active{background:var(--sm-accent-tint);border-color:var(--sm-accent-line)}
.srow .snum{font-variant-numeric:tabular-nums;color:var(--sm-accent);font-weight:700;min-width:1.6em}
.srow .sseg{font-size:10px;color:var(--sm-ink-4);background:var(--sm-surface-3);border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:0 5px;line-height:16px}
.srow .stt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;flex:1}
.srow .sbadge{flex:0 0 auto;font-size:11px;line-height:1;width:17px;height:17px;display:flex;align-items:center;justify-content:center;border-radius:50%}
.srow .sbadge.todo{color:#fff;background:var(--sm-warn);font-size:9px}
.srow .sbadge.sent{color:#fff;background:var(--sm-info-2);font-size:9px;animation:sm-badge-pulse 1.25s ease-out infinite}
.srow .sbadge.done{color:#fff;background:var(--sm-ok);font-weight:700}
@keyframes sm-badge-pulse{0%{box-shadow:0 0 0 0 rgba(55,138,221,.6)}70%,100%{box-shadow:0 0 0 6px rgba(55,138,221,0)}}
@keyframes sm-blink{0%,100%{opacity:1}50%{opacity:.2}}
.aisent-banner{display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px 11px;border-radius:var(--sm-r-md);font-size:12px;line-height:1.4;color:var(--sm-info-ink);background:var(--sm-info-tint);border:1px solid var(--sm-info-line)}
.aisent-banner .aisent-dot{color:var(--sm-info-2);font-size:11px;animation:sm-blink 1.05s ease-in-out infinite}
.confirm-tog{display:flex;align-items:center;gap:7px;margin:2px 0 10px;font-size:12px;color:var(--sm-warm-ink);cursor:pointer;user-select:none}
.confirm-tog input{cursor:pointer}
.proposal-bar{display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px 11px;border-radius:var(--sm-r-md);font-size:12px;line-height:1.4;color:var(--sm-warn-ink);background:var(--sm-warn-tint);border:1px solid var(--sm-warn-line)}
.proposal-bar .proposal-dot{color:var(--sm-warn-ink);font-size:11px;animation:sm-blink 1.05s ease-in-out infinite}
.proposal-bar .grow{flex:1}
#htmlpanel{flex:1;display:flex;flex-direction:column;min-height:0}
.hb-title{font-weight:700;color:var(--sm-ink);font-size:13px;margin-bottom:4px}
.right input[type=color]{padding:2px;height:34px;cursor:pointer}
button.mini{background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:6px 10px;font-size:12px;cursor:pointer;font-family:inherit;margin-top:2px}
button.mini:hover{background:var(--sm-surface-4)}
button.primary-mini{background:var(--sm-accent-solid);color:#fff;border:1px solid var(--sm-accent);border-radius:var(--sm-r-sm);padding:6px 10px;font-size:13px;cursor:pointer;font-family:inherit}
button.primary-mini:hover{background:var(--sm-accent-deep)}
.right h4.sub{font-size:12px;color:var(--sm-ink-3);margin:16px 0 8px;font-weight:600;border-top:1px solid var(--sm-line);padding-top:12px}
.aitarget{font-size:12px;color:var(--sm-ink-3);background:var(--sm-accent-tint);border:1px solid var(--sm-accent-line);border-radius:var(--sm-r-sm);padding:6px 9px;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.applied-chip{margin-left:auto;font-size:11px;color:var(--sm-ok-ink);background:var(--sm-ok-tint);border-radius:var(--sm-r-lg);padding:1px 8px}
.aitarget .mini.revert{margin:0;padding:3px 8px;font-size:11px}
.aitarget .applied-chip + .mini.revert{margin-left:6px}
.aiqueue{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;max-height:190px;overflow:auto}
.aiqueue .qempty{font-size:12px;color:var(--sm-ink-4);padding:6px 2px}
.qrow{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:var(--sm-r-sm);cursor:pointer;border:1px solid var(--sm-line);background:var(--sm-surface)}
.qrow:hover{background:var(--sm-surface-2)}.qrow.active{background:var(--sm-accent-tint);border-color:var(--sm-accent-line)}
.qrow .qnum{font-variant-numeric:tabular-nums;color:var(--sm-accent);font-weight:700;min-width:1.5em;font-size:12px}
.qrow .qtt{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.qrow .qst{flex:0 0 auto;font-size:10px;border-radius:var(--sm-r-lg);padding:1px 8px}
.qrow .qst.todo{color:var(--sm-warn-ink);background:var(--sm-warn-tint)}
.qrow .qst.sent{color:var(--sm-info-ink);background:var(--sm-info-tint);animation:sm-blink 1.4s ease-in-out infinite}
.qrow .qst.done{color:var(--sm-ok-ink);background:var(--sm-ok-tint)}
.tray-drop{margin:6px 0 8px;border:2px dashed var(--sm-line-warm);border-radius:var(--sm-r-lg);background:var(--sm-warm-1);text-align:center;padding:16px 10px;transition:border-color .12s,background .12s}
.tray-drop.over{border-color:var(--sm-accent);background:var(--sm-accent-tint)}
.tray-drop-in{display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--sm-warm-ink);font-size:12px}
.tray-drop-in b{font-size:13px;color:var(--sm-ink-2)}
.tray-empty{font-size:12px;color:var(--sm-ink-4);padding:2px 2px 6px}
.tray-target{font-size:11px;color:var(--sm-ink-3);margin:2px 0 6px}
.tray-target b{color:var(--sm-accent);font-weight:600}
.tray-grid{display:flex;flex-direction:column;gap:12px;margin-bottom:8px}
.tray-group{display:flex;flex-direction:column;gap:6px}
.tray-group-head{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--sm-ink-3);padding:2px 2px 4px;border-bottom:1px solid var(--sm-line)}
.tray-group-head.clickable{cursor:pointer}
.tray-group-head.clickable:hover .tgh-label{color:var(--sm-accent)}
.tgh-label{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.tgh-count{flex:0 0 auto;font-size:10px;color:var(--sm-ink-4);font-variant-numeric:tabular-nums}
.tray-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.tray-cell{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-surface);padding:5px;display:flex;flex-direction:column;gap:4px;min-width:0}
.tray-cell.placed{border-color:var(--sm-ok-line);background:var(--sm-ok-tint)}
.tray-thumb{position:relative;border-radius:var(--sm-r-sm);overflow:hidden;background:var(--sm-warm-2);height:66px;display:flex;align-items:center;justify-content:center}
.tray-thumb img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.tray-move{position:absolute;left:3px;top:3px;width:20px;height:20px;line-height:18px;border-radius:var(--sm-r-lg);border:none;background:rgba(20,20,22,.55);color:#fff;font-size:12px;cursor:pointer;padding:0;opacity:0;transition:opacity .12s}
.tray-cell:hover .tray-move{opacity:1}
.tray-move:hover{background:var(--sm-ok-ink)}
.tray-badge{position:absolute;left:4px;top:4px;font-size:10px;color:var(--sm-ok-ink);background:var(--sm-ok-tint);border-radius:var(--sm-r-lg);padding:1px 7px}
.tray-del{position:absolute;right:3px;top:3px;width:20px;height:20px;line-height:18px;border-radius:var(--sm-r-lg);border:none;background:rgba(20,20,22,.55);color:#fff;font-size:11px;cursor:pointer;padding:0}
.tray-del:hover{background:var(--sm-accent-solid)}
.tray-name{font-size:11px;color:var(--sm-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tray-meta{font-size:10px;color:var(--sm-ink-4);font-variant-numeric:tabular-nums}
.tray-note{font-size:11px;border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:4px 6px;font-family:inherit;color:var(--sm-ink-2);width:100%;box-sizing:border-box}
.tray-note:focus{outline:none;border-color:var(--sm-accent-line)}
.tray-page{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--sm-ink-4)}
.tray-page-sel{flex:1;min-width:0;font-size:10px;border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:3px 4px;font-family:inherit;color:var(--sm-ink-2);background:var(--sm-surface)}
.tray-page-sel:focus{outline:none;border-color:var(--sm-accent-line)}
.oneclick{margin-top:18px;padding-top:14px;border-top:1px solid var(--sm-line)}
button.primary-mini.big{width:100%;padding:11px 10px;font-size:14px;font-weight:600}
.genlist{display:flex;flex-direction:column;gap:6px;margin:6px 0 8px}
.genrow{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-surface);padding:7px 8px;display:flex;flex-direction:column;gap:5px}
.genrow-h{display:flex;align-items:center;gap:7px}
.genrow-h .qtt{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--sm-ink-2)}
.gen-hint{font-size:11px;border:1px solid var(--sm-line);border-radius:var(--sm-r-xs);padding:4px 6px;font-family:inherit;color:var(--sm-ink-2);width:100%;box-sizing:border-box}
.gen-hint:focus{outline:none;border-color:var(--sm-accent-line)}
.genlist .qempty{font-size:12px;color:var(--sm-ink-4);padding:4px 2px}
body.dark .genrow{background:#1b1e25;border-color:#2c323d}
body.dark .genrow-h .qtt{color:#cfd2d8}
body.dark .gen-hint{background:#12151b;border-color:#2c323d;color:#cfd2d8}
.libmodal{position:fixed;inset:0;z-index:60;background:rgba(20,20,24,.55);display:none;align-items:center;justify-content:center}
.notesbox{width:min(1180px,95vw);height:86vh}
.noteswrap{flex:1;display:flex;min-height:0}
.notesframe{flex:1;border:0;background:var(--sm-surface);min-width:0}
.notesempty{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 40px;font-size:13px;line-height:1.9;color:var(--sm-ink-4)}
.noteside{width:320px;flex:0 0 auto;border-left:1px solid var(--sm-line);display:flex;flex-direction:column;min-height:0}
.notepick{padding:12px 14px;border-bottom:1px solid var(--sm-line);background:var(--sm-warm-1)}
.notepickwhere{font-size:11px;color:var(--sm-ink-4);margin-bottom:5px}
.notepickquote{font-size:12px;line-height:1.6;color:var(--sm-ink-2);background:var(--sm-mark);border-radius:var(--sm-r-xs);padding:6px 8px;margin-bottom:8px}
.notelist{flex:1;overflow:auto;padding:10px 14px}
.notelist .qempty{font-size:12px;color:var(--sm-ink-4);line-height:1.7;padding:8px 2px}
.annrow{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);padding:9px 10px;margin-bottom:9px}
.annhead{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.annhead code{font-size:10.5px;color:var(--sm-ink-4)}
.annhead .todo-del{margin-left:auto}
.annquote{font-size:11.5px;line-height:1.6;color:var(--sm-ink-3);border-left:3px solid var(--sm-mark-line);padding-left:7px;margin-bottom:5px;cursor:pointer}
.annquote:hover{color:var(--sm-accent)}
.annnote{font-size:12.5px;line-height:1.6;color:var(--sm-ink)}
.todochip.note{background:var(--sm-mark);color:var(--sm-mark-ink)}
.notes-status{font-size:11.5px;color:var(--sm-ink-4);padding:2px 2px 6px}
.annbox{width:min(560px,92vw)}
.annpick{padding:12px 16px;border-bottom:1px solid var(--sm-line);background:var(--sm-warm-1)}
.annwhere{font-size:11px;color:var(--sm-ink-4);margin-bottom:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.annsnip{font-size:12.5px;line-height:1.6;color:var(--sm-ink-2);background:var(--sm-mark);border-radius:var(--sm-r-xs);padding:7px 9px;margin-bottom:9px}
.annpick #annText{width:100%;box-sizing:border-box;resize:vertical;font-family:inherit;font-size:12.5px;line-height:1.55;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);padding:7px 9px;background:var(--sm-surface);color:#2a2a2d;margin-bottom:8px}
.annpick #annText:focus{outline:none;border-color:var(--sm-accent)}
.annlist{max-height:40vh}
/* 弹窗有 560px 宽，.oprow 默认 flex:1 会把「加批注」拉成一条大横杠 —— 收回自然宽度、靠右 */
.annpick .oprow{justify-content:flex-end;margin-top:0}
.annpick .oprow button{flex:0 0 auto;min-width:92px;padding:7px 16px}
.annpick .oprow .hintk{flex:1;font-size:11px;color:var(--sm-ink-4);align-self:center}
.annrow.cur{border-color:var(--sm-accent-line);background:var(--sm-warm-1)}
body.dark .annpick{border-color:#2c323d;background:#1d2027}
body.dark .annpick #annText{background:#12151b;border-color:#2c323d;color:#e8e8ea}
body.dark .annrow.cur{background:#241f18;border-color:#5a4326}
.notesfoot{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--sm-line);background:var(--sm-surface-2);flex:0 0 auto}
.notesfoot-txt{font-size:12px;color:var(--sm-ink-3);line-height:1.5}
.notesfoot-txt b{color:var(--sm-ink)}
body.dark .notesfoot{border-color:#2c323d;background:#1b1e25}
body.dark .notesfoot-txt{color:#9a9a9e}
body.dark .notesfoot-txt b{color:#e8e8ea}
body.dark .noteside,body.dark .notepick{border-color:#2c323d}
body.dark .notepick{background:#1d2027}
body.dark .annrow{border-color:#2c323d}
body.dark .annnote{color:#e8e8ea}
.libbox{width:min(900px,92vw);max-height:86vh;display:flex;flex-direction:column;background:var(--sm-surface);border-radius:var(--sm-r-lg);box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.libhead{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--sm-line)}
.libhead .ctitle{font-size:15px;font-weight:600;color:var(--sm-ink-2)}
.lib-count{font-size:12px;color:var(--sm-ink-4);font-variant-numeric:tabular-nums}
.libhint{font-size:12px;color:var(--sm-ink-4);padding:8px 16px 0}
.libgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:14px 16px;overflow:auto}
.libgrid .qempty{grid-column:1/-1;font-size:13px;color:var(--sm-ink-4);padding:30px 0;text-align:center}
.lib-cell{border:1px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-surface-2);padding:8px;display:flex;flex-direction:column;gap:5px}
.lib-thumb{height:120px;border-radius:var(--sm-r-sm);overflow:hidden;background:var(--sm-warm-2);display:flex;align-items:center;justify-content:center}
.lib-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.lib-meta{font-size:11px;color:var(--sm-ink-2);line-height:1.35;max-height:2.7em;overflow:hidden}
.lib-sub{font-size:10px;color:var(--sm-ink-4)}
.lib-cell .oprow{margin-top:auto}
.searchq{flex:1;min-width:120px;height:32px;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);padding:0 11px;font-size:13px;font-family:inherit;background:var(--sm-surface);color:var(--sm-ink)}
.searchsrc{height:32px;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);font-size:12px;font-family:inherit;background:var(--sm-surface);color:var(--sm-ink-2)}
.searchcell{position:relative;cursor:pointer;transition:transform .1s,box-shadow .1s}
.searchcell:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.12)}
.searchcell.picked{outline:2px solid var(--sm-ok-ink);outline-offset:1px}
.searchcell .searchbadge{position:absolute;top:12px;right:12px;background:var(--sm-ok-ink);color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:var(--sm-r-lg);opacity:0;transition:opacity .12s}
.searchcell.picked .searchbadge{opacity:1}
.searchcell.picking{opacity:.6;pointer-events:none}
.searchlic{font-size:10px;color:var(--sm-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.dark .searchq,body.dark .searchsrc{background:#12151b;border-color:#333a45;color:#e6e6e8}
body.dark .libbox{background:#181a1f}
body.dark .libhead{border-color:#2c323d}
body.dark .libhead .ctitle{color:#e6e6e8}
body.dark .lib-cell{background:#1b1e25;border-color:#2c323d}
body.dark .lib-meta{color:#cfd2d8}
body.dark .lib-thumb{background:#12151b}
body.dark .tray-drop{background:#1c1f26;border-color:#333a46}
body.dark .tray-drop.over{border-color:#e7714f;background:#2a1f1b}
body.dark .tray-drop-in b{color:#e7e7ea}
body.dark .tray-cell{background:#1b1e25;border-color:#2c323d}
body.dark .tray-cell.placed{background:#16241f;border-color:#2f5a4a}
body.dark .tray-thumb{background:#12151b}
body.dark .tray-name{color:#cfd2d8}
body.dark .tray-note{background:#12151b;border-color:#2c323d;color:#cfd2d8}
body.dark .tray-page-sel{background:#12151b;border-color:#2c323d;color:#cfd2d8}
body.dark .oneclick{border-color:#2c323d}
.sechead{display:flex;align-items:center;gap:6px;margin:17px 0 7px;font-size:12px;font-weight:600;color:var(--sm-ink-3);letter-spacing:.02em}
.sechead.sectop{margin-top:4px}
.sechead .grow{flex:1}
.sechead .confirm-tog{margin:0;font-weight:400;flex:0 0 auto;white-space:nowrap}
.sechead .mini{font-weight:400}
.ihelp{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;padding:0;border-radius:50%;border:1px solid var(--sm-line-warm);background:transparent;color:var(--sm-ink-4);font-size:10px;font-weight:700;line-height:1;cursor:pointer;flex:0 0 auto}
.ihelp:hover{border-color:var(--sm-accent);color:var(--sm-accent);background:var(--sm-accent-tint)}
.sendnote{font-size:10px;color:var(--sm-warn-ink);background:var(--sm-warn-tint);border-radius:var(--sm-r-lg);padding:1px 8px;font-weight:600;letter-spacing:0}
.helppop{position:fixed;z-index:90;max-width:248px;background:var(--sm-tip-bg);color:var(--sm-tip-ink);font-size:12px;line-height:1.55;padding:9px 11px;border-radius:var(--sm-r-md);box-shadow:0 10px 30px rgba(0,0,0,.3);display:none;pointer-events:none}
.helppop.show{display:block}
body.dark .sechead{color:#8a8a8e}
body.dark .ihelp{border-color:#3a3a3d}
body.dark .ihelp:hover{background:#3a2417}
body.dark .helppop{background:#0f0f12;box-shadow:0 10px 30px rgba(0,0,0,.5)}
/* 网页内色板：色块按钮 + 弹层（HSV 方块 + 色相条 + hex + 预设） */
.swatch{display:flex;align-items:center;gap:7px;width:100%;padding:6px 8px;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);cursor:pointer;font-family:inherit;font-size:12px;color:var(--sm-ink-2);text-align:left}
.swatch:hover{border-color:var(--sm-accent-line);background:var(--sm-surface-4)}
.swatch.open{border-color:var(--sm-accent);box-shadow:0 0 0 2px var(--sm-accent-tint)}
.sw-chip{flex:0 0 auto;width:18px;height:18px;border-radius:var(--sm-r-xs);border:1px solid rgba(0,0,0,.18);background:#888;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.sw-hex{font-variant-numeric:tabular-nums;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.swpop{position:fixed;z-index:95;width:238px;padding:11px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);box-shadow:var(--sm-shadow-1),0 18px 46px rgba(0,0,0,.18);display:none}
.swpop.show{display:block}
.sw-area{position:relative;height:112px;border-radius:var(--sm-r-sm);cursor:crosshair;touch-action:none;background-color:#f00;
  background-image:linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,rgba(255,255,255,0))}
.sw-dot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45);pointer-events:none}
.sw-hue{-webkit-appearance:none;appearance:none;width:100%;height:11px;margin:11px 0 9px;border-radius:var(--sm-r-pill);cursor:pointer;border:0;
  background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}
.sw-hue::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.35);box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer}
.sw-row{display:flex;align-items:center;gap:7px}
.sw-prev{flex:0 0 auto;width:24px;height:24px;border-radius:var(--sm-r-xs);border:1px solid var(--sm-line-2)}
.sw-hexin{flex:1;min-width:0;padding:5px 7px;font-family:inherit;font-size:12px;font-variant-numeric:tabular-nums;text-transform:uppercase;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-xs);color:var(--sm-ink)}
.sw-sec{font-size:10px;letter-spacing:.12em;color:var(--sm-ink-4);margin:11px 0 5px;font-weight:700}
.sw-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}
.sw-cell{width:100%;aspect-ratio:1;padding:0;border:1px solid rgba(0,0,0,.14);border-radius:var(--sm-r-xs);cursor:pointer;transition:transform .1s}
.sw-cell:hover{transform:scale(1.15)}
.sw-cell.on{box-shadow:0 0 0 2px var(--sm-accent)}
body.dark .sw-cell,body.dark .sw-chip{border-color:rgba(255,255,255,.16)}
body.dark .swpop{box-shadow:0 18px 46px rgba(0,0,0,.6)}
.illbox{border:0.5px solid var(--sm-line);border-radius:var(--sm-r-md);background:var(--sm-warm-1);padding:9px 10px;margin:6px 0 8px}
.illrow{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.illrow:last-child{margin-bottom:0}
.illlabel{font-size:12px;color:var(--sm-ink-3);white-space:nowrap}
.illbox #illHint{width:100%;box-sizing:border-box;resize:vertical;min-height:34px;font-family:inherit;font-size:12px;line-height:1.5;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);padding:6px 8px;background:var(--sm-surface);color:#2a2a2d;margin-bottom:7px}
.illbox #illHint:focus{outline:none;border-color:var(--sm-accent)}
.illrow-act{margin-bottom:0}
.illnote{font-size:11px;color:var(--sm-ok-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.dark .illbox #illHint{background:#202022;color:#e8e8ea;border-color:#3a3a3d}
.seg{display:flex;border:1px solid var(--sm-line-warm);border-radius:var(--sm-r-sm);overflow:hidden}
.seg .segbtn{border:0;background:transparent;font-family:inherit;font-size:12px;padding:6px 10px;cursor:pointer;color:var(--sm-ink-3)}
.seg .segbtn.on{background:var(--sm-accent-solid);color:#fff}
#illHintTip{margin-top:2px}
.aitodo{display:flex;flex-direction:column;gap:5px;margin-bottom:8px;max-height:240px;overflow:auto}
.aitodo .qempty{font-size:12px;color:var(--sm-ink-4);padding:8px 2px;line-height:1.5}
.todorow{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:var(--sm-r-sm);border:1px solid var(--sm-line);background:var(--sm-surface)}
.todochip{flex:0 0 auto;font-size:10px;border-radius:var(--sm-r-lg);padding:2px 8px;font-weight:600}
.todochip.deck{color:var(--sm-info-ink);background:var(--sm-info-tint)}
.todochip.edit{color:var(--sm-warm-ink);background:var(--sm-surface-3)}
.todochip.vec{color:var(--sm-ok-ink);background:var(--sm-ok-tint)}
.todochip.chart{color:#2c6e7f;background:#e3f0f3}
.todochip.photo{color:var(--sm-warn-ink);background:var(--sm-warn-tint)}
.todochip.tray{color:var(--sm-warn-ink);background:var(--sm-accent-tint)}
.todochip.ann{color:#8a6a2a;background:#ffe9a8}
.prcfg{margin:6px 0 4px 24px;padding:9px 11px;border:1px solid var(--sm-line);border-radius:var(--sm-r-sm);background:var(--sm-surface-2);display:flex;flex-direction:column;gap:6px}
.prrow{display:flex;align-items:center;gap:8px}
.prrow label{flex:0 0 58px;font-size:12px;color:var(--sm-ink-3)}
.prrow select,.prrow input{flex:1;min-width:0;font-family:inherit;font-size:12px;padding:5px 7px;border:1px solid var(--sm-line-2);border-radius:var(--sm-r-xs);background:var(--sm-surface);color:var(--sm-ink)}
.prrow input:focus,.prrow select:focus{outline:none;border-color:var(--sm-accent)}
.prhint{font-size:11px;line-height:1.6;color:var(--sm-ink-4)}
.prhint b{color:var(--sm-ink-3)}
body.dark .prcfg{background:#1b1e25;border-color:#2c323d}
body.dark .prrow select,body.dark .prrow input{background:#12151b;border-color:#2c323d;color:#e8e8ea}
.todopg{flex:0 0 auto;font-size:10px;color:var(--sm-accent);font-weight:700;font-variant-numeric:tabular-nums}
.tododesc{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--sm-ink-2)}
.todo-del{flex:0 0 auto;width:22px;height:22px;line-height:1;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--sm-warm-line);border-radius:var(--sm-r-sm);background:var(--sm-surface-2);color:var(--sm-ink-3);font-size:12px;cursor:pointer;padding:0;transition:background .12s,color .12s,border-color .12s}
.todo-del:hover{background:var(--sm-accent-solid);border-color:var(--sm-accent);color:#fff}
body.dark .todo-del{background:#242832;border-color:#333a45;color:#9a9a9e}
body.dark .todo-del:hover{background:#B5402A;border-color:#B5402A;color:#fff}
body.dark .illbox{background:#1c1f26;border-color:#2c323d}
body.dark .illlabel{color:#9a9a9e}
body.dark .seg{border-color:#333a46}
body.dark .seg .segbtn{color:#9a9a9e}
body.dark .seg .segbtn.on{background:#B5402A;color:#fff}
body.dark .todorow{background:#1b1e25;border-color:#2c323d}
body.dark .tododesc{color:#cfd2d8}
.auditout{margin-top:8px;display:flex;flex-direction:column;gap:5px}
.audit-sum{font-size:12px;color:var(--sm-ink-2);font-weight:600}
.audit-row{font-size:12px;line-height:1.4;padding:6px 8px;border-radius:var(--sm-r-sm);cursor:pointer;border:1px solid transparent}
.audit-row b{color:var(--sm-ink)}
.audit-row.error{background:#fdecea;border-color:var(--sm-accent-line);color:var(--sm-accent-deep)}
.audit-row.warn{background:var(--sm-warn-tint);border-color:var(--sm-warn-line);color:var(--sm-mark-ink)}
.audit-row:hover{filter:brightness(.97)}
.center{flex:1;min-width:0;background:#202022;display:flex;align-items:center;justify-content:center;padding:14px;position:relative}
#preview{width:100%;height:100%;border:0;background:#000;border-radius:var(--sm-r-sm);box-shadow:0 10px 40px rgba(0,0,0,.4)}
.drop{position:absolute;inset:14px;border:2px dashed rgba(255,255,255,.25);border-radius:var(--sm-r-md);display:none;align-items:center;justify-content:center;color:var(--sm-ink-4);font-size:15px;pointer-events:none}
body.dragging .drop{display:flex;background:rgba(181,64,42,.12);border-color:var(--sm-accent);color:#fff}
.right{width:300px;flex:0 0 auto;background:var(--sm-surface);border-left:1px solid var(--sm-line-2);display:flex;flex-direction:column}
/* 折叠 —— **不是整块藏起来**：右栏缩成一条 34px 的窄条，上面还留着各 tab 的名字，
   点哪个就展开到哪个。整块 display:none 的话，想找回来只能去猜哪个按钮能唤回它。 */
.railtog{flex:0 0 22px;background:transparent;border:0;color:var(--sm-ink-4);font-size:15px;cursor:pointer;font-family:inherit;padding:0}
.railtog:hover{color:var(--sm-accent)}
.railstrip{display:none;flex-direction:column;align-items:center;gap:6px;padding:10px 0;height:100%;overflow:hidden}
.railstrip #railStripTabs{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:0;overflow:auto}
.railstrip .railtog{flex:0 0 auto;font-size:16px;padding:2px 0}
.railstrip button.striptab{display:flex;align-items:center;justify-content:center;width:26px;height:26px;flex:0 0 auto;
  background:transparent;border:0;padding:0;color:var(--sm-ink-3);cursor:pointer;border-radius:var(--sm-r-sm);font-family:inherit}
.railstrip button.striptab svg{width:17px;height:17px;display:block}
.railstrip button.striptab .stlabel{font-size:12.5px;font-weight:600}
.railstrip button.striptab:hover{background:var(--sm-surface-2);color:var(--sm-ink)}
.railstrip button.striptab.active{color:var(--sm-accent);background:var(--sm-accent-tint)}
body.panelcollapsed .right{width:34px}
body.panelcollapsed .right>div{display:none!important}
body.panelcollapsed .right>.railstrip{display:flex!important}
body.dark .railstrip button.striptab{color:#9a9a9e}
body.dark .railstrip button.striptab:hover{background:#242427;color:#f0f0f2}
body.dark .railstrip button.striptab.active{color:#f0b34a;background:#3a2417}
.tabs{display:flex;border-bottom:1px solid var(--sm-line-2);flex:0 0 auto}
.tab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 0;font-size:13px;color:var(--sm-ink-3);cursor:pointer;font-family:inherit}
.tab:hover{background:var(--sm-surface-2)}.tab.active{color:var(--sm-accent);border-bottom-color:var(--sm-accent);font-weight:600}
.pane{flex:1;overflow:auto;padding:16px}
.embedck{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--sm-ink-3);cursor:pointer;user-select:none}
.embedck input{margin:0;cursor:pointer}
/* HTML-mode Keynote-style top tabs */
.htabs,.ltabs{display:flex;border-bottom:1px solid var(--sm-line-2);flex:0 0 auto}
.htab,.ltab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 0;font-size:13px;color:var(--sm-ink-3);cursor:pointer;font-family:inherit}
.htab:hover,.ltab:hover{background:var(--sm-surface-2)}.htab.active,.ltab.active{color:var(--sm-accent);border-bottom-color:var(--sm-accent);font-weight:600}
/* 待办数角标：待办数原先只在 AI tab *里面* 看得到，人停在别的 tab 就完全不知道有东西挂着 */
.tabnum{display:inline-block;margin-left:5px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--sm-accent-solid);color:#fff;font:700 10px/16px system-ui,-apple-system,sans-serif;text-align:center;vertical-align:1px;font-variant-numeric:tabular-nums}
.tabnum[hidden]{display:none}
.striptab{position:relative}
.stripnum{position:absolute;top:3px;right:3px;min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:var(--sm-accent-solid);color:#fff;font:700 9px/14px system-ui,-apple-system,sans-serif;text-align:center;font-variant-numeric:tabular-nums}
body.dark .tabnum,body.dark .stripnum{background:#B5402A}
.lpane{flex:1;min-height:0;display:flex;flex-direction:column}.lpane[hidden]{display:none}
.lscroll{flex:1;overflow:auto;padding:10px}
.lpane-soon{color:var(--sm-ink-4);font-size:13px;line-height:1.7;padding:18px 14px;text-align:center}
.skingal{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.skincard{display:flex;flex-direction:column;gap:6px;padding:7px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);cursor:pointer;text-align:left;font-family:inherit}
.skincard:hover{border-color:var(--sm-accent-line);background:var(--sm-accent-tint)}.skincard.on{border-color:var(--sm-accent);box-shadow:0 0 0 1px #B5402A inset}
.skinprev{position:relative;height:52px;border-radius:var(--sm-r-sm);overflow:hidden;display:block;border:1px solid rgba(0,0,0,.06)}
.skinline{position:absolute;left:10px;height:5px;border-radius:var(--sm-r-xs);top:13px;width:62%}
.skinline.short{top:25px;width:40%;opacity:.55}
.skinbar{position:absolute;left:10px;bottom:9px;height:6px;width:34%;border-radius:var(--sm-r-xs)}
.skinmeta{display:flex;align-items:center;justify-content:space-between;gap:6px}
.skinname{font-size:12px;color:var(--sm-ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.skintag{font-size:10px;color:var(--sm-ink-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);padding:0 6px;flex:0 0 auto}
.insgrid{display:flex;flex-direction:column;gap:9px}
.inscard{display:flex;flex-direction:column;gap:3px;padding:12px 13px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);cursor:pointer;text-align:left;font-family:inherit}
.inscard:hover{border-color:var(--sm-accent-line);background:var(--sm-accent-tint)}
/* ── AI 面板的折叠区 ── */
.aimore-head{margin-top:22px;color:var(--sm-ink-4);font-weight:500}
details.aimore{border-top:1px solid var(--sm-line-2);margin:0 -2px;padding:0 2px}
details.aimore>summary{list-style:none;cursor:pointer;margin:6px 0;padding:7px 0;user-select:none}
details.aimore>summary::-webkit-details-marker{display:none}
details.aimore>summary .aimore-caret{margin-left:auto;color:var(--sm-ink-4);transition:transform .15s;font-size:15px}
details.aimore[open]>summary .aimore-caret{transform:rotate(90deg)}
details.aimore>summary:hover{color:var(--sm-ink)}
/* ── AI 改了什么 ── */
.aichangelog .chg{padding:7px 0;border-top:1px dashed var(--sm-line-2);font-size:12px}
.aichangelog .chg-t{color:var(--sm-ink-4);font-variant-numeric:tabular-nums;margin-right:6px}
.aichangelog .chg-p{color:var(--sm-ink-2);font-weight:600}
.aichangelog .chg-s{margin-top:2px;color:var(--sm-ink-2);line-height:1.5}
.aichangelog .chg-none{color:var(--sm-ink-4);font-style:italic}
/* ── 设计 tab：当前皮肤（只读） ── */
.skinnow{display:flex;align-items:center;gap:8px;font-size:13px}.skinnow span{flex:1;color:var(--sm-ink-2)}
/* ── ⌘K ── */
.cmdk-box{max-width:620px;padding:10px}
.cmdk-box .searchq{width:100%;box-sizing:border-box;font-size:15px;padding:10px 12px}
.cmdk-list{max-height:52vh;overflow:auto;margin:8px 0 4px}
.cmdk-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--sm-r-md);cursor:pointer;font-size:13px}
.cmdk-item.on,.cmdk-item:hover{background:var(--sm-accent-tint)}
.cmdk-g{flex:none;font-size:11px;color:var(--sm-ink-4);width:34px}
.cmdk-l{flex:1;color:var(--sm-ink)}.cmdk-h{color:var(--sm-ink-4);font-size:11px}
.cmdk-empty{padding:16px;color:var(--sm-ink-4);text-align:center}
/* ── 现场互动卡 ── */
.inscard-live b::before{content:'●';color:var(--sm-ok);margin-right:6px;font-size:10px;vertical-align:middle}
.livecard{margin:10px 0 4px;padding:12px 13px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-lg);font-size:12px}
.livehead{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px}
.livehint{color:var(--sm-ink-3);line-height:1.55;margin-bottom:10px}.livehint.warn{color:var(--sm-warn-ink)}
.liveroom code{background:var(--sm-surface-3);padding:1px 6px;border-radius:var(--sm-r-xs);font-size:12px}
.livestat{margin:8px 0;line-height:1.6;color:var(--sm-ink-2)}.livemeta{color:var(--sm-ink-4);font-size:11px}
.livec{color:var(--sm-warn-ink)}.liveo{color:var(--sm-ok-ink)}
.livedot{width:8px;height:8px;border-radius:50%;background:var(--sm-ink-4);display:inline-block}.livedot.on{background:var(--sm-ok)}.livedot.closed{background:var(--sm-warn)}
.liveurls{display:flex;flex-direction:column;gap:4px;margin:8px 0}.liveurls div{display:flex;gap:8px;align-items:baseline}
.liveurls span{flex:none;width:56px;color:var(--sm-ink-4)}.liveurls a{color:var(--sm-info-ink);word-break:break-all;text-decoration:none}.liveurls a:hover{text-decoration:underline}
body.dark .livecard{background:#1b1e25;border-color:#2c323d}
.inscard b{font-size:14px;color:var(--sm-ink);font-weight:600}.inscard span{font-size:12px;color:var(--sm-ink-3);line-height:1.5}
.hpane{flex:1;overflow:auto;padding:16px}
#htmlpanel input[type=range]{width:100%;margin:6px 0 2px;accent-color:var(--sm-accent);cursor:pointer}
body.dark #htmlpanel input[type=range]{accent-color:#f0b34a}
.tweakout{font-weight:700;color:var(--sm-accent);font-variant-numeric:tabular-nums;margin-left:4px}
body.dark .tweakout{color:#f0b34a}
.dghint{font-size:11px;color:var(--sm-ink-3);line-height:1.55;margin-top:10px}
.gallery-btn{width:100%;margin:6px 0 10px;padding:11px;border:0;border-radius:var(--sm-r-lg);background:var(--sm-accent-solid);color:#fff;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}
.gallery-btn:hover{background:var(--sm-accent-deep)}.gallery-btn:active{transform:scale(.99)}
body.dark .gallery-btn{background:#f0b34a;color:#1c1c1f}
.animchips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.achip{display:inline-flex;align-items:center;gap:5px;background:var(--sm-warm-2);border:1px solid var(--sm-warm-line);border-radius:var(--sm-r-lg);padding:3px 6px 3px 10px;font-size:12px;color:var(--sm-ink-2)}
.achip button{border:0;background:var(--sm-warm-line);color:var(--sm-warm-ink);border-radius:50%;width:15px;height:15px;line-height:1;font-size:10px;cursor:pointer;padding:0}
.achip button:hover{background:var(--sm-accent-solid);color:#fff}
.achint{font-size:12px;color:var(--sm-warm-ink)}
body.dark .achip{background:#26262a;border-color:#34343a;color:#cfcfd4}body.dark .achip button{background:#3a3a40;color:#bbb}
/* animation sub-tabs (进入 / 动作 / 消失) */
.subtabs{display:flex;gap:5px;margin:6px 0 12px}
.stab{flex:1;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:6px 0;font-size:12px;color:var(--sm-ink-3);cursor:pointer;font-family:inherit}
.stab:hover{background:var(--sm-surface-4)}.stab.active{background:var(--sm-accent-tint);border-color:var(--sm-accent-line);color:var(--sm-accent);font-weight:600}
.spane{margin-bottom:4px}
/* B/I/U + alignment toggle bar */
.btnbar{display:flex;gap:5px;align-items:center}
.tgl{min-width:34px;height:34px;background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);font-size:14px;color:var(--sm-ink-2);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;padding:0 8px}
.tgl:hover{background:var(--sm-surface-4)}
.tgl.on{background:var(--sm-accent-solid);border-color:var(--sm-accent);color:#fff}
.bbsep{width:1px;height:22px;background:var(--sm-line-2);margin:0 3px}
.right h3{display:flex;align-items:center;gap:6px;font-size:11px;letter-spacing:.14em;color:var(--sm-ink-4);margin:18px 0 8px;font-weight:700}.pane h3:first-child{margin-top:0}
.right select,.right textarea,.right input{width:100%;padding:8px 10px;border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);font-size:14px;background:var(--sm-surface);font-family:inherit}
.right textarea{resize:vertical;line-height:1.5}
.field{margin-bottom:10px}.field label{display:block;font-size:12px;color:var(--sm-ink-3);margin-bottom:4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tag{display:inline-block;background:var(--sm-accent-tint);border:1px solid var(--sm-accent-line);border-radius:var(--sm-r-xs);padding:2px 8px;font-size:12px;color:var(--sm-accent);font-weight:600}
.nosel{font-size:12px;color:var(--sm-ink-4);line-height:1.6;padding:10px 0}
.addrow{display:flex;flex-wrap:wrap;gap:6px}
.addrow button,.oprow button{background:var(--sm-surface-3);border:1px solid var(--sm-line-2);border-radius:var(--sm-r-sm);padding:6px 10px;font-size:13px;cursor:pointer;font-family:inherit}
.addrow button:hover,.oprow button:hover{background:var(--sm-surface-4)}
.oprow{display:flex;gap:6px;margin-top:6px}.oprow button{flex:1}
.oprow button.danger{color:var(--sm-accent)}.oprow button:disabled{opacity:.4;cursor:not-allowed}
.nbrow{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.nbrow button{background:transparent;border:1px solid var(--sm-line-2);border-radius:var(--sm-r-xs);padding:5px 8px;cursor:pointer;color:var(--sm-ink-4)}
.nbtag{flex:0 0 auto;font-size:11px;padding:3px 7px;border-radius:var(--sm-r-xs);color:#fff;font-weight:700}
.nb-cue{background:#6E6A5E}.nb-golden{background:#A07A3A}.nb-data{background:#1B2B4F}
.hint{font-size:12px;color:var(--sm-ink-4);line-height:1.7;margin-top:18px;border-top:1px solid var(--sm-line);padding-top:12px}.hint b{color:var(--sm-ink-3)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--sm-surface);color:#9bd29b;padding:10px 18px;border-radius:var(--sm-r-sm);font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:50}
.toast.show{opacity:1}.toast.bad{color:#ff8a7a}
.ehead .dirtydot{font-size:12px;color:var(--sm-mark-ink);padding:2px 9px;border-radius:var(--sm-r-lg);background:var(--sm-warn-tint);border:1px solid var(--sm-warn-line);line-height:1.4}
body.dark .ehead .dirtydot{color:#f0b34a;background:#3a2f15;border-color:#7a5e22}
.ehead button:disabled{opacity:.35;cursor:not-allowed}
/* 草稿恢复条挪到右下角。原来横在顶部正中，正好盖住 deck 自己的标题栏、页码和「全屏播放」。 */
.restorebar{position:fixed;right:20px;bottom:20px;z-index:60;width:296px;display:flex;flex-direction:column;gap:11px;background:var(--sm-surface);border:1px solid var(--sm-line-2);border-left:4px solid var(--sm-accent);border-radius:var(--sm-r-md);padding:13px 15px;box-shadow:var(--sm-shadow-1);font-size:13px;line-height:1.6;color:var(--sm-ink-2)}
.restorebar b{color:var(--sm-accent)}
.restorebar .rb-acts{display:flex;gap:8px}
.restorebar button{flex:1;border:1px solid var(--sm-line-2);background:var(--sm-surface-3);border-radius:var(--sm-r-sm);padding:7px 12px;font-size:13px;cursor:pointer;font-family:inherit;color:var(--sm-ink-2)}
.restorebar button:hover{background:var(--sm-surface-4)}
.restorebar button.go{background:var(--sm-accent-solid);border-color:var(--sm-accent-solid);color:#fff}
.restorebar button.go:hover{background:var(--sm-accent-deep)}
.busy{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:70;display:none;align-items:center;gap:9px;background:var(--sm-surface);color:var(--sm-ink-2);border-radius:var(--sm-r-md);padding:9px 16px;font-size:13px;box-shadow:0 10px 34px rgba(0,0,0,.3)}
.busy.show{display:flex}
.busy .spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.25);border-top-color:#f0b34a;border-radius:50%;animation:sm-spin .7s linear infinite}
@keyframes sm-spin{to{transform:rotate(360deg)}}
/* ===== dark Studio chrome (toggle 🌙, persisted) ===== */
body.dark{background:#151517;color:#e6e6e8}
body.dark .ehead{background:#1b1b1d;color:#eee;border-bottom-color:#2c2c2f}
body.dark .ehead button{background:#2c2c2f;color:#eee;border-color:#3a3a3d}
body.dark .ehead button:hover{background:#3a3a3d}
body.dark .ehead .sep{background:#3a3a3d}
body.dark .ehead .bridge-badge.on{background:#13321f;color:#7fe0a0;border-color:#2c6b48}
body.dark .left,body.dark .right{background:#1b1b1d;border-color:#2c2c2f}
body.dark .lbar{border-color:#2c2c2f}
body.dark .lbar button{background:#2c2c2f;border-color:#3a3a3d;color:#ddd}
body.dark .lbar button:hover{background:#3a3a3d}
body.dark .srow:hover{background:#242427}
body.dark .srow.active{background:#3a2417;border-color:#7a4a2c}
body.dark .srow .stt{color:#dcdce0}
body.dark .srow .sseg{background:#2c2c2f;border-color:#3a3a3d;color:#aaa}
body.dark .htabs,body.dark .tabs,body.dark .ltabs{border-color:#2c2c2f}
body.dark .htab,body.dark .tab,body.dark .ltab{color:#9a9a9e}
body.dark .htab:hover,body.dark .tab:hover,body.dark .ltab:hover{background:#242427}
body.dark .htab.active,body.dark .tab.active,body.dark .ltab.active{color:#f0b34a;border-bottom-color:#f0b34a}
body.dark .skincard,body.dark .inscard{background:#1b1e25;border-color:#2c323d}
body.dark .skincard:hover,body.dark .inscard:hover{background:#242a36;border-color:#4a3a33}
body.dark .skincard.on{border-color:#f0b34a;box-shadow:0 0 0 1px #f0b34a inset}
body.dark .skinname,body.dark .inscard b{color:#e6e6e8}
body.dark .skintag{color:#9a9a9e;border-color:#3a3a3d}body.dark .inscard span{color:#9a9a9e}
body.dark .right h3{color:#7a7a7e}
body.dark .right select,body.dark .right textarea,body.dark .right input{background:#242427;border-color:#3a3a3d;color:#e6e6e8}
body.dark .right h4.sub{color:#9a9a9e;border-color:#2c2c2f}
body.dark .field label{color:#9a9a9e}
body.dark .addrow button,body.dark .oprow button,body.dark button.mini,body.dark .stab,body.dark .tgl{background:#2c2c2f;border-color:#3a3a3d;color:#ddd}
body.dark .addrow button:hover,body.dark .oprow button:hover,body.dark button.mini:hover,body.dark .stab:hover{background:#3a3a3d}
/* the primary 发送/导出 button keeps its brand brick-red + white text inside .oprow/.addrow,
   in both light and dark — otherwise the generic .oprow button bg (light gray / dark #2c2c2f)
   overrides primary-mini's red while keeping its white text → white-on-light = unreadable. */
.oprow button.primary-mini,.addrow button.primary-mini,body.dark .oprow button.primary-mini,body.dark .addrow button.primary-mini{background:var(--sm-accent-solid);color:#fff;border-color:var(--sm-accent)}
.oprow button.primary-mini:hover,.addrow button.primary-mini:hover,body.dark .oprow button.primary-mini:hover,body.dark .addrow button.primary-mini:hover{background:var(--sm-accent-deep)}
body.dark .stab.active{background:#3a2417;border-color:#7a4a2c;color:#f0b34a}
body.dark .tgl.on{background:#B5402A;border-color:#B5402A;color:#fff}
body.dark .nosel,body.dark .hint{color:#8a8a8e}
body.dark .hint b{color:#bdbdc2}
body.dark .tag{background:#3a2417;border-color:#7a4a2c;color:#f0b34a}
body.dark .aitarget{background:#26201a;border-color:#5a4326;color:#cfcfd2}
body.dark .qrow{background:#242427;border-color:#33333a}
body.dark .qrow:hover{background:#2c2c2f}
body.dark .qrow.active{background:#3a2417;border-color:#7a4a2c}
body.dark .restorebar{background:#242427;color:#e6e6e8;border-color:#7a4a2c}
body.dark .cbox{background:#1b1b1d;color:#e6e6e8}
body.dark .cbox .ctitle{color:#e6e6e8}
body.dark .cbox code{background:#2c2c2f}
`;

