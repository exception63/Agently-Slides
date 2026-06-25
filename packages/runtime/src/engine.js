/* Slidesmith deck runtime. Reads window.__SM__ + the DOM. No dependencies. */
(function () {
  'use strict';
  var boot = window.__SM__ || {};
  var slides = [].slice.call(document.querySelectorAll('.sm-deck > .slide'));
  var total = slides.length;
  var idx = 0;

  var stage = document.querySelector('.sm-stage');
  var bar = document.querySelector('.sm-progress__bar');
  var curEl = document.querySelector('.sm-counter .cur');
  var totalEl = document.querySelector('.sm-counter .total');
  var segnav = document.querySelector('.sm-segnav');
  var thumbs = document.querySelector('.sm-thumbs');
  var groups = [];

  // --- presenter (second screen) sync ---
  var MSG = 'sm';
  var anchors = boot.anchors || [];
  var titles = boot.titles || [];
  var segs = boot.segs || [];
  var segNames = boot.segNames || [];
  var presenterWin = null;

  // --- themes (runtime switch) + animations ---
  var themeNames = boot.themes || (boot.theme ? [boot.theme] : []);
  var themeIdx = Math.max(0, themeNames.indexOf(boot.theme));
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (!reduceMotion) document.body.classList.add('anim');

  if (totalEl) totalEl.textContent = String(total);
  buildSegNav();
  buildThumbs();

  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', scaleActive);
  document.addEventListener('fullscreenchange', onFsChange);
  window.addEventListener('message', onMessage);
  window.addEventListener('beforeunload', function () { try { if (presenterWin) presenterWin.close(); } catch (e) {} });
  setInterval(heartbeat, 1000);

  bindAct('prev', function () { go(idx - 1); });
  bindAct('next', function () { go(idx + 1); });
  bindAct('fs', toggleFs);
  bindAct('present', openPresenter);

  // minimal hook for headless PNG export (slidesmith export)
  try { window.__SM_GO__ = go; window.__SM_TOTAL__ = total; } catch (e) {}

  go(0);

  function bindAct(name, fn) {
    var el = document.querySelector('[data-act="' + name + '"]');
    if (el) el.addEventListener('click', fn);
  }

  function go(n) {
    idx = Math.max(0, Math.min(total - 1, n));
    for (var i = 0; i < slides.length; i++) {
      slides[i].classList.toggle('active', i === idx);
    }
    scaleActive();
    updateChrome();
    applyReveal();
    postState();
  }

  // ----- declarative animation reveal (reads [data-anim*]) -----
  function applyReveal() {
    for (var i = 0; i < slides.length; i++) slides[i].classList.remove('sm-reveal');
    var s = slides[idx];
    if (!s || !document.body.classList.contains('anim')) return;
    var els = s.querySelectorAll('[data-anim]');
    for (var k = 0; k < els.length; k++) {
      var el = els[k];
      var d = parseFloat(el.getAttribute('data-anim-delay') || '0');
      var st = parseFloat(el.getAttribute('data-anim-stagger') || '0');
      if (el.getAttribute('data-anim') === 'stagger-list') {
        var lis = el.querySelectorAll('li');
        for (var j = 0; j < lis.length; j++) lis[j].style.animationDelay = ((d + j * (st || 90)) / 1000) + 's';
      } else {
        el.style.animationDelay = (d / 1000) + 's';
      }
    }
    void s.offsetWidth;            // force reflow so the animation replays each visit
    s.classList.add('sm-reveal');
    countUpAll(s);
  }

  function countUpAll(s) {
    var nums = s.querySelectorAll('[data-anim="counter-up"]');
    for (var i = 0; i < nums.length; i++) countUp(nums[i]);
  }
  function countUp(el) {
    if (!document.body.classList.contains('anim')) return;
    var full = el.getAttribute('data-cu') || el.textContent;
    el.setAttribute('data-cu', full);
    var m = full.match(/-?\d[\d,]*\.?\d*/);
    if (!m) return;
    var target = parseFloat(m[0].replace(/,/g, ''));
    if (!isFinite(target)) return;
    var prefix = full.slice(0, m.index), suffix = full.slice(m.index + m[0].length);
    var decimals = (m[0].split('.')[1] || '').length;
    var dur = 900, delay = parseFloat(el.getAttribute('data-anim-delay') || '250');
    var start = null;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (target * e).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    setTimeout(function () { requestAnimationFrame(frame); }, delay);
  }

  function toggleAnim() {
    var on = !document.body.classList.contains('anim');
    document.body.classList.toggle('anim', on);
    if (on) applyReveal();
  }

  // ----- runtime theme switch (T key) -----
  function setTheme(name) {
    var styles = document.querySelectorAll('style[data-sm-theme]');
    for (var i = 0; i < styles.length; i++) {
      styles[i].setAttribute('media', styles[i].getAttribute('data-sm-theme') === name ? 'all' : 'not all');
    }
    scaleActive();
  }
  function cycleTheme() {
    if (themeNames.length < 2) return;
    themeIdx = (themeIdx + 1) % themeNames.length;
    setTheme(themeNames[themeIdx]);
  }

  function scaleActive() {
    var s = slides[idx];
    if (!s || !stage) return;
    var r = stage.getBoundingClientRect();
    var pad = document.body.classList.contains('present') ? 0 : 36;
    var sc = Math.min((r.width - pad) / 1920, (r.height - pad) / 1080);
    if (!isFinite(sc) || sc <= 0) sc = 1;
    s.style.setProperty('--sm-scale', String(sc));
  }

  function updateChrome() {
    if (bar) bar.style.width = ((idx + 1) / total * 100) + '%';
    if (curEl) curEl.textContent = String(idx + 1);
    var segItems = segnav ? segnav.querySelectorAll('.sm-seg') : [];
    for (var i = 0; i < segItems.length; i++) {
      var first = parseInt(segItems[i].getAttribute('data-first'), 10);
      var last = parseInt(segItems[i].getAttribute('data-last'), 10);
      segItems[i].classList.toggle('active', idx >= first && idx <= last);
    }
    var tnodes = thumbs ? thumbs.querySelectorAll('.sm-thumb') : [];
    for (var j = 0; j < tnodes.length; j++) {
      tnodes[j].classList.toggle('active', j === idx);
    }
    var act = tnodes[idx];
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }

  function onKey(e) {
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') {
      go(idx + 1); e.preventDefault();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') {
      go(idx - 1); e.preventDefault();
    } else if (k === 'Home') { go(0); e.preventDefault(); }
    else if (k === 'End') { go(total - 1); e.preventDefault(); }
    else if (k === 'f' || k === 'F') { toggleFs(); e.preventDefault(); }
    else if (k === 'p' || k === 'P') { openPresenter(); e.preventDefault(); }
    else if (k === 't' || k === 'T') { cycleTheme(); e.preventDefault(); }
    else if (k === 'b' || k === 'B') { toggleAnim(); e.preventDefault(); }
    else if (/^[1-9]$/.test(k)) { jumpSeg(parseInt(k, 10) - 1); e.preventDefault(); }
  }

  function toggleFs() {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  }

  function onFsChange() {
    document.body.classList.toggle('present', !!document.fullscreenElement);
    scaleActive();
  }

  function computeGroups() {
    var out = [];
    var cur = null;
    for (var i = 0; i < slides.length; i++) {
      var seg = slides[i].getAttribute('data-seg');
      var name = slides[i].getAttribute('data-segname');
      if (!name) {
        name = seg ? ('段 ' + seg) : ((boot.titles && boot.titles[i]) || ('Slide ' + (i + 1)));
      }
      var key = seg != null ? ('seg:' + seg) : ('idx:' + i);
      if (!cur || cur.key !== key || seg == null) {
        cur = { key: key, name: name, first: i, last: i };
        out.push(cur);
      } else {
        cur.last = i;
      }
    }
    return out;
  }

  function buildSegNav() {
    if (!segnav) return;
    groups = computeGroups();
    segnav.innerHTML = '';
    groups.forEach(function (g) {
      var b = document.createElement('button');
      b.className = 'sm-seg';
      b.textContent = g.name;
      b.setAttribute('data-first', String(g.first));
      b.setAttribute('data-last', String(g.last));
      b.addEventListener('click', function () { go(g.first); });
      segnav.appendChild(b);
    });
  }

  function jumpSeg(n) {
    if (groups[n]) go(groups[n].first);
  }

  function buildThumbs() {
    if (!thumbs) return;
    thumbs.innerHTML = '';
    slides.forEach(function (s, i) {
      var t = document.createElement('div');
      t.className = 'sm-thumb';
      var clone = s.cloneNode(true);
      clone.classList.remove('active');
      clone.removeAttribute('id');
      clone.removeAttribute('style');
      t.appendChild(clone);
      var num = document.createElement('span');
      num.className = 'sm-thumb-num';
      num.textContent = String(i + 1);
      t.appendChild(num);
      t.addEventListener('click', function () { go(i); });
      thumbs.appendChild(t);
    });
  }

  // ===== presenter / second-screen sync (window.open + postMessage + heartbeat) =====
  function presenterUrl() {
    if (boot.presenterUrl) return boot.presenterUrl;
    // convention: <name>.html -> <name>.presenter.html
    return location.href.replace(/\.html?(\?|#|$)/i, '.presenter.html$1');
  }

  function openPresenter() {
    try {
      if (presenterWin && !presenterWin.closed) { presenterWin.focus(); postState(); return; }
    } catch (e) {}
    var features = secondScreenFeatures();
    try { presenterWin = window.open(presenterUrl(), 'slidesmith-presenter', features); } catch (e) { presenterWin = null; }
    // give the child a moment to wire up its listener, then push state
    setTimeout(postState, 400);
    setTimeout(postState, 1200);
  }

  // best-effort: place the presenter window on a different physical screen
  function secondScreenFeatures() {
    try {
      if (window.screen && window.screen.availWidth) {
        var w = Math.min(1280, window.screen.availWidth);
        var h = Math.min(800, window.screen.availHeight);
        return 'width=' + w + ',height=' + h + ',left=80,top=80';
      }
    } catch (e) {}
    return 'width=1100,height=720';
  }

  function postState() {
    if (!presenterWin) return;
    var closed = false;
    try { closed = presenterWin.closed; } catch (e) { closed = false; }
    if (closed) { presenterWin = null; return; }
    var msg = {
      type: MSG + ':state', source: 'deck',
      idx: idx, anchor: anchors[idx] || (slides[idx] && slides[idx].id) || '',
      total: total,
      seg: segs[idx] || '', segName: segNames[idx] || '',
      title: titles[idx] || '',
      prevTitle: idx > 0 ? (titles[idx - 1] || '') : '',
      nextTitle: idx < total - 1 ? (titles[idx + 1] || '') : ''
    };
    try { presenterWin.postMessage(msg, '*'); } catch (e) {}
  }

  function heartbeat() {
    if (!presenterWin) return;
    try { if (presenterWin.closed) { presenterWin = null; return; } } catch (e) {}
    postState(); // resending state doubles as a keep-alive / reload recovery
  }

  function onMessage(e) {
    var d = e && e.data; if (!d || typeof d !== 'object') return;
    if (d.source === 'deck') return;               // ignore our own echoes
    if (d.type === MSG + ':hello') { if (e.source) presenterWin = e.source; postState(); }
    else if (d.type === MSG + ':jump' && typeof d.idx === 'number') { go(d.idx); }
  }
})();
