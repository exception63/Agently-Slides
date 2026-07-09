// receiver.js —— 注入进 deck 的接收脚本（由 server.mjs 包在 IIFE 里，__CODE__ 已定义）
// 职责：① 连 SSE 收命令 → 合成键盘事件让 deck 翻页（deck 零改造）
//       ② 自建「黑屏」覆盖层  ③ 自建「▶ 开始全屏放映」起始遮罩（满足浏览器全屏需真实手势）
//       ④ 右上角一个「● 遥控已连接」小指示灯

// —— 合成键盘事件：deck 监听 document keydown 读 e.key ——
// 注意：必须派发到一个真实元素(body)，而非 document——deck 的守卫会调 e.target.matches(...)，
// 而 document 没有 .matches 方法会抛错。派发到 body 带 bubbles 一样能冒泡到 document 上的监听。
function fireKey(key) {
  var ev = new KeyboardEvent('keydown', { key: key, code: key, bubbles: true, cancelable: true });
  var target = document.body || document.documentElement;
  target.dispatchEvent(ev);
}

// —— 黑屏覆盖层 ——
var black = document.createElement('div');
black.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483646;display:none';
function ready(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
ready(function () { document.body.appendChild(black); });
function toggleBlack() { black.style.display = (black.style.display === 'none') ? 'block' : 'none'; }

// —— 连接指示灯 ——
var dot = document.createElement('div');
dot.textContent = '● 遥控未连';
dot.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;font:600 12px/1 system-ui,sans-serif;' +
  'padding:5px 9px;border-radius:999px;background:rgba(0,0,0,.55);color:#f5b73f;pointer-events:none;' +
  'opacity:.9;transition:opacity .4s;letter-spacing:.02em';
ready(function () { document.body.appendChild(dot); });
function setDot(connected) {
  dot.textContent = connected ? '● 遥控已连接' : '● 遥控未连';
  dot.style.color = connected ? '#39d353' : '#f5b73f';
  if (connected) { dot.style.opacity = '.9'; setTimeout(function () { dot.style.opacity = '0'; }, 2500); }
  else dot.style.opacity = '.9';
}

// —— 起始遮罩：全屏必须由真实点击触发，故在电脑放映页放一个大按钮 ——
var start = document.createElement('div');
start.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;' +
  'align-items:center;justify-content:center;gap:14px;cursor:pointer;' +
  'background:radial-gradient(120% 120% at 50% 40%,#1a1a1f 0%,#0a0a0c 100%);color:#fff;' +
  'font-family:system-ui,-apple-system,"PingFang SC",sans-serif;text-align:center;padding:24px';
start.innerHTML =
  '<div style="font-size:44px">▶</div>' +
  '<div style="font-size:26px;font-weight:700;letter-spacing:.01em">开始全屏放映</div>' +
  '<div style="font-size:15px;opacity:.7;max-width:30em;line-height:1.6">点击后进入全屏，即可离开电脑，用手机遥控翻页。<br>（手机端：同 Wi-Fi 扫码，或打开控制台页里的地址）</div>' +
  '<div style="margin-top:6px;font-size:13px;opacity:.5">按 Esc 退出全屏</div>';
start.addEventListener('click', function () {
  // 真实用户手势内请求全屏 —— 直接调原生，最稳
  var el = document.documentElement;
  var rf = el.requestFullscreen || el.webkitRequestFullscreen;
  if (rf) { try { rf.call(el); } catch (e) {} }
  // 再让 deck 进入它自己的「放映态」（若支持 p 键）
  fireKey('p');
  start.style.display = 'none';
});
ready(function () { document.body.appendChild(start); });

// —— 命令分发 ——
function handle(action) {
  switch (action) {
    case 'next': fireKey('ArrowRight'); break;
    case 'prev': fireKey('ArrowLeft'); break;
    case 'first': fireKey('Home'); break;
    case 'last': fireKey('End'); break;
    case 'fullscreen': fireKey('f'); break;   // 注：SSE 触发非用户手势，多数浏览器会拦全屏；请在电脑上点起始遮罩
    case 'present': fireKey('p'); break;
    case 'black': toggleBlack(); break;
    case 'hello': break;
    default: break;
  }
}

// —— SSE 连接（EventSource 自带断线重连）——
var es = null;
function connect() {
  try { es = new EventSource('/events?code=' + encodeURIComponent(__CODE__)); }
  catch (e) { return; }
  es.onopen = function () { setDot(true); };
  es.onerror = function () { setDot(false); };
  es.onmessage = function (e) {
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m && m.action) handle(m.action);
  };
}
ready(connect);
