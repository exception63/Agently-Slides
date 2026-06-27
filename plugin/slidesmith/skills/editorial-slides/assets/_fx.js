/* ════════════════════════════════════════════════════════════════════
   _fx.js · Slidesmith 动画引擎（与 _fx.css 配套 · 编号见 references/animations.md）
   暴露 window.SMFX，供 _engine.js 在导航处可选调用（_engine 没装 _fx 时全是 no-op）：
     SMFX.onActive(slide)        翻到某页 → 播入场 [data-anim] + 强调 [data-emph] + 点睛
     SMFX.transition(apply,next) 翻页时包一层（神奇移动 data-morph 走 View Transitions / FLIP）
     SMFX.stepForward(slide)     该页还有未点出的 .fragment → 点出下一条并返回 true（吃掉这次翻页）
     SMFX.stepBack(slide)        该页有已点出的 .fragment → 收回上一条并返回 true
   全部防御式：结构缺失就安静跳过。尊重 prefers-reduced-motion。
   ════════════════════════════════════════════════════════════════════ */
(function () {
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var hasVT = typeof document.startViewTransition === 'function';

  /* —— 入场/强调：翻到该页时重播 —— */
  function onActive(slide) {
    if (!slide) return;
    // 复位再播（移除 go → 强制 reflow → 加 arm+go）
    slide.classList.remove('smfx-go', 'smfx-exit');
    slide.classList.add('smfx-arm');
    void slide.offsetWidth;                 // reflow，让动画能重播
    requestAnimationFrame(function () {
      slide.classList.add('smfx-go');
    });
    resetFragments(slide);
  }

  /* —— 离场：返回承诺，播完 data-anim-out 再继续（_engine 可不等）—— */
  function playExit(slide, ms) {
    if (!slide || reduce || !slide.querySelector('[data-anim-out]')) return Promise.resolve();
    slide.classList.add('smfx-exit');
    return new Promise(function (res) { setTimeout(res, ms || 460); });
  }

  /* ───────── 分步揭示 fragments ───────── */
  function fragsOf(slide) {
    return Array.prototype.slice.call(slide.querySelectorAll('.fragment'));
  }
  // 返回去重排序后的步序：每个 fragment 的 data-fragment-index（缺省=DOM 顺序），同序号同步出现
  function fragSteps(slide) {
    var frags = fragsOf(slide);
    var order = frags.map(function (f, i) {
      var idx = f.dataset.fragmentIndex;
      return { f: f, key: (idx === undefined || idx === '') ? (1000 + i) : parseInt(idx, 10) };
    });
    var keys = order.map(function (o) { return o.key; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    keys.sort(function (a, b) { return a - b; });
    return { order: order, keys: keys };
  }
  function applyFragState(slide, step) {
    var s = fragSteps(slide); slide.__fstep = step;
    s.order.forEach(function (o) {
      var rank = s.keys.indexOf(o.key);          // 该条属于第几步（0 起）
      var f = o.f;
      f.classList.toggle('smfx-vis', rank < step);
      // current-visible：只在“正好这一步”可见
      if (f.classList.contains('current-visible')) {
        f.classList.toggle('smfx-vis', rank === step - 1);
      }
      // semi-out：点出后、再往后走则变暗
      if (f.classList.contains('semi-out')) {
        f.classList.toggle('smfx-dim', rank < step - 1);
      }
    });
  }
  function resetFragments(slide) {
    if (!slide.querySelector('.fragment')) return;
    applyFragState(slide, reduce ? 999 : 0);     // 减少动态时直接全显
  }
  function stepForward(slide) {
    if (!slide || reduce) return false;
    var s = fragSteps(slide); if (!s.keys.length) return false;
    var cur = slide.__fstep || 0;
    if (cur >= s.keys.length) return false;       // 没有更多步 → 放行翻页
    applyFragState(slide, cur + 1); return true;
  }
  function stepBack(slide) {
    if (!slide || reduce) return false;
    var s = fragSteps(slide); if (!s.keys.length) return false;
    var cur = slide.__fstep || 0;
    if (cur <= 0) return false;
    applyFragState(slide, cur - 1); return true;
  }

  /* ───────── 神奇移动 Magic Move（data-morph）───────── */
  function morphMap(slide) {
    var m = {};
    if (!slide) return m;
    slide.querySelectorAll('[data-morph]').forEach(function (el) { m[el.getAttribute('data-morph')] = el; });
    return m;
  }
  // 给两页中“同 data-morph”的元素配上同一个 view-transition-name；返回清理函数
  function tagMorphPairs(oldSlide, newSlide) {
    var a = morphMap(oldSlide), b = morphMap(newSlide), tagged = [];
    Object.keys(a).forEach(function (id) {
      if (b[id]) {
        var name = 'smfx-morph-' + id.replace(/[^a-zA-Z0-9_-]/g, '');
        a[id].style.viewTransitionName = name;
        b[id].style.viewTransitionName = name;
        tagged.push(a[id], b[id]);
      }
    });
    return function clear() { tagged.forEach(function (el) { el.style.viewTransitionName = ''; }); };
  }
  // FLIP 兜底：不支持 View Transitions 时，手动把配对元素从旧位置补间到新位置
  function flipPairs(oldSlide, newSlide, applyFn) {
    var a = morphMap(oldSlide), b = morphMap(newSlide), firsts = {};
    Object.keys(a).forEach(function (id) { if (b[id]) firsts[id] = a[id].getBoundingClientRect(); });
    applyFn();
    Object.keys(firsts).forEach(function (id) {
      var first = firsts[id], el = b[id], last = el.getBoundingClientRect();
      var dx = first.left - last.left, dy = first.top - last.top;
      var sx = last.width ? first.width / last.width : 1, sy = last.height ? first.height / last.height : 1;
      try {
        el.animate(
          [{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' }, { transform: 'none' }],
          { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } catch (e) {}
    });
  }

  /* —— 翻页包装：有配对的 data-morph 用 VT/FLIP 做神奇移动；否则原生淡变或瞬切 —— */
  function transition(applyFn, newSlide) {
    var oldSlide = document.querySelector('#deck .slide.active');
    var hasMorph = oldSlide && newSlide &&
      Object.keys(morphMap(oldSlide)).some(function (id) { return morphMap(newSlide)[id]; });

    if (reduce) { applyFn(); return; }

    if (hasVT) {
      var clear = hasMorph ? tagMorphPairs(oldSlide, newSlide) : function () {};
      var vt = document.startViewTransition(function () { applyFn(); });
      if (vt && vt.finished && vt.finished.finally) vt.finished.finally(clear);
      else setTimeout(clear, 700);
      return;
    }
    // 无 View Transitions：有 morph 走 FLIP，否则直接切（入场动画补足观感）
    if (hasMorph) { flipPairs(oldSlide, newSlide, applyFn); return; }
    applyFn();
  }

  /* ───────── 点睛初始化（线条自绘已纯 CSS；这里给没写 pathLength 的 path 补救）───────── */
  function initAccents(root) {
    (root || document).querySelectorAll('.smfx-draw path:not([pathLength]), .smfx-draw polyline:not([pathLength])').forEach(function (p) {
      try {
        var len = p.getTotalLength();
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      } catch (e) {}
    });
  }

  window.SMFX = {
    onActive: onActive,
    transition: transition,
    stepForward: stepForward,
    stepBack: stepBack,
    playExit: playExit,
    initAccents: initAccents,
    applyFragState: applyFragState,
    hasViewTransitions: hasVT
  };

  if (document.readyState !== 'loading') initAccents();
  else document.addEventListener('DOMContentLoaded', function () { initAccents(); });
})();
