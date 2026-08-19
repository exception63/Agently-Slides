// pair-client.js —— 烘进 deck 的「手机遥控」客户端（云端 + 局域网离线，二者用户可选）
// 依赖：同页先加载 vendor-qrcode.js（暴露全局 qrcode()）。
// Studio 导出时注入本段，并可设：
//   window.__SM_CLOUD_RELAY__ = 'https://xxx.workers.dev'   // 云中转地址（Studio 烘入）
//   window.__SM_LOCAL_RELAY__ = 'http://localhost:8787'     // 本机局域网中转（默认值）
(function () {
  var CLOUD = (window.__SM_CLOUD_RELAY__ || 'https://slidesmith-remote.zly-scu.workers.dev').replace(/\/$/, '');
  var LOCAL = (window.__SM_LOCAL_RELAY__ || 'http://localhost:8787').replace(/\/$/, '');

  // —— 合成键盘事件（派发到 body，deck 守卫会 e.target.matches()）——
  function fireKey(key) {
    var ev = new KeyboardEvent('keydown', { key: key, code: key, bubbles: true, cancelable: true });
    (document.body || document.documentElement).dispatchEvent(ev);
  }
  var black = document.createElement('div');
  black.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483645;display:none';
  function toggleBlack() { black.style.display = (black.style.display === 'none') ? 'block' : 'none'; }
  function handle(action) {
    if (action === 'next') fireKey('ArrowRight');
    else if (action === 'prev') fireKey('ArrowLeft');
    else if (action === 'first') fireKey('Home');
    else if (action === 'last') fireKey('End');
    else if (action === 'present') fireKey('p');
    else if (action === 'black') toggleBlack();
  }
  // ——————————————————————————————————————————————————————————————
  // 演讲者讲稿推送（v0.2）—— 镜像投屏的解法
  //
  // 现场如果是**镜像**投屏，同一台机器上开第二个窗口毫无意义：镜像会把窗口
  // 原样复制到投影上，观众跟你看到一模一样的东西。这是镜像的定义，PPT 也一样。
  // 所以讲稿必须落到**另一个设备**（iPad / 手机）——本模块干的就是这件事。
  //
  // 关键是不重写演讲者模式：presenter-mode 的 deck 本来就在
  // BroadcastChannel 上广播完整状态（slideIdx / total / anchor / title /
  // prevTitle / nextTitle），讲稿也已经 base64 嵌在 window.__TXB64__ 里。
  // 这里只把那份广播接到已有的中转管道上，中转一行都不用改（它是透明转发）。
  var PFEED = {
    chan: null,       // BroadcastChannel 实例
    name: null,       // 频道名
    last: null,       // 最近一次状态（新设备中途接入时补发）
  };
  // 频道名：优先用显式配置；否则从 localStorage 嗅探——broadcastPresenter 每次
  // 都会写一条 `<channel>-state`，键名反推得到频道名，免配置。
  function presenterChannelName() {
    if (typeof window.__SM_PRESENTER_CHANNEL__ === 'string' && window.__SM_PRESENTER_CHANNEL__) return window.__SM_PRESENTER_CHANNEL__;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.slice(-6) !== '-state') continue;
        var v = JSON.parse(localStorage.getItem(k) || 'null');
        if (v && typeof v.slideIdx === 'number') return k.slice(0, -6);
      }
    } catch (e) { /* 隐私模式下 localStorage 会抛，忽略 */ }
    return null;
  }
  function startPresenterFeed() {
    if (PFEED.chan || !window.BroadcastChannel) return;
    PFEED.name = presenterChannelName();
    if (!PFEED.name) return;                       // 这份 deck 没有演讲者广播 → 只当遥控用
    try { PFEED.chan = new BroadcastChannel(PFEED.name); } catch (e) { return; }
    // 同一页面里另建一个同名 channel 是能收到本页 postMessage 的（规范只排除发送者
    // 自己那个对象），所以不用碰 deck 的代码就能旁听。
    PFEED.chan.onmessage = function (e) {
      var d = e && e.data;
      if (!d || typeof d.slideIdx !== 'number') return;
      if (d.type === 'jump-to-slide') return;       // 那是反向指令，不是状态
      PFEED.last = d;
      relaySend({ type: 'state', state: d });
    };
    // 让 deck 立刻补广播一次当前页：它监听 'presenter-ready'（副窗打开时用的同一条路）
    try { window.postMessage({ type: 'presenter-ready' }, '*'); } catch (e) {}
    try { if (!PFEED.last) { var raw = localStorage.getItem(PFEED.name + '-state'); if (raw) PFEED.last = JSON.parse(raw); } } catch (e) {}
  }
  // 讲稿全文 + 当前状态：第二设备一连上就推这一次（讲稿约 30-50 KB，之后每页只走几十字节状态）
  function sendDeckInfo() {
    startPresenterFeed();
    relaySend({
      type: 'deck-info',
      txb64: (typeof window.__TXB64__ === 'string' ? window.__TXB64__ : null),
      title: document.title || '',
      state: PFEED.last || null
    });
  }
  // 第二设备点「上一页/下一页」时也可以直接指定页码（讲稿模式下点目录跳转用）
  function presenterJump(i) {
    if (!PFEED.chan || typeof i !== 'number') return;
    try { PFEED.chan.postMessage({ type: 'jump-to-slide', slideIdx: i, source: 'presenter' }); } catch (e) {}
  }
  // 出站一律「直连优先、中转兜底」。这条对讲稿尤其要紧：讲稿是你还没讲出口的话
  // （未发表的研究、内部数据都可能在里面），能不过第三方就不过。手机和电脑同一
  // Wi-Fi 时 P2P 会自动建起来，那时整份讲稿根本不出局域网；连不上才回落中转。
  // 直连**只在验证过之后**才用。WebRTC 会半开：deck 这边 readyState 已经是 'open'，
  // 手机那边其实没连上——往里发等于扔进黑洞，而且不报错。判据取「收到过对端的消息」，
  // 因为手机的 dc 一开就会往这边发东西，收到即证明双向通。没验过就老实走中转。
  var dcProven = false;
  function relaySend(o) {
    var msg = JSON.stringify(o);
    if (dcProven && dc && dc.readyState === 'open') { try { dc.send(msg); return; } catch (e) {} }
    if (ws && ws.readyState === 1) { try { ws.send(msg); } catch (e) {} }
  }

  function randId() {
    var a = new Uint8Array(12); (window.crypto || crypto).getRandomValues(a);
    return Array.from(a).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  // 房间号 = 配对频道。Studio 导出时可烘进一个固定值(window.__SM_ROOM__) → 二维码永远不变、可截图复用；
  // 没烘时本页首次用到就生成一个并缓存，之后多次点开也是同一个（同样不变、不重复生成）。
  var ROOM = (typeof window.__SM_ROOM__ === 'string' && window.__SM_ROOM__) ? window.__SM_ROOM__ : null;
  function roomId() { if (!ROOM) ROOM = randId(); return ROOM; }
  function qrSvg(text, px) {
    try {
      var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      return qr.createSvgTag({ cellSize: Math.max(3, Math.floor(px / qr.getModuleCount())), margin: 2, scalable: true });
    } catch (e) { return null; }
  }

  // —— 遥控按钮 ——
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '📱 手机遥控';
  btn.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483646;border:none;border-radius:999px;' +
    'padding:10px 16px;font:600 14px/1 system-ui,-apple-system,"PingFang SC",sans-serif;cursor:pointer;' +
    'background:#f5b73f;color:#181818;box-shadow:0 3px 12px rgba(0,0,0,.3)';

  var ws = null;
  // WebRTC 直连（deck 是 offerer）——手机一连上就试着建 P2P 数据通道；成功后指令走直连，否则走云中转
  var pc = null, dc = null, pendingIce = [];
  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  function sig(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'signal', kind: o.kind, data: o.data })); }
  function closePc() { try { if (dc) dc.close(); if (pc) pc.close(); } catch (e) {} dc = null; pc = null; }
  function startRtc() {
    if (pc) return;
    pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = function (e) { if (e.candidate) sig({ kind: 'ice', data: e.candidate }); };
    dc = pc.createDataChannel('ctrl');
    // 直连通道要认全部三种入站消息，不能只认 cmd —— 否则 iPad 升级到直连之后再要讲稿
    // （need-info）就石沉大海，重连一次讲稿屏就空了。
    dc.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      dcProven = true;                      // 收到就说明这条道真的双向通了
      if (m.type === 'cmd' && m.action) handle(m.action);
      else if (m.type === 'need-info') sendDeckInfo();
      else if (m.type === 'jump' && typeof m.slideIdx === 'number') presenterJump(m.slideIdx);
    };
    dc.onopen = function () { setTransport(true); sendDeckInfo(); };
    dc.onclose = function () { dcProven = false; setTransport(false); };
    pc.createOffer().then(function (off) { return pc.setLocalDescription(off).then(function () { sig({ kind: 'offer', data: off }); }); }).catch(function () {});
  }
  function onAnswer(sdp) { if (!pc) return; pc.setRemoteDescription(new RTCSessionDescription(sdp)).then(function () { pendingIce.forEach(function (c) { try { pc.addIceCandidate(c); } catch (e) {} }); pendingIce = []; }).catch(function () {}); }
  function onIce(c) { if (!pc || !pc.remoteDescription) { pendingIce.push(c); return; } try { pc.addIceCandidate(c); } catch (e) {} }
  function setTransport(isP2p) { var msg = card.querySelector('#__sm_pairmsg'); if (msg && msg.textContent.indexOf('✅') === 0) msg.textContent = '✅ 手机已连接（' + (isP2p ? '局域网直连' : '云端') + '）· 可关闭本窗'; }
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;' +
    'background:rgba(6,6,9,.72);backdrop-filter:blur(3px);font-family:system-ui,-apple-system,"PingFang SC",sans-serif';
  var card = document.createElement('div');
  card.style.cssText = 'background:#fff;color:#141414;border-radius:18px;padding:26px 30px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)';
  overlay.appendChild(card);
  // 只隐藏浮层，保持 ws + P2P 连接（关掉二维码后仍能继续遥控）
  function closeOverlay() { overlay.style.display = 'none'; }

  // —— 第一屏：选连接方式 ——
  function showChooser() {
    overlay.style.display = 'flex';
    var cloudBtn = CLOUD
      ? '<button id="__sm_cloud" style="' + optCss('#f5b73f') + '"><b style="font-size:16px">☁️ 云端连接（推荐）</b>' +
        '<div style="font-size:12.5px;color:#555;margin-top:4px">任何网络都行（会场隔离 Wi-Fi 也可）· 手机和电脑同一 Wi-Fi 时会<b>自动升级为直连</b>（更快更私密）· 需联网</div></button>'
      : '<div style="' + optCss('#eee', true) + 'opacity:.6"><b style="font-size:16px">☁️ 云端连接</b>' +
        '<div style="font-size:12.5px;color:#777;margin-top:4px">这份文件导出时没写入云中转地址（Studio 里开启即可）</div></div>';
    card.innerHTML =
      '<div style="font-size:18px;font-weight:700;margin-bottom:4px">手机遥控 · 选连接方式</div>' +
      '<div style="font-size:13px;color:#666;margin-bottom:18px">一般选「云端」即可；同网时它会自动走直连</div>' +
      cloudBtn +
      '<button id="__sm_lan" style="' + optCss('#2b6cb0') + '"><b style="font-size:16px;color:#fff">🔌 完全离线</b>' +
      '<div style="font-size:12.5px;color:#e6eefc;margin-top:4px">现场一点网都没有时才用 · 需先在本机双击启动「本地遥控」服务</div></button>' +
      '<button id="__sm_cancel" style="margin-top:8px;border:none;background:none;color:#999;font-size:13px;cursor:pointer">取消</button>';
    if (CLOUD) card.querySelector('#__sm_cloud').onclick = function () { startPairing(CLOUD, CLOUD, '云端'); };
    card.querySelector('#__sm_lan').onclick = startLan;
    card.querySelector('#__sm_cancel').onclick = closeOverlay;
  }
  function optCss(bg, plain) {
    return 'display:block;width:100%;margin:0 0 12px;padding:14px 16px;border-radius:14px;border:none;cursor:' +
      (plain ? 'default' : 'pointer') + ';text-align:left;background:' + bg + ';';
  }

  // —— 局域网：先问本机中转要 LAN IP ——
  // 端口要挨个试：8787 常被别的开发服务占着（实测撞过一次），撞了就该往下找，
  // 而不是甩用户一句「服务未开启」——服务明明开着，只是不在默认端口。
  // 还要验响应形状：占着端口的那个服务也会应答 /whoami，只是答的不是我们要的东西。
  function lanCandidates() {
    var out = [];
    if (window.__SM_LOCAL_RELAY__) out.push(String(window.__SM_LOCAL_RELAY__).replace(/\/$/, ''));
    ['8787', '8788', '8799'].forEach(function (p) {
      var u = 'http://localhost:' + p;
      if (out.indexOf(u) < 0) out.push(u);
    });
    return out;
  }
  function probeLan(list, i, ok, fail) {
    if (i >= list.length) { fail(); return; }
    var base = list[i];
    fetch(base + '/whoami', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (!info || !info.ips || !info.ips.length) throw new Error('not our relay');
        ok(base, info);
      })
      .catch(function () { probeLan(list, i + 1, ok, fail); });
  }
  function startLan() {
    card.innerHTML = '<div style="font-size:16px;font-weight:600;margin:20px 0">正在找本机局域网服务…</div>';
    probeLan(lanCandidates(), 0, function (base, info) {
      var phoneBase = 'http://' + info.ips[0] + ':' + (info.port || 8787);
      startPairing(base, phoneBase, '局域网');
    }, function () {
      card.innerHTML =
        '<div style="font-size:17px;font-weight:700;margin-bottom:8px;color:#c0392b">本机局域网服务未开启</div>' +
        '<div style="font-size:13px;color:#555;line-height:1.7;text-align:left">局域网/离线模式需要先在<b>这台电脑</b>上启动 Slidesmith 的局域网中转：<br>' +
        '让 Claude 运行 <code style="background:#f2f2f2;padding:1px 5px;border-radius:4px">relay.mjs</code>（或用 <code style="background:#f2f2f2;padding:1px 5px;border-radius:4px">/slidesmith:phone-remote</code>），再回来点这里。<br><br>' +
        '若现场能联网，直接用<b>云端连接</b>更省事。</div>' +
        '<button id="__sm_back" style="margin-top:16px;border:1px solid #ddd;background:#fafafa;border-radius:10px;padding:8px 18px;font-size:14px;cursor:pointer">返回</button>';
      card.querySelector('#__sm_back').onclick = showChooser;
    });
  }

  // —— 第二屏：出二维码 + 等待/已配对 ——
  function startPairing(wsBaseHttp, phoneBase, label) {
    // 先关掉上一次的连接：否则每点一次「手机遥控」就多一条 WebSocket，
    // 同一条指令会被每条连接各执行一次 → 一次点击翻好几页。
    closePc();
    if (ws) { try { ws.onmessage = null; ws.onerror = null; ws.close(); } catch (e) {} ws = null; }
    var room = roomId();
    var phoneUrl = phoneBase + '/r/' + room;
    overlay.style.display = 'flex';
    var svg = qrSvg(phoneUrl, 224);
    card.innerHTML =
      '<div style="font-size:18px;font-weight:700;margin-bottom:2px">手机扫码配对</div>' +
      '<div style="font-size:12.5px;color:#888;margin-bottom:16px">' + label + '连接 · 用手机相机扫下面二维码</div>' +
      '<div id="__sm_qr" style="width:224px;height:224px;margin:0 auto">' + (svg || '<div style="color:#c00;font-size:13px">二维码生成失败，手输下方网址</div>') + '</div>' +
      '<div id="__sm_pairmsg" style="font-size:13px;color:#888;margin-top:14px">等待手机连接…</div>' +
      '<div style="font-size:12px;color:#aaa;margin-top:8px;word-break:break-all">' + phoneUrl + '</div>' +
      '<button id="__sm_close" style="margin-top:16px;border:1px solid #ddd;background:#fafafa;border-radius:10px;padding:8px 18px;font-size:14px;cursor:pointer">关闭</button>';
    card.querySelector('#__sm_close').onclick = closeOverlay;
    var qrBox = card.querySelector('#__sm_qr'); var qrEl = qrBox.querySelector('svg');
    if (qrEl) { qrEl.setAttribute('width', '224'); qrEl.setAttribute('height', '224'); }

    try { ws = new WebSocket(wsBaseHttp.replace(/^http/, 'ws') + '/ws?room=' + room + '&role=deck'); }
    catch (e) { pairError('无法建立连接。'); return; }
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type === 'peer') { if (m.event === 'join') { markPaired(); startRtc(); } else if (m.event === 'leave') closePc(); }
      else if (m.type === 'joined' && m.peers && m.peers.remote > 0) { markPaired(); startRtc(); }
      else if (m.type === 'signal') { if (m.kind === 'answer') onAnswer(m.data); else if (m.kind === 'ice') onIce(m.data); }
      else if (m.type === 'cmd' && m.action) handle(m.action);   // 云端回落路径
      else if (m.type === 'evicted') {                            // 被同一份 slides 的另一个窗口顶掉了
        closePc();
        pairError('这份 slides 的另一个窗口/副本接管了遥控。要在本窗口讲，重新点一次「手机遥控」。');
      }
      else if (m.type === 'need-info') sendDeckInfo();            // 第二设备要讲稿
      else if (m.type === 'jump' && typeof m.slideIdx === 'number') presenterJump(m.slideIdx);
    };
    ws.onerror = function () { pairError(label === '云端' ? '连不上云中转，请确认电脑已联网。' : '连不上本机局域网服务。'); };
  }
  function markPaired() {
    sendDeckInfo();                                  // 对端一上线就把讲稿 + 当前页推过去
    var msg = card.querySelector('#__sm_pairmsg');
    if (msg) { msg.textContent = '✅ 手机已连接，可以开始遥控（可关闭本窗）'; msg.style.color = '#1a9d4b'; }
  }
  function pairError(text) {
    var msg = card.querySelector('#__sm_pairmsg');
    if (msg) { msg.textContent = '⚠️ ' + text; msg.style.color = '#c0392b'; }
  }

  btn.onclick = showChooser;
  function mount() { document.body.appendChild(black); document.body.appendChild(btn); document.body.appendChild(overlay); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
