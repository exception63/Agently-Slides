/* ════════════════════════════════════════════════════════════════════
   自配置引擎 · 与风格无关 · 所有皮肤共用 · 不用改这里
   它会：① 从各 slide 的 data-seg 自动建段导航 + 缩略图 + 计数
        ② 自动注入页脚 chrome（段名 + 页码）
        ③ 自动取每张标题给副屏用
        ④ 翻页广播给"演讲者模式.html"（配 slides-presenter-mode skill）
   皮肤只通过 CSS（:root 令牌 + 组件样式）改外观，引擎逻辑不变。
   ════════════════════════════════════════════════════════════════════ */
(function () {
  /* —— 每套 slides 改这里：广播频道名要唯一（避免多份 slides 串台）+ 副屏文件名 —— */
  const CONFIG = { channel: '{{CHANNEL}}', presenterFile: '演讲者模式.html' };

  const deck = document.getElementById('deck');
  const slides = Array.from(deck.querySelectorAll(':scope > .slide'));
  const total = slides.length;
  const body = document.body;
  const segOf = s => parseInt(s.dataset.seg || '0', 10);

  // —— 段名 / 计数 / 起始索引（全自动）——
  const segName = [], segCount = [];
  slides.forEach(s => {
    const g = segOf(s);
    if (segName[g] === undefined) segName[g] = s.dataset.segname || ('段 ' + g);
    segCount[g] = (segCount[g] || 0) + 1;
  });
  const segShort = segName.map((n, g) => (n || ('段 ' + g)).replace(/^段\s*\d+\s*·?\s*/, '') || ('段 ' + g));
  const segStarts = []; let _acc = 0; segCount.forEach((c, i) => { segStarts[i] = _acc; _acc += (c || 0); });

  // —— 包 wrap + 注入 chrome 页脚 ——
  slides.forEach((s, i) => {
    s.dataset.globalIdx = i;
    const wrap = document.createElement('div'); wrap.className = 'slide-wrap';
    s.parentNode.insertBefore(wrap, s); wrap.appendChild(s);
    if (!s.querySelector('.chrome')) {
      const g = segOf(s);
      const div = document.createElement('div'); div.className = 'chrome';
      div.innerHTML = `<div class="chrome__l"><span class="chrome__seg">${s.dataset.segname || segName[g]}</span></div>`
        + `<div class="chrome__r">${String(i + 1).padStart(3, '0')} / ${String(total).padStart(3, '0')}</div>`;
      s.appendChild(div);
    }
  });

  // —— 自动建段导航 ——
  const segnav = document.getElementById('segnav');
  segCount.forEach((c, g) => {
    const seg = document.createElement('div'); seg.className = 'segnav__seg'; seg.dataset.seg = g;
    seg.innerHTML = `<button class="segnav__head" type="button">`
      + `<span class="segnav__head-id">段 ${g}</span>`
      + `<span class="segnav__head-name">${segShort[g]}</span>`
      + `<span class="segnav__head-meta">${c} 张</span>`
      + `<span class="segnav__head-arrow">▸</span></button>`
      + `<div class="segnav__thumbs" data-seg-thumbs="${g}"></div>`;
    segnav.appendChild(seg);
  });

  // —— 缩略图（克隆 slide）——
  slides.forEach((s, i) => {
    const container = document.querySelector(`[data-seg-thumbs="${segOf(s)}"]`);
    if (!container) return;
    const thumb = document.createElement('div'); thumb.className = 'thumb'; thumb.dataset.idx = i;
    const inner = s.cloneNode(true); inner.classList.add('thumb__inner'); inner.classList.remove('active');
    const ch = inner.querySelector('.chrome'); if (ch) ch.remove();
    thumb.appendChild(inner);
    const num = document.createElement('div'); num.className = 'thumb__num'; num.textContent = (i + 1);
    thumb.appendChild(num);
    thumb.addEventListener('click', e => { e.stopPropagation(); setActive(i); });
    container.appendChild(thumb);
  });

  // —— 段导航折叠 ——
  document.querySelectorAll('.segnav__head').forEach(btn =>
    btn.addEventListener('click', () => btn.closest('.segnav__seg').classList.toggle('segnav__seg--expanded')));
  const firstSeg = document.querySelector('.segnav__seg'); if (firstSeg) firstSeg.classList.add('segnav__seg--expanded');

  // —— 副屏标题（自动取标题文本，可被 data-title 覆盖）——
  function deriveTitle(s) {
    if (s.dataset.title) return s.dataset.title;
    const el = s.querySelector('.cover__title,.secdiv__title,.manifesto__title,.insight__statement,.bigq__t,.head__title,.title,h1,h2,h3');
    return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : ('slide ' + (slides.indexOf(s) + 1));
  }
  const SLIDE_TITLES = slides.map(deriveTitle);
  // 副屏锚点：优先用全局 window.SLIDE_MAP（slides-presenter-mode 注入），否则自动 s{seg}-{段内序号}
  const segRun = [];
  const SLIDE_MAP = (window.SLIDE_MAP && window.SLIDE_MAP.length === total) ? window.SLIDE_MAP
    : slides.map(s => { const g = segOf(s); segRun[g] = (segRun[g] || 0) + 1; return `s${g}-${segRun[g]}`; });

  // —— 状态 + UI ——
  const curSegEl = document.getElementById('curSeg'), curIdxEl = document.getElementById('curIdx'),
        totalIdxEl = document.getElementById('totalIdx'), progressBar = document.getElementById('progressBar');
  totalIdxEl.textContent = total;
  let idx = 0, present = false;

  // —— 演讲者模式广播（BroadcastChannel + localStorage 双通道）——
  let channel = null; try { channel = new BroadcastChannel(CONFIG.channel); } catch (e) {}
  let presenterWindow = null;
  function broadcastPresenter(i) {
    const p = { slideIdx: i, total, segment: segOf(slides[i]), anchor: SLIDE_MAP[i] || ('s0-1'),
      title: SLIDE_TITLES[i] || '', prevTitle: i > 0 ? SLIDE_TITLES[i - 1] : '',
      nextTitle: i < total - 1 ? SLIDE_TITLES[i + 1] : '', ts: Date.now(), source: 'slides' };
    if (channel) { try { channel.postMessage(p); } catch (e) {} }
    try { localStorage.setItem(CONFIG.channel + '-state', JSON.stringify(p)); } catch (e) {}
  }
  function handleReverseJump(p) {
    if (!p || p.type !== 'jump-to-slide' || p.source !== 'presenter' || typeof p.slideIdx !== 'number') return;
    const t = Math.max(0, Math.min(total - 1, p.slideIdx)); if (t !== idx) setActive(t);
  }
  if (channel) { channel.onmessage = e => { if (e && e.data && e.data.type === 'jump-to-slide') handleReverseJump(e.data); }; }
  window.addEventListener('storage', e => { if (e.key === CONFIG.channel + '-jump' && e.newValue) { try { handleReverseJump(JSON.parse(e.newValue)); } catch (x) {} } });
  function openPresenter() {
    if (presenterWindow && !presenterWindow.closed) { presenterWindow.focus(); broadcastPresenter(idx); return; }
    presenterWindow = window.open(CONFIG.presenterFile, 'presenter', 'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no');
    if (!presenterWindow) { alert('副屏窗口被阻止 · 请允许弹窗后再试。\n（演讲者模式需先用 slides-presenter-mode skill 生成 ' + CONFIG.presenterFile + '）'); return; }
    document.getElementById('presenterBtn').classList.add('active');
    setTimeout(() => broadcastPresenter(idx), 400); setTimeout(() => broadcastPresenter(idx), 1200);
    const t = setInterval(() => { if (!presenterWindow || presenterWindow.closed) { clearInterval(t); document.getElementById('presenterBtn').classList.remove('active'); presenterWindow = null; } }, 1000);
  }

  // —— 核心导航 ——
  function setActive(n) {
    idx = Math.max(0, Math.min(total - 1, n));
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    if (present) {
      const sc = Math.min(window.innerWidth / 1920, window.innerHeight / 1080) * 0.98;
      slides[idx].style.setProperty('--sc', sc);
    } else {
      const wrap = slides[idx].parentNode; if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    updateUI(); broadcastPresenter(idx);
  }
  function updateUI() {
    const g = segOf(slides[idx]);
    curSegEl.textContent = '段 ' + g; curIdxEl.textContent = idx + 1;
    progressBar.style.width = ((idx + 1) / total * 100).toFixed(2) + '%';
    document.querySelectorAll('.segnav__seg').forEach(segEl => {
      const cur = +segEl.dataset.seg === g;
      segEl.classList.toggle('segnav__seg--current', cur); if (cur) segEl.classList.add('segnav__seg--expanded');
    });
    document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('thumb--active', +t.dataset.idx === idx));
    const at = document.querySelector('.thumb--active');
    if (at) { const nr = segnav.getBoundingClientRect(), tr = at.getBoundingClientRect();
      if (tr.top < nr.top + 60 || tr.bottom > nr.bottom - 20) at.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }
  function next() { setActive(idx + 1); } function prev() { setActive(idx - 1); }
  function goSeg(n) { setActive(segStarts[n] || 0); }

  function togglePresent() {
    present = !present; body.classList.toggle('present', present);
    if (present) setActive(idx);
    else { slides.forEach(s => { s.classList.remove('active'); s.style.removeProperty('--sc'); });
      setTimeout(() => { const w = slides[idx].parentNode; if (w) w.scrollIntoView({ behavior: 'instant', block: 'center' }); }, 50); }
  }
  function enterFullscreen() {
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) req.call(el).then(() => { if (!present) togglePresent(); body.classList.add('fullscreen'); }).catch(() => { if (!present) togglePresent(); });
    else if (!present) togglePresent();
  }
  function exitFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen; if (ex) ex.call(document);
    }
    body.classList.remove('fullscreen'); if (present) togglePresent();
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) { body.classList.remove('fullscreen');
      if (present) { present = false; body.classList.remove('present');
        slides.forEach(s => { s.classList.remove('active'); s.style.removeProperty('--sc'); });
        setTimeout(() => { const w = slides[idx].parentNode; if (w) w.scrollIntoView({ behavior: 'instant', block: 'center' }); }, 50); } }
  });

  // —— 键盘 ——
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key;
    if (k === 'f' || k === 'F' || k === 'Enter') { (document.fullscreenElement || body.classList.contains('present')) ? exitFullscreen() : enterFullscreen(); e.preventDefault(); return; }
    if (k === 'p' || k === 'P') { togglePresent(); e.preventDefault(); return; }
    if (k === 's' || k === 'S') { if (!e.ctrlKey && !e.metaKey) { openPresenter(); e.preventDefault(); } return; }
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown') { next(); e.preventDefault(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') { prev(); e.preventDefault(); return; }
    if (k === 'Escape') { if (document.fullscreenElement || body.classList.contains('present')) { exitFullscreen(); e.preventDefault(); } return; }
    if (k === 'Home') { setActive(0); e.preventDefault(); return; }
    if (k === 'End') { setActive(total - 1); e.preventDefault(); return; }
    if (k >= '1' && k <= '9') { const n = +k - 1; if (n < segCount.length) { goSeg(n); e.preventDefault(); } return; }
  });
  // —— 投屏态点击翻页 ——
  document.addEventListener('click', e => {
    if (!present) return; if (e.target.closest('a, button, input, select, .topbar, .segnav')) return;
    (e.clientX > window.innerWidth * 0.6) ? next() : (e.clientX < window.innerWidth * 0.4 ? prev() : 0);
  });
  document.getElementById('prevBtn').addEventListener('click', prev);
  document.getElementById('nextBtn').addEventListener('click', next);
  document.getElementById('playBtn').addEventListener('click', enterFullscreen);
  document.getElementById('presenterBtn').addEventListener('click', openPresenter);

  // —— 编辑态自适应缩放 + 滚动跟随 ——
  function updateFitScale() {
    const availW = window.innerWidth - 300 - 60, availH = window.innerHeight - 100;
    const scale = Math.max(0.25, Math.min(0.7, availW / 1920, availH / 1080));
    document.documentElement.style.setProperty('--fit-scale', scale.toFixed(4));
  }
  updateFitScale();
  window.addEventListener('resize', () => { updateFitScale(); if (present) setActive(idx); });
  let st = null;
  window.addEventListener('scroll', () => {
    if (present) return; if (st) clearTimeout(st);
    st = setTimeout(() => {
      const vc = window.scrollY + window.innerHeight / 2; let best = 0, bd = Infinity;
      slides.forEach((s, i) => { const w = s.parentNode; if (!w) return; const r = w.getBoundingClientRect();
        const c = r.top + window.scrollY + r.height / 2, d = Math.abs(c - vc); if (d < bd) { bd = d; best = i; } });
      if (best !== idx) { idx = best; updateUI(); }
    }, 100);
  });

  updateUI();
  // 暴露给 slides-presenter-mode / 控制台调试
  window.deckAPI = { setActive, next, prev, goSeg, openPresenter, get idx() { return idx; }, total, SLIDE_MAP, SLIDE_TITLES };
})();
