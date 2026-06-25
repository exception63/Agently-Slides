/* Slidesmith presenter runtime (second screen).
   PRIMARY sync channel = window.opener <-> child-window postMessage + ~1s
   heartbeat. This works across file:// opaque origins where BroadcastChannel /
   localStorage events do NOT (the correction over the legacy skill). The deck
   pushes state via its saved child-window reference; the presenter talks back
   via window.opener. The embedded transcript is driven through the iframe's
   contentWindow. Source fields guard against echo. No dependencies. */
(function () {
  'use strict';
  var MSG = 'sm';
  var boot = window.__SMP__ || {};
  var anchors = boot.anchors || [];
  var titles = boot.titles || [];
  var segs = boot.segs || [];
  var segNames = boot.segNames || [];
  var total = boot.total || anchors.length;

  var $ = function (id) { return document.getElementById(id); };
  var iframe = $('smpFrame');

  var lastIdx = -1, lastAnchor = '';
  var forwardFollow = true, reverseFollow = true, cueOn = false;
  var zoom = 1;
  var lastBeat = 0;

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('smpToast'); el.textContent = msg; el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 1600);
  }

  // ---------- talk to the deck (opener) ----------
  function toDeck(msg) {
    msg.source = 'presenter';
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, '*'); } catch (e) {}
  }
  // ---------- talk to the transcript (iframe) ----------
  function toScript(msg) { try { iframe.contentWindow.postMessage(msg, '*'); } catch (e) {} }

  function scrollScript(anchor) { if (anchor) toScript({ type: MSG + ':scroll', anchor: anchor }); }

  // ---------- apply state pushed from the deck ----------
  function applyState(s) {
    if (!s || typeof s.idx !== 'number') return;
    if (s.source === 'presenter') return;       // echo guard
    lastBeat = beatNow();
    lastIdx = s.idx;
    var anchor = s.anchor || anchors[s.idx] || '';

    $('smpCur').textContent = s.idx + 1;
    $('smpTotal').textContent = s.total || total;
    var seg = s.seg != null ? s.seg : (segs[s.idx] || '');
    var segName = s.segName != null ? s.segName : (segNames[s.idx] || '');
    $('smpSeg').textContent = seg ? ('段 ' + seg) : '—';
    $('smpSegName').textContent = segName || '';
    $('smpTcur').textContent = s.title || titles[s.idx] || '—';
    $('smpTprev').textContent = (s.idx > 0) ? (titles[s.idx - 1] || '—') : '—';
    $('smpTnext').textContent = (s.idx < (total - 1)) ? (titles[s.idx + 1] || '—') : '—';

    setConn(true);
    if (forwardFollow && anchor && anchor !== lastAnchor) { scrollScript(anchor); lastAnchor = anchor; }
  }

  function setConn(connected) {
    var el = $('smpConn');
    el.classList.toggle('connected', connected && forwardFollow);
    el.classList.toggle('waiting', !connected);
    $('smpConnText').textContent = !connected
      ? '⚪ 等待主屏连接 …（在主屏按 P 打开本视图）'
      : (forwardFollow
        ? '🟢 已连接 · 跟随翻页中 · 第 ' + (lastIdx + 1) + '/' + total + ' 张'
        : '⏸ 已连接 · 正向跟随关 · 可自由滚动讲稿');
  }

  // ---------- receive ----------
  window.addEventListener('message', function (e) {
    var d = e && e.data; if (!d || typeof d !== 'object') return;
    if (d.type === MSG + ':state') { applyState(d); }
    else if (d.type === MSG + ':ping') { lastBeat = beatNow(); setConn(true); }
    else if (d.type === MSG + ':anchor') {           // transcript answered a query
      var i = anchors.indexOf(d.anchor);
      if (i >= 0) { reverseJump(i); toast('← 同步：主屏跳到第 ' + (i + 1) + ' 张'); }
      else toast('← 同步：讲稿当前位置无对应幻灯片');
    }
    else if (d.type === MSG + ':toc') {              // TOC click inside transcript
      var j = anchors.indexOf(d.anchor); if (j >= 0 && j !== lastIdx) reverseJump(j);
    }
    else if (d.type === MSG + ':key') { handleKey(d.key); }
    else if (d.type === MSG + ':ready') { applyCue(); if (lastAnchor) scrollScript(lastAnchor); }
  });

  // ---------- reverse: drive the deck ----------
  function reverseJump(idx) {
    idx = Math.max(0, Math.min(total - 1, idx));
    toDeck({ type: MSG + ':jump', idx: idx });
    lastIdx = idx;
  }
  function reverseNav(dir) {
    if (!hasDeck()) { toast('未连接主屏 · 仅滚动讲稿'); scrollBy(dir); return; }
    reverseJump(lastIdx < 0 ? 0 : lastIdx + dir);
  }
  function hasDeck() { try { return window.opener && !window.opener.closed; } catch (e) { return false; } }
  function scrollBy(dir) { try { iframe.contentWindow.scrollBy(0, dir * iframe.clientHeight * 0.85); } catch (e) {} }

  function forwardSync() {
    if (lastIdx < 0) { toast('尚未收到主屏状态'); return; }
    var a = anchors[lastIdx] || anchors[0]; scrollScript(a); lastAnchor = a;
    toast('→ 同步：讲稿跳到第 ' + (lastIdx + 1) + ' 张');
  }
  function reverseSync() { toScript({ type: MSG + ':query' }); }

  // ---------- timer ----------
  var tRunning = true, tStart = 0, tElapsed = 0, beatBase = 0;
  // Date.now-free monotonic-ish clock via performance.now
  function beatNow() { return (window.performance && performance.now) ? performance.now() : 0; }
  function nowSec() { return Math.floor(beatNow() / 1000); }
  function fmt(s) {
    var h = String(Math.floor(s / 3600)).padStart(2, '0');
    var m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    var x = String(s % 60).padStart(2, '0'); return h + ':' + m + ':' + x;
  }
  function tick() {
    var t = tElapsed + (tRunning ? (nowSec() - tStart) : 0);
    $('smpTimer').textContent = fmt(Math.max(0, t));
    // heartbeat watchdog: no beat for 3.5s -> show waiting
    if (lastBeat && beatNow() - lastBeat > 3500) setConn(false);
  }
  tStart = nowSec();
  setInterval(tick, 1000);
  function toggleTimer() {
    if (tRunning) { tElapsed += nowSec() - tStart; tRunning = false; $('smpTimerToggle').textContent = '继续'; $('smpTimer').classList.add('paused'); toast('⏸ 计时暂停'); }
    else { tStart = nowSec(); tRunning = true; $('smpTimerToggle').textContent = '暂停'; $('smpTimer').classList.remove('paused'); toast('▶ 计时继续'); }
  }
  function resetTimer() { tElapsed = 0; tStart = nowSec(); tRunning = true; $('smpTimerToggle').textContent = '暂停'; $('smpTimer').classList.remove('paused'); tick(); toast('↻ 计时重置'); }

  // ---------- zoom ----------
  function zoomIn() { zoom = Math.min(2, zoom + 0.1); iframe.style.zoom = zoom; toast('字号 ' + Math.round(zoom * 100) + '%'); }
  function zoomOut() { zoom = Math.max(0.6, zoom - 0.1); iframe.style.zoom = zoom; toast('字号 ' + Math.round(zoom * 100) + '%'); }

  // ---------- toggles ----------
  function paintToggle(btn, on, labelOn, labelOff) { btn.classList.toggle('on', on); btn.classList.toggle('off', !on); btn.textContent = on ? labelOn : labelOff; }
  function refreshToggles() {
    paintToggle($('smpFwd'), forwardFollow, '→ 跟随 开', '→ 跟随 关');
    paintToggle($('smpRev'), reverseFollow, '← 跟随 开', '← 跟随 关');
    paintToggle($('smpCue'), cueOn, '✦ 提词 开', '✦ 提词 关');
  }
  function toggleFwd() { forwardFollow = !forwardFollow; refreshToggles(); setConn(hasBeat()); toast(forwardFollow ? '→ 正向跟随 开' : '→ 正向跟随 关 · 可自由滚动讲稿'); if (forwardFollow && lastIdx >= 0) { var a = anchors[lastIdx]; if (a) { scrollScript(a); lastAnchor = a; } } }
  function toggleRev() { reverseFollow = !reverseFollow; refreshToggles(); toast(reverseFollow ? '← 反向跟随 开 · 按键联动主屏' : '← 反向跟随 关 · 按键仅滚讲稿'); }
  function applyCue() { paintToggle($('smpCue'), cueOn, '✦ 提词 开', '✦ 提词 关'); toScript({ type: MSG + ':cue', on: cueOn }); }
  function toggleCue() { cueOn = !cueOn; applyCue(); toast(cueOn ? '✦ 关键词提词 开 · 当前块的强调词会亮' : '✦ 关键词提词 关'); }
  function hasBeat() { return lastBeat && beatNow() - lastBeat < 3500; }

  // ---------- collapse ----------
  var collapsed = false;
  function toggleCollapse() { collapsed = !collapsed; document.body.classList.toggle('collapsed', collapsed); $('smpHide').textContent = collapsed ? '☰' : '👁'; }

  // ---------- fullscreen on second screen (best effort) ----------
  function goFullscreen() {
    var el = document.documentElement;
    if (window.getScreenDetails) {
      window.getScreenDetails().then(function (sd) {
        var other = sd.screens.filter(function (s) { return s !== sd.currentScreen; })[0] || sd.currentScreen;
        try { el.requestFullscreen({ screen: other }); } catch (e) { try { el.requestFullscreen(); } catch (e2) {} }
      }).catch(function () { try { el.requestFullscreen(); } catch (e) {} });
    } else { try { el.requestFullscreen(); } catch (e) {} }
  }

  // ---------- keyboard ----------
  function handleKey(key) {
    if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') {
      if (reverseFollow) reverseNav(1); else scrollBy(1); return true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') {
      if (reverseFollow) reverseNav(-1); else scrollBy(-1); return true;
    }
    var k = (key || '').toLowerCase();
    if (k === 'l') { toggleFwd(); return true; }
    if (k === 'j') { toggleRev(); return true; }
    if (k === 's') { forwardSync(); return true; }
    if (k === 'd') { reverseSync(); return true; }
    if (k === 'k') { toggleCue(); return true; }
    if (k === 'h') { toggleCollapse(); return true; }
    if (k === 'f') { goFullscreen(); return true; }
    if (k === 'r') { resetTimer(); return true; }
    if (k === '=' || k === '+') { zoomIn(); return true; }
    if (k === '-' || k === '_') { zoomOut(); return true; }
    return false;
  }
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.matches && e.target.matches('input,textarea,select')) return;
    if (handleKey(e.key)) e.preventDefault();
  });

  // ---------- wire buttons ----------
  function on(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }
  on('smpFwd', toggleFwd); on('smpRev', toggleRev); on('smpCue', toggleCue);
  on('smpFwdSync', forwardSync); on('smpRevSync', reverseSync);
  on('smpZoomIn', zoomIn); on('smpZoomOut', zoomOut);
  on('smpFull', goFullscreen); on('smpHide', toggleCollapse);
  on('smpTimerToggle', toggleTimer); on('smpTimerReset', resetTimer);
  refreshToggles();

  // ---------- boot ----------
  $('smpTotal').textContent = total;
  // resolve transcript URL: explicit boot value, else convention from our own path
  var transcriptUrl = boot.transcriptUrl || location.href.replace(/\.presenter\.html?(\?|#|$)/i, '.transcript.html$1');
  iframe.setAttribute('src', transcriptUrl);
  iframe.addEventListener('load', function () { applyCue(); if (lastAnchor) scrollScript(lastAnchor); });
  // ask the deck for the current state right away (handshake)
  toDeck({ type: MSG + ':hello' });
  setConn(false);
  setTimeout(function () { if (lastIdx < 0) toast('💡 在主屏按 P 打开，或翻一页即可同步', 3000); }, 1400);
})();
