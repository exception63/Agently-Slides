// ======================= bridge: connected mode =======================
function updateBridgeBadge(): void {
  const b = $('#bridgeBadge');
  if (b) {
    // once handshook, name the session + port so it's unambiguous which Claude is on
    // the other end (no more "did my request land in the right session?").
    let label = '';
    if (bridge.connected) {
      label = '● 已连接 Claude';
      if (bridge.owner && bridge.owner.label) label += ' · 会话 ' + bridge.owner.label;
      if (bridge.port) label += ' · 端口 ' + bridge.port;
    }
    b.textContent = label; b.className = 'bridge-badge' + (bridge.connected ? ' on' : '');
    b.title = bridge.connected
      ? (bridge.owner ? '已与 Claude 握手：' + bridge.owner.label + '（端口 ' + bridge.port + '）。修改请求只会发给这个会话。' : '已连接，等待 Claude 握手（运行 /slidesmith）')
      : '与 Claude Code 的连接状态';
  }
  // when NOT connected, offer the one-click "连接 Claude" button (hidden once connected)
  const cb = $('#connectBtn'); if (cb) cb.style.display = bridge.connected ? 'none' : '';
  renderTodo();
}

// ======================= one-click 连接 Claude (offline → connected hand-off) =======================
// A browser page can't launch a server, so this button DETECTS the local bridge and
// jumps you to the connected Studio (carrying your current deck). When the bridge isn't
// up yet it shows dead-simple steps + auto-retries until it appears.
function bridgeUrl(): string { return (window as unknown as { __SM_BRIDGE_URL__?: string }).__SM_BRIDGE_URL__ || 'http://localhost:8765/'; }
let cProbeTimer: ReturnType<typeof setInterval> | null = null;
async function probeBridgeOnce(): Promise<boolean> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(bridgeUrl() + 'healthz', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t); return r.ok;
  } catch { return false; }
}
async function openConnected(): Promise<void> {
  // hand the current deck to the bridge first (best-effort), then open the connected Studio
  if (mode === 'html') {
    try { await fetch(bridgeUrl() + 'api/open?name=' + encodeURIComponent(fileBase + '.html'), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: exportHtmlDeck() }); } catch { /* best effort */ }
  }
  window.location.href = bridgeUrl();
}
function renderConnectState(found: boolean): void {
  const box = $('#cstate'); if (!box) return;
  if (found) {
    box.innerHTML = '<div class="cstatus ok">已检测到本地服务，可以连接 Claude。</div>'
      + '<button id="cgo" class="primary-mini" style="width:100%;margin-top:12px;padding:10px">打开已连接的 Studio（携带当前 deck）</button>'
      + '<div class="cfaint">将在 ' + bridgeUrl() + ' 打开已连接版本并自动连接 Claude，当前的修改会一并带入。</div>';
    const go = $('#cgo'); if (go) go.addEventListener('click', openConnected);
  } else {
    box.innerHTML = '<div class="cstatus">正在检测本地服务，启动 Claude Code 后会自动连接。</div>'
      + '<div class="chint">连接方式</div>'
      + '<ol class="csteps"><li>打开 <b>Claude Code</b></li>'
      + '<li>对它说「<b>用 slidesmith 打开这份 slides</b>」，或输入 <code>/slidesmith</code></li>'
      + '<li>它会自动启动服务并弹出一个<b>已连接</b>的 Studio，在该版本中编辑即可</li></ol>'
      + '<div class="cfaint">检测到服务后，上方会变为绿色并出现「打开已连接版本」按钮。<br>也可在仓库目录运行 <code>npm run sm -- serve</code>。</div>';
  }
}
function openConnectModal(): void {
  const m = $('#connectModal'); if (!m) return; m.style.display = 'flex';
  const tick = async () => renderConnectState(await probeBridgeOnce());
  tick(); if (cProbeTimer) clearInterval(cProbeTimer); cProbeTimer = setInterval(tick, 2000);
}
function closeConnectModal(): void {
  const m = $('#connectModal'); if (m) m.style.display = 'none';
  if (cProbeTimer) { clearInterval(cProbeTimer); cProbeTimer = null; }
}
// push the current full deck html back to the bridge (keeps its copy authoritative)
function syncExportToBridge(): void {
  if (!bridge.connected || !bridge.ws || bridge.ws.readyState !== WebSocket.OPEN || mode !== 'html') return;
  try { bridge.ws.send(JSON.stringify({ type: 'exported', name: fileBase + '.html', html: exportHtmlDeck() })); } catch { /* noop */ }
}
function connectBridge(): void {
  // only when served over http(s) — file:// has no host to dial back to
  if (!/^https?:$/.test(location.protocol) || !location.host) { updateBridgeBadge(); return; }
  let ws: WebSocket;
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); }
  catch { updateBridgeBadge(); return; }
  bridge.ws = ws;
  ws.addEventListener('open', () => {
    bridge.connected = true; bridge.everConnected = true; bridge.tries = 0;
    updateBridgeBadge(); toast('已连接 Claude Code');
    // **桥空手上线时，把我们手里这份报给它。** 桥重启过、或者 deck 是在桥起来之前
    // 就打开的话，桥那边 hasDeck 一直是 false —— AI 看到的是「Studio 里没打开任何
    // deck」，而屏幕上明明开着。
    //
    // 先问一句再推，不能直接推：桥自己有 deck 的话，它在连上这一刻就会推 import
    // 下来，两条消息撞在一起会把用户开着的那份换成桥手里的旧货。
    setTimeout(() => {
      if (mode !== 'html' || !htmlSlides.length) return;
      fetch('/api/status').then((r) => r.json()).then((st: { hasDeck?: boolean }) => {
        if (!st.hasDeck) syncExportToBridge();
      }).catch(() => { /* 老桥没有这个接口就算了 */ });
    }, 700);
  });
  ws.addEventListener('message', (e: MessageEvent) => {
    let m: { type?: string; name?: string; html?: string; text?: string; preview?: boolean; summary?: string; owner?: { label: string; since: number } | null; port?: number;
      cues?: Record<string, string[]>; replace?: boolean; watchJs?: string; replaceWatch?: boolean;
      anchors?: string[]; segments?: Record<string, string> };
    try { m = JSON.parse(String(e.data)); } catch { return; }
    // hello carries the handshake: which session owns this bridge + its port. Re-sent
    // after a handshake, so the badge updates the moment Claude runs /slidesmith.
    if (m.type === 'hello') {
      bridge.owner = m.owner || null; bridge.port = m.port || 0; updateBridgeBadge();
      reportTheme();      // 刚连上就报一次，否则 app 启动时不知道该用深还是浅
    }
    else if (m.type === 'import' && typeof m.html === 'string') { importedFromBridge = true; importFile(m.name || 'deck.html', m.html); importedFromBridge = false; }
    // after applying a patch, sync the updated full deck back so the bridge's
    // in-memory copy stays current (late-joiners / reconnects see the change)
    else if (m.type === 'patch' && typeof m.text === 'string') { applyAiPatch(m.text, !!m.preview, typeof m.summary === 'string' ? m.summary : ''); setTimeout(syncExportToBridge, 500); }
    // 桥要一份最新的 deck（AI 读页之前会问一次）。**手打的编辑只有这条路能传上去**——
    // 保存/导出/AI 补丁之外，桥手里那份一直是旧的，AI 照旧内容重写就会盖掉手改。
    else if (m.type === 'sync-request') syncExportToBridge();
    // 手表提词。读走 cues-request，写走 set-cues —— apply_patch 够不着 #deck 之外的
    // __SM_CUES__，所以提词必须有自己的一条道。两条都用 {type:'cues'} 回话。
    else if (m.type === 'cues-request') sendCueReport();
    else if (m.type === 'set-cues' && m.cues && typeof m.cues === 'object') applyCuePatch(m.cues, !!m.replace);
    else if (m.type === 'enable-watch' && typeof m.watchJs === 'string') enableWatchMode(m.watchJs, !!m.replaceWatch);
    // 讲稿。同理：__TXB64__ 也在 #deck 之外，apply_patch 够不着。
    else if (m.type === 'notes-request') sendNotesReport(Array.isArray(m.anchors) ? m.anchors : []);
    else if (m.type === 'set-notes' && m.segments && typeof m.segments === 'object') applyNotesPatch(m.segments);
  });
  ws.addEventListener('close', () => {
    bridge.connected = false; bridge.ws = null; updateBridgeBadge();
    // reconnect only if we had a working link before (bridge restarted) or are
    // still in the first few attempts — avoids hammering when there's no server.
    if (bridge.everConnected || bridge.tries < 3) { bridge.tries++; setTimeout(connectBridge, 1500); }
  });
  ws.addEventListener('error', () => { try { ws.close(); } catch { /* noop */ } });
}

