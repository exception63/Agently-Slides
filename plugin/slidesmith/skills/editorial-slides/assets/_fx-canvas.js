/* ════════════════════════════════════════════════════════════════════
   _fx-canvas.js · Slidesmith 动画库「J · Canvas 特效」（移植自 html-ppt-skill, MIT）
   零依赖 canvas2D 特效，读本项目主题色（--accent/--accent-2/--ink），生命周期托管：
   元素加 data-fx="名"，翻到该页(.slide.active)即跑、离开就 stop()（自带 MutationObserver）。
   也供 gallery/animations.html 直接调 window.HPX[name](stageEl)。编号见 references/animations.md（J 类）。
   ════════════════════════════════════════════════════════════════════ */
(function () {
  window.HPX = window.HPX || {};
  var U = window.HPX._u = {};
  U.css = function (el, name, fb) { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fb; };
  U.accent = function (el, fb) { return U.css(el, '--accent', fb || '#7c5cff'); };
  U.accent2 = function (el, fb) { return U.css(el, '--accent-2', U.css(el, '--accent', fb || '#22d3ee')); };
  U.text = function (el, fb) { return U.css(el, '--ink', U.css(el, '--text-1', fb || '#eaeaf2')); };
  U.palette = function (el) {
    var a = U.accent(el, '#7c5cff'), b = U.accent2(el, '#22d3ee');
    return [a, b, U.css(el, '--accent-3', a), U.css(el, '--accent-2', b), U.css(el, '--ink', '#e7e7ef')];
  };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.canvas = function (el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var c = document.createElement('canvas');
    c.className = 'sm-fx-canvas';
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;z-index:0;';
    el.insertBefore(c, el.firstChild);  // 作背景：放最前 → 后面的正文内容自然盖在 canvas 之上
    var ctx = c.getContext('2d');
    var w = 0, h = 0, dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var fit = function () {
      var r = el.getBoundingClientRect();
      w = Math.max(1, r.width | 0); h = Math.max(1, r.height | 0);
      c.width = (w * dpr) | 0; c.height = (h * dpr) | 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    var ro = null; try { ro = new ResizeObserver(fit); ro.observe(el); } catch (e) {}
    return { c: c, ctx: ctx, get w() { return w; }, get h() { return h; }, get dpr() { return dpr; },
      destroy: function () { try { ro && ro.disconnect(); } catch (e) {} if (c.parentNode) c.parentNode.removeChild(c); } };
  };
  U.loop = function (fn) {
    var raf = 0, stopped = false, t0 = performance.now();
    var tick = function (t) { if (stopped) return; fn((t - t0) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return function () { stopped = true; cancelAnimationFrame(raf); };
  };

  var H = window.HPX;

  // ── J1 极光团 gradient-blob（满屏 · 加性模糊渐变 · Stripe/Linear 高级感）──
  H['gradient-blob'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, pal = U.palette(el);
    var blobs = []; for (var i = 0; i < 4; i++) blobs.push({ x: U.rand(0, 1), y: U.rand(0, 1), vx: U.rand(-0.08, 0.08), vy: U.rand(-0.08, 0.08), r: U.rand(180, 320), c: pal[i % pal.length] });
    var hex2rgb = function (h) { var m = String(h).replace('#', '').match(/.{2}/g); return m ? m.map(function (x) { return parseInt(x, 16); }) : [124, 92, 255]; };
    var stop = U.loop(function (t) {
      ctx.fillStyle = 'rgba(10,12,22,0.2)'; ctx.fillRect(0, 0, k.w, k.h);
      ctx.globalCompositeOperation = 'lighter';
      for (var n = 0; n < blobs.length; n++) {
        var b = blobs[n]; b.x += b.vx * 0.01; b.y += b.vy * 0.01;
        if (b.x < 0 || b.x > 1) b.vx *= -1; if (b.y < 0 || b.y > 1) b.vy *= -1;
        var px = b.x * k.w, py = b.y * k.h, r = b.r + Math.sin(t * 0.8 + b.x * 6) * 30, rgb = hex2rgb(b.c);
        var g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.55)'); g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J2 星座连线 constellation（满屏 · 漂移点 + 近邻连线）──
  H['constellation'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, ac = U.accent(el, '#9fb4ff'), N = 70, pts = [], lw = k.w, lh = k.h;
    var seed = function () { pts = []; for (var i = 0; i < N; i++) pts.push({ x: Math.random() * k.w, y: Math.random() * k.h, vx: U.rand(-0.3, 0.3), vy: U.rand(-0.3, 0.3) }); };
    seed();
    var stop = U.loop(function () {
      if (k.w !== lw || k.h !== lh) { seed(); lw = k.w; lh = k.h; }
      ctx.clearRect(0, 0, k.w, k.h);
      for (var i = 0; i < N; i++) { var p = pts[i]; p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > k.w) p.vx *= -1; if (p.y < 0 || p.y > k.h) p.vy *= -1; }
      for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) { var pa = pts[a], pb = pts[b], d = Math.hypot(pa.x - pb.x, pa.y - pb.y); if (d < 150) { ctx.globalAlpha = 1 - d / 150; ctx.strokeStyle = ac; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); } }
      ctx.globalAlpha = 1; ctx.fillStyle = ac;
      for (var q = 0; q < N; q++) { ctx.beginPath(); ctx.arc(pts[q].x, pts[q].y, 1.8, 0, Math.PI * 2); ctx.fill(); }
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J3 知识图谱 knowledge-graph（面板 · 力导向 + 标签节点）──
  H['knowledge-graph'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, pal = U.palette(el), tx = U.text(el, '#e7e7ef');
    var labels = (el.getAttribute('data-fx-labels') || 'AI,ML,LLM,Graph,Node,Edge,Claude,GPT,RAG,Vector,Embed,Neural,Agent,Tool,Memory,Logic,Data,Train,Infer,Token,Prompt,Chain,Plan,Skill,Cloud,GPU,Code,Task').split(',');
    var N = 28, nodes = [], i;
    for (i = 0; i < N; i++) nodes.push({ x: U.rand(40, 300), y: U.rand(40, 200), vx: 0, vy: 0, label: labels[i % labels.length], c: pal[i % pal.length] });
    var edges = [], made = {};
    while (edges.length < 50) { var a = (Math.random() * N) | 0, b = (Math.random() * N) | 0; if (a === b) continue; var key = a < b ? a + '-' + b : b + '-' + a; if (made[key]) continue; made[key] = 1; edges.push([a, b]); }
    var stop = U.loop(function () {
      for (i = 0; i < N; i++) for (var j = i + 1; j < N; j++) { var na = nodes[i], nb = nodes[j], dx = nb.x - na.x, dy = nb.y - na.y, d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1; var d = Math.sqrt(d2), f = 1600 / d2, fx = (dx / d) * f, fy = (dy / d) * f; na.vx -= fx; na.vy -= fy; nb.vx += fx; nb.vy += fy; }
      for (var e = 0; e < edges.length; e++) { var ea = nodes[edges[e][0]], eb = nodes[edges[e][1]], edx = eb.x - ea.x, edy = eb.y - ea.y, ed = Math.hypot(edx, edy) || 1, ef = (ed - 90) * 0.008, efx = (edx / ed) * ef, efy = (edy / ed) * ef; ea.vx += efx; ea.vy += efy; eb.vx -= efx; eb.vy -= efy; }
      var cx = k.w / 2, cy = k.h / 2;
      for (i = 0; i < N; i++) { var n = nodes[i]; n.vx += (cx - n.x) * 0.002; n.vy += (cy - n.y) * 0.002; n.vx *= 0.85; n.vy *= 0.85; n.x += n.vx; n.y += n.vy; }
      ctx.clearRect(0, 0, k.w, k.h); ctx.strokeStyle = 'rgba(180,180,220,0.25)'; ctx.lineWidth = 1;
      for (e = 0; e < edges.length; e++) { var a2 = nodes[edges[e][0]], b2 = nodes[edges[e][1]]; ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); }
      ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = 0; i < N; i++) { var nn = nodes[i]; ctx.fillStyle = nn.c; ctx.beginPath(); ctx.arc(nn.x, nn.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = tx; ctx.fillText(nn.label, nn.x, nn.y - 14); }
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J4 神经网络 neural-net（面板 · 前馈网 + 脉冲传播）──
  H['neural-net'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, ac = U.accent(el, '#7c5cff'), ac2 = U.accent2(el, '#22d3ee');
    var layers = [4, 6, 6, 3], nodes = [], edges = [], pulses = [], lw = k.w, lh = k.h, last = 0;
    var layout = function () {
      nodes = []; var pad = 40, cw = k.w - pad * 2, ch = k.h - pad * 2, L, i;
      for (L = 0; L < layers.length; L++) { var x = pad + (cw * L / (layers.length - 1)), nn = layers[L]; for (i = 0; i < nn; i++) nodes.push({ x: x, y: pad + (ch * (i + 0.5) / nn), L: L, i: i }); }
      edges = [];
      for (L = 0; L < layers.length - 1; L++) { var aa = nodes.filter(function (n) { return n.L === L; }), bb = nodes.filter(function (n) { return n.L === L + 1; }); for (var p = 0; p < aa.length; p++) for (var q = 0; q < bb.length; q++) edges.push([nodes.indexOf(aa[p]), nodes.indexOf(bb[q])]); }
    };
    layout();
    var stop = U.loop(function (t) {
      if (k.w !== lw || k.h !== lh) { layout(); lw = k.w; lh = k.h; }
      ctx.clearRect(0, 0, k.w, k.h); ctx.strokeStyle = 'rgba(160,160,200,0.22)'; ctx.lineWidth = 1;
      for (var e = 0; e < edges.length; e++) { var a = nodes[edges[e][0]], b = nodes[edges[e][1]]; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      if (t - last > 0.25) { last = t; var starts = nodes.filter(function (n) { return n.L === 0; }); pulses.push({ node: starts[(Math.random() * starts.length) | 0], L: 0, t: 0 }); }
      pulses = pulses.filter(function (p) { return p.L < layers.length - 1; });
      for (var pi = 0; pi < pulses.length; pi++) {
        var p2 = pulses[pi];
        if (!p2.target) { var next = nodes.filter(function (n) { return n.L === p2.L + 1; }); p2.target = next[(Math.random() * next.length) | 0]; }
        p2.t += 0.04; var x = p2.node.x + (p2.target.x - p2.node.x) * Math.min(1, p2.t), y = p2.node.y + (p2.target.y - p2.node.y) * Math.min(1, p2.t);
        ctx.fillStyle = ac2; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        if (p2.t >= 1) { p2.node = p2.target; p2.target = null; p2.L++; p2.t = 0; }
      }
      for (var ni = 0; ni < nodes.length; ni++) { var nd = nodes[ni]; ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(nd.x, nd.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ac2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(nd.x, nd.y, 8, 0, Math.PI * 2); ctx.stroke(); }
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J5 数字爆炸 counter-explosion（一次性 · 数字滚动 + 粒子爆，KPI 揭晓）──
  H['counter-explosion'] = function (el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var target = parseInt(el.getAttribute('data-fx-to') || '2400', 10), k = U.canvas(el), ctx = k.ctx, pal = U.palette(el);
    var num = document.createElement('div');
    num.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 110px system-ui,sans-serif;color:var(--ink,#fff);pointer-events:none;';
    num.textContent = '0'; el.appendChild(num);
    var parts = [], state = 'count', stateT = 0;
    var burst = function () { var cx = k.w / 2, cy = k.h / 2; for (var i = 0; i < 120; i++) { var a = Math.random() * Math.PI * 2, s = U.rand(120, 400); parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, r: U.rand(2, 5), c: pal[(Math.random() * pal.length) | 0] }); } };
    var stop = U.loop(function () {
      ctx.clearRect(0, 0, k.w, k.h); var dt = 1 / 60; stateT += dt;
      if (state === 'count') { var p = Math.min(1, stateT / 2.2), eased = 1 - Math.pow(1 - p, 3); num.textContent = Math.round(target * eased).toLocaleString(); if (p >= 1) { state = 'burst'; stateT = 0; burst(); } }
      else if (state === 'burst') { if (stateT > 2.5) { state = 'hold'; stateT = 0; } }
      else if (state === 'hold') { if (stateT > 1.5) { state = 'count'; stateT = 0; num.textContent = '0'; } }
      parts = parts.filter(function (p) { return p.life > 0; });
      for (var i = 0; i < parts.length; i++) { var pt = parts[i]; pt.vy += 260 * dt; pt.vx *= 0.985; pt.vy *= 0.985; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= 0.01; ctx.globalAlpha = Math.max(0, pt.life); ctx.fillStyle = pt.c; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    return { stop: function () { stop(); k.destroy(); if (num.parentNode) num.parentNode.removeChild(num); } };
  };

  // ── J6 粒子迸发 particle-burst（一次性 · 中心爆开）──
  H['particle-burst'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, pal = U.palette(el), parts = [], lastSpawn = 0;
    var spawn = function () { var cx = k.w / 2, cy = k.h / 2; for (var i = 0; i < 90; i++) { var a = Math.random() * Math.PI * 2, s = U.rand(80, 260); parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, r: U.rand(2, 5), c: pal[(Math.random() * pal.length) | 0] }); } };
    spawn();
    var stop = U.loop(function (t) {
      ctx.clearRect(0, 0, k.w, k.h); if (t - lastSpawn > 2.5) { spawn(); lastSpawn = t; } var dt = 1 / 60;
      parts = parts.filter(function (p) { return p.life > 0; });
      for (var i = 0; i < parts.length; i++) { var p = parts[i]; p.vy += 220 * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 0.012; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J7 冲击波 shockwave（一次性 · 同心圆扩散 + 核心光）──
  H['shockwave'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, ac = U.accent(el, '#7c5cff'), ac2 = U.accent2(el, '#22d3ee'), waves = [], last = -1;
    var stop = U.loop(function (t) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, k.w, k.h);
      if (t - last > 0.6) { last = t; waves.push({ t: 0 }); }
      var cx = k.w / 2, cy = k.h / 2, max = Math.hypot(k.w, k.h) / 2;
      waves = waves.filter(function (w) { return w.t < 1; });
      for (var i = 0; i < waves.length; i++) { var w = waves[i]; w.t += 0.012; var r = w.t * max, alpha = 1 - w.t; ctx.strokeStyle = w.t < 0.5 ? ac2 : ac; ctx.globalAlpha = alpha; ctx.lineWidth = 3 + (1 - w.t) * 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.globalAlpha = alpha * 0.4; ctx.beginPath(); ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(124,92,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J8 星空穿越 starfield（满屏暗底 · 3D 飞星）──
  H['starfield'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, tx = U.text(el, '#ffffff'), N = 260, stars = [];
    for (var i = 0; i < N; i++) stars.push({ x: U.rand(-1, 1), y: U.rand(-1, 1), z: Math.random() });
    var stop = U.loop(function () {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, k.w, k.h); var cx = k.w / 2, cy = k.h / 2;
      for (var j = 0; j < N; j++) { var s = stars[j]; s.z -= 0.006; if (s.z <= 0.02) { s.x = U.rand(-1, 1); s.y = U.rand(-1, 1); s.z = 1; } var px = cx + (s.x / s.z) * cx, py = cy + (s.y / s.z) * cy; if (px < 0 || py < 0 || px > k.w || py > k.h) continue; ctx.globalAlpha = 1 - s.z; ctx.fillStyle = tx; ctx.beginPath(); ctx.arc(px, py, (1 - s.z) * 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J9 星系漩涡 galaxy-swirl（满屏暗底 · 对数螺旋）──
  H['galaxy-swirl'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, pal = U.palette(el), N = 800, parts = [];
    for (var i = 0; i < N; i++) { var arm = i % 3, r = Math.random() * 180 + 8; parts.push({ r: r, a: (arm / 3) * Math.PI * 2 + Math.log(r + 1) * 1.6 + U.rand(-0.2, 0.2), c: pal[arm % pal.length], s: U.rand(0.8, 2.2) }); }
    var stop = U.loop(function (t) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, 0, k.w, k.h); var cx = k.w / 2, cy = k.h / 2;
      for (var j = 0; j < N; j++) { var p = parts[j], a = p.a + t * 0.15; ctx.fillStyle = p.c; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * p.r, cy + Math.sin(a) * p.r * 0.7, p.s, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J10 矩阵雨 matrix-rain（满屏暗底 · 落码，黑客风）──
  H['matrix-rain'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF'.split(''), fs = 16, cols = 0, drops = [], lw = k.w, lh = k.h;
    var init = function () { cols = Math.ceil(k.w / fs); drops = []; for (var i = 0; i < cols; i++) drops.push(U.rand(-20, 0)); };
    init();
    var stop = U.loop(function () {
      if (k.w !== lw || k.h !== lh) { init(); lw = k.w; lh = k.h; }
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 0, k.w, k.h); ctx.font = fs + 'px monospace';
      for (var i = 0; i < cols; i++) { var ch = glyphs[(Math.random() * glyphs.length) | 0], x = i * fs, y = drops[i] * fs; ctx.fillStyle = '#9fffc9'; ctx.fillText(ch, x, y); ctx.fillStyle = '#00ff6a'; ctx.fillText(ch, x, y - fs); drops[i] += 1; if (y > k.h && Math.random() > 0.975) drops[i] = 0; }
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J11 数据流 data-stream（满屏暗底 · 滚动二进制/十六进制）──
  H['data-stream'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, ac = U.accent(el, '#22d3ee'), ac2 = U.accent2(el, '#7c5cff'), rows = [], rh = 22, lh = k.h;
    var genRow = function (y) { var text = []; for (var i = 0; i < 120; i++) { var r = Math.random(); text.push(r < 0.3 ? (Math.random() < 0.5 ? '0' : '1') : r < 0.6 ? '0x' + Math.floor(Math.random() * 256).toString(16) : Math.random().toString(16).slice(2, 6)); } return { y: y, dir: Math.random() < 0.5 ? -1 : 1, speed: U.rand(30, 90), offset: Math.random() * 2000, text: text.join(' ') }; };
    var init = function () { rows.length = 0; var n = Math.ceil(k.h / rh); for (var i = 0; i < n; i++) rows.push(genRow(i * rh + rh * 0.7)); };
    init();
    var stop = U.loop(function (t) {
      if (k.h !== lh) { init(); lh = k.h; }
      ctx.fillStyle = 'rgba(5,8,14,0.35)'; ctx.fillRect(0, 0, k.w, k.h); ctx.font = '13px ui-monospace,Menlo,monospace';
      for (var i = 0; i < rows.length; i++) { var r = rows[i], x = r.dir > 0 ? ((t * r.speed + r.offset) % (k.w + 400)) - 400 : k.w - (((t * r.speed + r.offset) % (k.w + 400)) - 400); ctx.fillStyle = (i % 3 === 0) ? ac : ac2; ctx.globalAlpha = 0.65 + (i % 2) * 0.3; ctx.fillText(r.text, x, r.y); }
      ctx.globalAlpha = 1;
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J12 礼花炮 confetti-cannon（庆祝 · 两侧喷彩纸）──
  H['confetti-cannon'] = function (el) {
    var k = U.canvas(el), ctx = k.ctx, pal = U.palette(el), parts = [], last = 0;
    var fire = function () { for (var side = 0; side < 2; side++) { var x0 = side === 0 ? 20 : k.w - 20, y0 = k.h - 20; for (var i = 0; i < 40; i++) { var a = side === 0 ? U.rand(-Math.PI * 0.7, -Math.PI * 0.4) : U.rand(-Math.PI * 0.6, -Math.PI * 0.3) - Math.PI / 2 - Math.PI / 6, spd = U.rand(300, 520); parts.push({ x: x0, y: y0, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, w: U.rand(6, 12), h: U.rand(3, 7), rot: Math.random() * Math.PI, vr: U.rand(-6, 6), c: pal[(Math.random() * pal.length) | 0], life: 1 }); } } };
    fire();
    var stop = U.loop(function (t) {
      ctx.clearRect(0, 0, k.w, k.h); if (t - last > 3) { fire(); last = t; } var dt = 1 / 60;
      parts = parts.filter(function (p) { return p.life > 0 && p.y < k.h + 40; });
      for (var i = 0; i < parts.length; i++) { var p = parts[i]; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= 0.006; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
      ctx.globalAlpha = 1;
    });
    return { stop: function () { stop(); k.destroy(); } };
  };

  // ── J13 多行打字机 typewriter-multi（文字 · 终端/启动日志，纯 DOM）──
  H['typewriter-multi'] = function (el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var lines = [el.getAttribute('data-fx-line1') || '> initializing knowledge graph...', el.getAttribute('data-fx-line2') || '> loading 28 concept nodes', el.getAttribute('data-fx-line3') || '> agent ready. awaiting prompt_'];
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:32px 48px;font:600 22px ui-monospace,Menlo,monospace;color:var(--ink,#e7e7ef);';
    el.appendChild(wrap);
    if (!document.getElementById('hpx-blink-kf')) { var st = document.createElement('style'); st.id = 'hpx-blink-kf'; st.textContent = '@keyframes hpxBlink{50%{opacity:0}}'; document.head.appendChild(st); }
    var stopped = false, speeds = [55, 70, 45];
    var rows = lines.map(function (txt, idx) {
      var row = document.createElement('div'); row.style.cssText = 'white-space:pre;display:flex;align-items:center;';
      var span = document.createElement('span'); span.textContent = '';
      var cur = document.createElement('span'); cur.textContent = '█'; cur.style.cssText = 'display:inline-block;margin-left:2px;color:var(--accent,#22d3ee);animation:hpxBlink 1s steps(2) infinite;';
      row.appendChild(span); row.appendChild(cur); wrap.appendChild(row);
      return { span: span, txt: txt, i: 0, idx: idx };
    });
    rows.forEach(function (r) {
      var tick = function () { if (stopped) return; if (r.i < r.txt.length) { r.span.textContent += r.txt[r.i++]; setTimeout(tick, speeds[r.idx]); } else { setTimeout(function () { if (stopped) return; r.i = 0; r.span.textContent = ''; tick(); }, 2200); } };
      setTimeout(tick, r.idx * 400);
    });
    return { stop: function () { stopped = true; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
  };

  // ── 生命周期：翻到 .slide.active 即 init data-fx，离开即 stop（自带，不依赖 SMFX）──
  var active = window.__smfxActive = window.__smfxActive || new Map();
  // collect [data-fx] descendants PLUS root itself — a full-slide effect lives on the .slide
  // element (documented usage: 满屏加 .slide 上), which querySelectorAll alone would miss.
  function fxEls(root) {
    var els = [].slice.call(root.querySelectorAll('[data-fx]'));
    if (root.matches && root.matches('[data-fx]')) els.unshift(root);
    return els;
  }
  function initIn(root) {
    if (!root) return;
    fxEls(root).forEach(function (el) {
      if (active.has(el)) return;
      var fn = H[el.getAttribute('data-fx')];
      if (typeof fn !== 'function') return;
      try { active.set(el, fn(el, {}) || { stop: function () {} }); } catch (e) {}
    });
  }
  function stopIn(root) {
    if (!root) return;
    fxEls(root).forEach(function (el) {
      var h = active.get(el); if (h && h.stop) { try { h.stop(); } catch (e) {} } active.delete(el);
    });
  }
  window.__smfxCanvas = { initIn: initIn, stopIn: stopIn };
  function boot() {
    var slides = document.querySelectorAll('#deck .slide');
    if (!slides.length) return;
    // Drive the lifecycle off VISIBILITY, which unifies both modes:
    //  · present/export — only the active slide is displayed (others display:none) → it alone runs
    //  · deck-scroll / Studio edit — whatever slide is scrolled into view runs (no .active needed)
    var io = null;
    try {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.1) initIn(e.target); else stopIn(e.target); });
      }, { threshold: [0, 0.12, 0.5] });
    } catch (e) {}
    if (io) {
      slides.forEach(function (sl) { io.observe(sl); });
    } else {
      // fallback (no IntersectionObserver): original .active-based lifecycle
      slides.forEach(function (sl) {
        try { new MutationObserver(function () { if (sl.classList.contains('active')) initIn(sl); else stopIn(sl); }).observe(sl, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
      });
    }
    var act = document.querySelector('#deck .slide.active'); if (act) initIn(act);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
