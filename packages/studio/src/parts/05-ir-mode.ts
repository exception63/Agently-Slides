// ---------------- edits ----------------
function applyEdit(bid: string, field: string, value: unknown): void {
  const b = findBlock(bid) as Record<string, unknown> | null; if (!b) return;
  if (field === 'items') { if (Array.isArray(value) && value.length) b.items = value; }
  else b[field] = value;
  renderLeft();
}
// locate a top-level block of the CURRENT slide (for element ops)
function locateBlock(bid: string): { slotKey: string; arr: Block[]; index: number } | null {
  const s = deck.slides[cur];
  for (const slotKey of Object.keys(s.slots)) {
    const arr = s.slots[slotKey] as Block[];
    const index = arr.findIndex((b) => b.id === bid);
    if (index >= 0) return { slotKey, arr, index };
  }
  return null;
}

function showBlock(bid: string, btype: string): void {
  const b = findBlock(bid); if (!b) return;
  document.querySelectorAll('.needsel').forEach((el) => ((el as HTMLElement).style.display = ''));
  document.querySelectorAll('.nosel').forEach((el) => ((el as HTMLElement).style.display = 'none'));
  $('#blktype').textContent = btype || b.type;
  const st = (b.style ?? {}) as Record<string, string>;
  setVal('#fsize', st.size || ''); setVal('#fcolor', st.color || ''); setVal('#fweight', st.weight || ''); setVal('#falign', st.align || '');
  setVal('#anim', (b.build && b.build.anim) || 'none');
  setVal('#motion', (b.build && b.build.motion) || 'none');
  const loc = locateBlock(bid);
  ($('#elUp') as HTMLButtonElement).disabled = !loc || loc.index === 0;
  ($('#elDown') as HTMLButtonElement).disabled = !loc || (loc && loc.index === loc.arr.length - 1);
}
function setVal(sel: string, v: string): void { const el = $(sel) as HTMLSelectElement; if (el) el.value = v; }

function setStyle(prop: string, val: string): void {
  if (!selBid) return; const b = findBlock(selBid) as { style?: Record<string, string> } | null; if (!b) return;
  const style = Object.assign({}, b.style);
  if (val) style[prop] = val; else delete style[prop];
  if (Object.keys(style).length) b.style = style; else delete b.style;
  reloadPreview();
}
function setAnim(val: string): void { setBuild('anim', val); }
function setMotion(val: string): void { setBuild('motion', val === 'none' ? undefined : val); }
function setBuild(prop: string, val: string | undefined): void {
  if (!selBid) return; const b = findBlock(selBid) as { build?: Record<string, unknown> } | null; if (!b) return;
  const build = Object.assign({}, b.build) as Record<string, unknown>;
  if (val == null) delete build[prop]; else build[prop] = val;
  if (Object.keys(build).length) b.build = build; else delete b.build;
  reloadPreview();
}

// ---- element ops (delete / move / add within the current slide) ----
function delElement(): void {
  if (!selBid) return; const loc = locateBlock(selBid); if (!loc) return;
  loc.arr.splice(loc.index, 1);
  if (!loc.arr.length && Object.keys(deck.slides[cur].slots).length > 1) delete deck.slides[cur].slots[loc.slotKey];
  selBid = null; clearSel(); reloadPreview();
}
function moveElement(dir: number): void {
  if (!selBid) return; const loc = locateBlock(selBid); if (!loc) return;
  const j = loc.index + dir; if (j < 0 || j >= loc.arr.length) return;
  const t = loc.arr[loc.index]; loc.arr[loc.index] = loc.arr[j]; loc.arr[j] = t;
  reloadPreview();
}
function addElement(make: () => Block): void {
  const s = deck.slides[cur];
  // target slot = selected block's slot, else the busiest slot, else first
  let slotKey = selBid ? locateBlock(selBid)?.slotKey : undefined;
  if (!slotKey) { const keys = Object.keys(s.slots); slotKey = keys.sort((a, b) => (s.slots[b] as Block[]).length - (s.slots[a] as Block[]).length)[0] || keys[0]; }
  const blk = make(); (blk as { id: string }).id = uid('b');
  (s.slots[slotKey] as Block[]).push(blk);
  reloadPreview();
}
function clearSel(): void {
  document.querySelectorAll('.needsel').forEach((el) => ((el as HTMLElement).style.display = 'none'));
  document.querySelectorAll('.nosel').forEach((el) => ((el as HTMLElement).style.display = ''));
}

// ---- 文稿 (notes + cue/golden/data) ----
function renderDoc(): void {
  const s = deck.slides[cur];
  ($('#notes') as HTMLTextAreaElement).value = s.notes || '';
  const box = $('#noteblocks'); box.innerHTML = '';
  (s.noteBlocks ?? []).forEach((nb, i) => {
    const row = document.createElement('div'); row.className = 'nbrow';
    row.innerHTML = `<span class="nbtag nb-${nb.kind}">${nb.kind === 'cue' ? '讲法' : nb.kind === 'golden' ? '金句' : '数据'}</span>`;
    const inp = document.createElement('input'); inp.value = nb.text;
    inp.addEventListener('input', () => { (s.noteBlocks as NoteBlock[])[i].text = inp.value; });
    const del = document.createElement('button'); del.textContent = '✕'; del.title = '删除';
    del.addEventListener('click', () => { (s.noteBlocks as NoteBlock[]).splice(i, 1); renderDoc(); });
    row.appendChild(inp); row.appendChild(del); box.appendChild(row);
  });
}
function addNoteBlock(kind: string): void {
  const s = deck.slides[cur];
  if (!s.noteBlocks) s.noteBlocks = [];
  (s.noteBlocks as NoteBlock[]).push({ kind: kind as NoteBlock['kind'], text: '' });
  renderDoc();
}

function addSlide(): void {
  const s: Slide = { id: uid('s'), layout: 'bullets', slots: { main: [{ id: uid('b'), type: 'heading', text: '新页面', level: 2 }] } };
  deck.slides.splice(cur + 1, 0, s); cur += 1; renderLeft(); reloadPreview();
}
function delSlide(): void {
  if (deck.slides.length <= 1) return;
  deck.slides.splice(cur, 1); if (cur >= deck.slides.length) cur = deck.slides.length - 1;
  renderLeft(); reloadPreview(); selectSlide(cur);
}
function moveSlide(dir: number): void {
  const j = cur + dir; if (j < 0 || j >= deck.slides.length) return;
  const t = deck.slides[cur]; deck.slides[cur] = deck.slides[j]; deck.slides[j] = t;
  cur = j; renderLeft(); reloadPreview(); selectSlide(cur);
}

// ---------------- import / export ----------------
function download(name: string, content: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// 保存 HTML — write the current deck back to the file the user opened, overwriting it
// in place. Reuses the captured handle for a silent one-click overwrite; if there is no
// handle (deck came from the bridge, or first save) it asks the user to pick the file
// once and remembers it; browsers without the File System Access API get a download.
async function saveHtmlInPlace(): Promise<void> {
  // 「保存」＝写回**源文件**，不嵌字体：源文件要精简、⌘S 是高频动作要快、而且内容还在改
  // （嵌进去的是子集，新打的字会缺字形）。要拿去别的电脑放的**交付件**走「另存为 / 导出」，
  // 那里才按 ⚙ 的勾选嵌字体。
  const html = mode === 'html' ? exportHtmlDeck() : renderDeckHtml(deck);
  // 0) 连着桥就让桥写回原文件。
  //
  // **这一条以前没有，后果是 app 里的「保存」从来没真正保存过。** 下面那两条走的都是
  // 浏览器的 File System Access API（`fileHandle` / `showSaveFilePicker`），而
  // WKWebView 两个都没有，于是一路落到最后的「下载副本」——在 WKWebView 里那等于
  // 什么都没发生，还会把 WebView 导航去 blob URL，表现是「左右栏突然没了」，
  // 而用户以为自己已经存好了。
  // inPlace=1：写不回原文件就明确失败，绝不悄悄在别处新建一份。
  if (location.protocol.startsWith('http')) {
    try {
      const r = await fetch(
        `${libBase()}/api/export-html?inPlace=1&reveal=0&name=${encodeURIComponent(fileBase)}.html`,
        { method: 'POST', headers: { 'content-type': 'text/html;charset=utf-8' }, body: html });
      const j = await r.json() as { ok: boolean; path?: string; error?: string };
      if (j.ok && j.path) {
        toast('已保存：' + j.path);
        clearDraft(); syncExportToBridge();   // 桥里那份也换成新的，否则 ⌘R 会把改动"退回去"
        return;
      }
      // 桥不知道这份 deck 在磁盘的哪儿（导入 HTML 进来的，网页拿不到路径）。
      // **这时候绝不能悄悄往下走「下载副本」**——在 app 的 WebView 里那等于什么都
      // 没发生，用户以为存好了，其实一个字节没写。退一步存成一份真文件，并且
      // 明确告诉他存到哪了、这不是覆盖原文件。
      if (j.error === 'no-path' && !(window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker) {
        const r2 = await fetch(
          `${libBase()}/api/export-html?name=${encodeURIComponent(fileBase)}.html`,
          { method: 'POST', headers: { 'content-type': 'text/html;charset=utf-8' }, body: html });
        const j2 = await r2.json() as { ok: boolean; path?: string };
        if (j2.ok && j2.path) {
          clearDraft(); syncExportToBridge();
          toast('⚠️ 没能覆盖原文件（这份 deck 是导入进来的，拿不到它的路径），'
              + '已另存到：' + j2.path + ' —— 想一键覆盖，请用「打开」重新打开这份文件。', true);
          return;
        }
      }
    } catch { /* 桥没应答 → 往下走浏览器那套 */ }
  }
  // 1) reuse a known handle → silent overwrite
  if (fileHandle) {
    try {
      const w = await fileHandle.createWritable();
      await w.write(html); await w.close();
      toast('已保存：' + (fileHandle.name || fileBase + '.html'));
      clearDraft(); syncExportToBridge();
      return;
    } catch { /* permission lost / file moved → fall through to picker */ fileHandle = null; }
  }
  // 2) no handle → let the user pick the file to overwrite, then remember it
  const w = window as unknown as { showSaveFilePicker?: (o?: unknown) => Promise<FsFileHandle> };
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({
        suggestedName: fileBase + '.html',
        types: [{ description: 'HTML deck', accept: { 'text/html': ['.html', '.htm'] } }],
      });
      const ws = await h.createWritable();
      await ws.write(html); await ws.close();
      fileHandle = h;
      toast('已保存：' + (h.name || fileBase + '.html'));
      clearDraft(); syncExportToBridge();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user cancelled the dialog
      /* fall through to download */
    }
  }
  // 3) 都不行了才下载副本。
  // **在 app 的 WebView 里这条是死路**（没有下载能力，还会把页面导航去 blob URL，
  // 表现是「左右栏突然没了」），所以宁可明说失败，也不要假装存好了。
  if (location.protocol.startsWith('http')) {
    toast('❌ 没能保存：桥不知道这份 deck 的文件位置，而这个环境也不支持「另存为」对话框。'
        + '请用「打开」重新打开这份文件，再按保存。', true);
    return;
  }
  download(fileBase + '.html', html, 'text/html');
  toast('当前浏览器不支持原地覆盖，已下载副本', true);
}

// route an imported file by type: contract HTML deck → html mode; json/md → IR mode
/** 这一次导入是桥推下来的吗（是的话就别再回声给桥） */
let importedFromBridge = false;
function importFile(name: string, text: string): void {
  cueMap = null; cueLoaded = false;   // 换了 deck，提词缓存作废
  notesDoc = null; notesLoaded = false; notesUndo = null; noteAnns = []; notePick = null;  // 讲稿同理
  slideAnns = []; annPick = null;   // 元素批注挂在具体某页的某个元素上，换 deck 就作废
  fileHandle = null; // a new deck arrived → drop any stale writable handle; open-picker/drop re-set it after
  if (/\.html?$/i.test(name) || /^\s*<(!doctype|html|section|div|body)/i.test(text)) loadHtmlDeck(name, text);
  else loadDeck(name, text);
}

function loadDeck(name: string, text: string): void {
  fileBase = name.replace(/\.deck\.(md|json)$/i, '').replace(/\.(md|json)$/i, '') || 'deck';
  let ir: unknown;
  try {
    ir = /\.json$/i.test(name) || text.trim().startsWith('{') ? JSON.parse(text) : parseMarkdownToIR(text);
  } catch (e) { toast('解析失败: ' + (e as Error).message, true); return; }
  const res = validateDeck(ir);
  if (!res.ok) { toast('校验失败: ' + res.errors[0].path + ' ' + res.errors[0].message, true); return; }
  deck = res.ir; cur = 0; selBid = null; mode = 'ir';
  ($('#theme') as HTMLSelectElement).value = deck.theme || 'editorial';
  clearSel(); setHtmlMode(false);
  $('#deckname').textContent = fileBase;
  renderLeft(); refreshSlidePanel(); renderDoc(); reloadPreview();
  toast('已导入 ' + fileBase + '（' + deck.slides.length + ' 页）');
}

