function buildUI(): void {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  document.body.innerHTML = `
<div class="ehead">
  <span class="grp">
    <button id="navtog" class="iconbtn" title="折叠 / 展开左侧页面列表">☰</button>
    <button id="deckNavTog" class="iconbtn" aria-pressed="false" title="在预览里显示 deck 自带的段导航（缩略图）。默认关——左侧页面列表做的是同一件事，关掉能把 300px 还给幻灯片">▦</button>
    <button id="themeTog" class="iconbtn" title="切换深色 / 浅色界面">◐</button>
  </span>
  <span class="sep"></span>
  <span class="grp">
    <button id="undoBtn" class="iconbtn" title="撤销（⌘/Ctrl+Z）" disabled>↶</button>
    <button id="redoBtn" class="iconbtn" title="重做（⌘/Ctrl+⇧+Z）" disabled>↷</button>
  </span>
  <span class="sep"></span>
  <span class="brand">Slidesmith Studio</span>
  <span class="dn" id="deckname">${esc(fileBase)}</span>
  <span class="dirtydot" id="dirtyDot" title="有未保存的修改，已自动保存草稿，按 ⌘/Ctrl+S 写回文件" style="display:none">● 未保存</span>
  <span id="bridgeBadge" class="bridge-badge" title="与 Claude Code 的连接状态"></span>
  <button id="connectBtn" class="connect-btn" title="连接本地 Claude Code">连接 Claude Code</button>
  <span class="grow"></span>
  <button id="imp">导入 HTML</button>
  <span class="sep"></span>
  <span class="grp">
    <button id="tbPlay" title="全屏放映（F）——就在这个窗口里放">▶ 放映</button>
    <button id="tbPresenter" title="打开演讲者副屏（S）——要 deck 带演讲者模式">演讲者</button>
    <button id="cmdkBtn" class="iconbtn" title="命令面板：输入想做的事（⌘K / Ctrl+K）">⌘K</button>
  </span>
  <span class="sep"></span>
  <span class="grp expwrap">
    <button id="expOpts" class="iconbtn" aria-expanded="false" title="导出选项">⚙</button>
    <div class="expmenu" id="expMenu">
      <div class="expmenu-t">导出 / 保存选项</div>
      <label class="embedck"><input id="embedFonts" type="checkbox"> <span>嵌入字体<span class="ck-sub">「另存为 / 导出」时把用到的字（只嵌用到的字重）写进 HTML，换台电脑、没网、墙内都不走样。默认开；「保存」写回源文件时不嵌</span></span></label>
      <label class="embedck"><input id="embedRemote" type="checkbox"> <span>嵌入手机遥控<span class="ck-sub">导出的 HTML 里多一个「📱 手机遥控」按钮，扫码即可用手机翻页</span></span></label>
      <label class="embedck" id="newRoomWrap" style="display:none"><input id="newRoom" type="checkbox"> <span>换新房间号<span class="ck-sub">默认沿用这份 deck 原有的房间号，手机不用重新扫码；勾上才铸新号，旧二维码作废</span></span></label>
      <div id="relayWrap" class="prcfg" style="display:none">
        <div class="prrow"><label for="relaySel">中转</label><select id="relaySel"></select></div>
        <div class="prhint" id="relayHint"></div>
        <div class="prrow"><label for="remotePass">遥控密码</label><input id="remotePass" type="text" inputmode="numeric" autocomplete="off" placeholder="留空＝不设密码"></div>
        <div class="prhint">设了之后，手机扫码要先输这个密码才能翻页 / 看讲稿 / 控问答。<b>学生扫码提问不受影响，永远不要密码。</b>密码以哈希形式烘进文件，源码里看不到明文。</div>
      </div>
    </div>
    <button id="expPdf">导出 PDF</button>
    <button id="expHtml" title="另存为：下载一份新的 HTML 副本，不覆盖原文件">另存为</button>
    <button id="saveHtml" class="primary" title="保存（⌘S）：写回源 HTML，不嵌字体，快。要拿去别的电脑放映用「另存为」（按 ⚙ 里的勾选嵌字体 / 遥控）">保存</button>
  </span>
  <input id="file" type="file" accept=".html,.htm" style="display:none">
</div>
<div class="emain">
  <aside class="left">
    <div class="ltabs">
      <button class="ltab active" data-ltab="pages" title="页面缩略图导航">页面</button>
      <button class="ltab" data-ltab="skins" title="换一套皮肤风格，整份 deck 立刻变样">换装</button>
      <button class="ltab" data-ltab="insert" title="插入新页 / 图片 / 图表 / 引用等">插入</button>
    </div>
    <div class="lpane" data-lpane="pages">
      <div class="lbar"><button id="add" title="新增页">＋</button><button id="del" title="删除当前页">－</button><button id="up" title="上移">↑</button><button id="down" title="下移">↓</button></div>
      <div id="slides"></div>
    </div>
    <div class="lpane" data-lpane="skins" hidden>
      <div id="skinGallery" class="lscroll"><div class="lpane-soon">换装画廊加载中…</div></div>
    </div>
    <div class="lpane" data-lpane="insert" hidden>
      <div id="insertPane" class="lscroll"><div class="lpane-soon">插入面板加载中…</div></div>
    </div>
  </aside>
  <main class="center">
    <iframe id="preview"></iframe>
    <div class="drop">松开即可导入 HTML</div>
  </main>
  <aside class="right">
    <div class="railstrip">
      <button class="railtog" type="button" title="展开面板">‹</button>
      <div id="railStripTabs"></div>
    </div>
    <div id="htmlpanel" style="display:none">
      <!-- tab 顺序＝使用频率：AI 修改 / 讲稿最常用，排前面；deck 级设计旋钮不常动，垫底。 -->
      <div class="htabs">
        <button class="htab active" data-htab="ai" data-icon="ai" title="AI 修改 —— 模糊的重活交给 Claude"><span class="tlab">AI</span><span class="tabnum" id="aiTabNum" hidden></span></button>
        <button class="htab" data-htab="script" data-icon="script" title="讲稿 / 提词 —— 副屏讲稿与手表提词">讲稿</button>
        <button class="htab" data-htab="fmt" data-icon="fmt" title="格式 —— 选中元素的字体 / 颜色 / 位置">格式</button>
        <button class="htab" data-htab="anim" data-icon="anim" title="动画 —— 选中元素的进入 / 强调 / 动作 / 消失">动画</button>
        <button class="htab" data-htab="design" data-icon="design" title="设计 —— 整份 deck 的皮肤 / 配色 / 字体 / 字号">设计</button>
        <button class="railtog" type="button" title="折叠面板，把地方让给预览">›</button>
      </div>

      <!-- ===== AI 修改 ===== -->
      <div class="pane hpane" data-hpane="ai">
        <div class="sechead sectop">交给 AI<button class="ihelp" type="button" data-help="写一句这一页要怎么改，凑成待办，一键发给 Claude。人做细活（点字、换色、动画），复杂的交给 AI。下面折叠着不常用的：整份 deck 的统一要求、配图、导入图片、图片库与自检。">?</button><span class="grow"></span><label class="confirm-tog" title="开启后 AI 的改动先以「提议」呈现，点保留才算数；关闭则改完直接生效"><input id="aiConfirmTog" type="checkbox"> 先问我</label></div>
        <div class="proposal-bar" id="aiProposalBar" style="display:none"><span class="proposal-dot">●</span><span id="aiProposalTxt">AI 提议了改动，请确认</span><span class="grow"></span><button id="aiKeep" class="mini">保留</button><button id="aiRevertAll" class="mini revert">还原</button></div>

        <div class="sechead">本页</div>
        <div class="aitarget" id="aiTarget"><span id="aiTargetTxt">本页：—</span><span class="applied-chip" id="aiAppliedChip" style="display:none">AI 已修改</span><button id="aiRevertOne" class="mini revert" style="display:none">还原本页</button></div>
        <div class="field"><textarea id="aiInstruction" rows="3" placeholder="这一页想怎么改？例：三个要点改成左右两栏。"></textarea></div>
        <div class="oprow"><button id="aiClearOne" title="清空本页的修改意见">清空</button></div>
        <div class="aisent-banner" id="aiSentBanner" style="display:none"></div>

        <div class="sechead">待办<span class="grow"></span><span class="sendnote" id="aiSendNote" style="display:none">含照片·计费</span></div>
        <div id="aiTodo" class="aitodo"></div>
        <div class="oprow"><button id="aiSendAll" class="primary-mini big" disabled>一键发送给 AI</button></div>
        <div id="aiChangeLog" class="aichangelog" hidden></div>

        <div class="sechead aimore-head">不常用的<span class="grow"></span></div>
        <details class="aimore" id="aimoreDeck">
        <summary class="sechead aimore-sum" title="对整份 deck 的统一要求，AI 自动挑相关页改。例：统一标题字号；精简过长的页。">整份 deck<span class="aimore-caret">›</span></summary>
        <div class="field"><textarea id="aiDeckInstruction" rows="2" placeholder="对整份 deck 的统一要求（可留空）"></textarea></div>
        </details>
        <details class="aimore" id="aimoreIll">
        <summary class="sechead aimore-sum" title="矢量＝Claude 直接画 SVG（免费、可编辑）；图表＝按数据/描述画 SVG 图表（柱/折线/饼/雷达/散点…）；照片＝本机 codex 生成（按张计额度）。成品都进图片库。">配图 · 矢量 / 图表 / 照片<span class="aimore-caret">›</span></summary>
        <div class="illbox">
          <div class="illrow"><span class="illlabel">配图</span>
            <div class="seg" id="illSeg"><button type="button" class="segbtn on" data-illtype="vector">矢量</button><button type="button" class="segbtn" data-illtype="chart">图表</button><button type="button" class="segbtn" data-illtype="photo">照片</button></div>
          </div>
          <textarea id="illHint" rows="2" placeholder="想要什么画面（可留空）"></textarea>
          <div class="illrow illrow-act"><button id="illDataPick" class="mini" title="导入 CSV / 数字 / 文本数据文件，内容会填进上面的框" style="display:none">导入数据文件</button><span id="illDataNote" class="illnote"></span><span class="grow"></span><button id="illAdd" class="primary-mini" title="把本页 + 所选配图类型加入待办">＋ 加入</button></div>
        </div>
        </details>
        <details class="aimore" id="aimoreTray">
        <summary class="sechead aimore-sum" title="流程：先在左侧点你要配图的那一页 → 再导入 / 搜图，图片就自动归到那一页 → 多页都配好后一键发给 AI 排版。放错了？点缩略图角上的「⤴」即可移到当前选中页。">导入图片<span class="grow"></span><button id="imgSearchOpen" class="mini" title="从免费图库搜图，点一下即加入暂存盘（无需手动下载导入）">搜图</button><span class="aimore-caret">›</span></summary>
        <div class="tray-target" id="trayTarget">导入 / 搜图将加到：<b id="trayTargetTxt">（先在左侧选一页）</b></div>
        <div id="trayDrop" class="tray-drop"><div class="tray-drop-in"><b>拖拽图片到此处</b><span>或</span><button id="trayPick" class="mini">导入图片</button></div></div>
        <div id="trayEmpty" class="tray-empty">暂存盘为空</div>
        <div id="trayGrid" class="tray-grid"></div>
        </details>
        <details class="aimore" id="aimoreLib">
        <summary class="sechead aimore-sum" title="AI 生成过的矢量 / 图表 / 照片都在图片库（~/.slidesmith/library/）；视觉自检查溢出、对比度、坏图">图片库 · 视觉自检<span class="grow"></span><button id="genOpenLib" class="mini">打开</button><span class="aimore-caret">›</span></summary>
        <div class="sechead">视觉自检<span class="grow"></span><button id="auditRun" class="mini">检查</button></div>
        <div id="auditOut" class="auditout"></div>
        </details>
      </div>

      <!-- ===== 讲稿 / 提词（原先讲稿只是 AI tab 里的一个按钮，提词是独立 tab；
             两者是同一件事的两半——讲给人听的和抬腕看的——合并提到一级） ===== -->
      <div class="pane hpane" data-hpane="script" hidden>
        <div class="sechead sectop">内嵌讲稿<button class="ihelp" type="button" data-help="讲稿不给直接编辑——它带着锚点和讲法/金句/数据块，手改必然弄漂，副屏同步和手表提词会一起坏。改法是：打开讲稿、划一段、加一条批注，交给 Claude 在守住结构的前提下改写。批注会进「AI」tab 的待办。">?</button><span class="grow"></span><button id="notesOpen" class="mini">打开讲稿</button></div>
        <div class="notes-status" id="notesStatus">—</div>

        <div class="sechead">本页提词<button class="ihelp" type="button" data-help="Apple Watch 上会显示的提词。抬腕零点几秒要能读完，所以每条不超过 10 个汉字，而且要是内容锚点（「无缝嵌入」）而不是结构标签（「第一部分」）。表盘放得下 5 行——skill 出品以 5 条为上限，这里可以再手动加，但手表上会变成要翻页。">?</button></div>
        <div id="cueBody"></div>
      </div>

      <!-- ===== 格式（选中元素） ===== -->
      <div class="pane hpane" data-hpane="fmt" hidden>
        <div class="nosel hseloff" id="hNoSel">在预览中<b>点选文字</b>即可直接编辑。要插图请到左栏「插入」。<button class="ihelp" type="button" data-help="选中后可调整字体、字号、颜色、粗细与位置；元素上方那排把手：✥ 拖动移动 · 💬 给这个元素加一条 AI 批注 · 右下角 ◢ 缩放。打字时空格 / 方向键归输入，按 Esc 退出文本框即可继续用键盘翻页。">?</button></div>
        <div id="hSel" class="hselon" style="display:none">
          <div class="tag" id="hSelTag">—</div>
          <div class="field"><label>字体</label><select id="hFont"></select></div>
          <div class="grid2">
            <div class="field"><label>字号(px)</label><input id="hFs" type="number" min="8" placeholder="默认"></div>
            <div class="field"><label>颜色</label><input id="hColor" type="hidden"><button class="swatch" type="button" data-for="hColor"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
          </div>
          <div class="field"><label>样式</label>
            <div class="btnbar">
              <button id="hBold" class="tgl" title="加粗"><b>B</b></button>
              <button id="hItalic" class="tgl" title="斜体"><i>I</i></button>
              <button id="hUnder" class="tgl" title="下划线"><span style="text-decoration:underline">U</span></button>
              <span class="bbsep"></span>
              <button id="hAlignL" class="tgl" title="左对齐">左</button>
              <button id="hAlignC" class="tgl" title="居中">中</button>
              <button id="hAlignR" class="tgl" title="右对齐">右</button>
            </div>
          </div>
          <div class="field"><label>粗细</label><select id="hWeight"><option value="">默认</option><option>300</option><option>400</option><option>500</option><option>600</option><option>700</option><option>900</option></select></div>
          <div class="grid2">
            <div class="field"><label>宽度(px)</label><input id="hElW" type="number" min="20" placeholder="自动"></div>
            <div class="field"><label>位置 / 大小<button class="ihelp" type="button" data-help="拖动选框上方的 ✥ 可移动，拖动右下角的 ◢ 可调整大小；「复位」清除拖动产生的位移与尺寸。">?</button></label><button id="hBoxReset" class="mini" title="清除拖动产生的位移与尺寸">复位</button></div>
          </div>
          <div class="oprow"><button id="hElUp" title="次序上移">↑ 次序</button><button id="hElDown" title="次序下移">↓ 次序</button><button id="hInsertImg" title="在选中元素后插入一张图片（内联进 HTML，导出离线可用；也可直接在预览里粘贴）">插入图片</button><button id="hElDel" class="danger" title="删除该元素">删除</button></div>
        </div>
      </div>

      <!-- ===== 动画效果 ===== -->
      <div class="pane hpane" data-hpane="anim" hidden>
        <div class="nosel hseloff">在预览中<b>点选一个元素</b>，再为其添加动画。</div>
        <div class="hselon" style="display:none">
          <div class="tag" id="hSelTag2">—</div>
          <button id="hOpenGallery" class="gallery-btn" type="button">打开动画库</button>
          <div id="hAnimChips" class="animchips"></div>
          <div class="hint" id="hMorphHint" style="display:none"></div>
          <h3 class="sub">快速设置</h3>
          <div class="subtabs">
            <button class="stab active" data-stab="in">进入</button>
            <button class="stab" data-stab="emph">强调</button>
            <button class="stab" data-stab="motion">动作</button>
            <button class="stab" data-stab="out">消失</button>
          </div>
          <div class="spane" data-spane="in">
            <div class="field"><label title="翻到本页时播放一次">进入动画</label><select id="hAnim"></select></div>
            <div class="oprow"><button id="hAnimPlay" title="在本页重放进入 / 动作">▶ 预览</button></div>
          </div>
          <div class="spane" data-spane="emph" hidden>
            <div class="field"><label title="翻到本页时，对已显示的元素做一次手势强调">强调动画</label><select id="hEmph"></select></div>
            <div class="oprow"><button id="hAnimPlayE" title="在本页重放强调">▶ 预览</button></div>
          </div>
          <div class="spane" data-spane="motion" hidden>
            <div class="field"><label title="一直循环播放，如呼吸灯、流光">持续动作</label><select id="hMotion"></select></div>
            <div class="oprow"><button id="hAnimPlay2" title="在本页重放进入 / 动作">▶ 预览</button></div>
          </div>
          <div class="spane" data-spane="out" hidden>
            <div class="field"><label title="离开本页时播放一次">消失动画<button class="ihelp" type="button" data-help="放映翻页时自动播放消失动画；编辑时可用「▶ 预览」看效果。">?</button></label><select id="hAnimOut"></select></div>
            <div class="oprow"><button id="hAnimPlayOut" title="在本页预览消失动画">▶ 预览</button></div>
          </div>
          <h3>触发方式<button class="ihelp" type="button" data-help="触发方式作用于本 deck 的进入与动作动画；放映时按 B 可关闭全部动画。">?</button></h3>
          <div class="field"><select id="hFxMode"><option value="auto">自动 · 进入页面即播放</option><option value="manual">手动 · 点击页面才播放</option></select></div>
        </div>
      </div>

      <!-- ===== 设计（deck 级 · 即时生效 · 零 token）
             皮肤和配色原先在「格式」里又有一份（#hAccent/#hPaper/#hInk 和这里的
             #dAccent/#dPaper/#dInk 写的是同一批令牌），现已合并到这里，只留一份。 ===== -->
      <div class="pane hpane" data-hpane="design" hidden>
        <div class="sechead sectop">整份 deck 的设计旋钮<button class="ihelp" type="button" data-help="对整份 deck 生效的「全局旋钮」：皮肤 / 配色 / 字体 / 字号 / 留白。拖一下立刻变、零 token、不经过 AI——人手高频细活就在这里调。所有改动都写入 HTML，导出后离线一致。">?</button></div>
        <div class="field"><label>皮肤</label><div class="skinnow"><span id="hSkinNow">保持原样</span><button id="hSkinGo" class="mini" type="button" title="换皮在左栏「换装」里挑，22 张卡片看得见摸得着">去「换装」挑 ›</button></div><select id="hSkin" hidden></select></div>
        <div class="field" id="hThemeWrap" style="display:none"><label>主题</label><select id="hTheme"></select></div>
        <h3>配色</h3>
        <div class="grid2">
          <div class="field"><label>主色</label><input id="dAccent" type="hidden"><button class="swatch" type="button" data-for="dAccent"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
          <div class="field"><label>强调色 2</label><input id="dAccent2" type="hidden"><button class="swatch" type="button" data-for="dAccent2"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
        </div>
        <div class="grid2">
          <div class="field"><label>背景色</label><input id="dPaper" type="hidden"><button class="swatch" type="button" data-for="dPaper"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
          <div class="field"><label>文字色</label><input id="dInk" type="hidden"><button class="swatch" type="button" data-for="dInk"><i class="sw-chip"></i><span class="sw-hex">—</span></button></div>
        </div>
        <h3>字体</h3>
        <div class="field"><label>标题字体</label><select id="dFontDisplay"></select></div>
        <div class="field"><label>正文字体</label><select id="dFontSans"></select></div>
        <h3>字号 / 留白<button class="ihelp" type="button" data-help="字号 / 留白按设计令牌整体缩放，对正文、引言、说明等一致生效；少数皮肤的封面巨标题用固定字号，不随此旋钮变化。">?</button></h3>
        <div class="field"><label>字号 <span class="tweakout" id="dTypeOut">100%</span></label><input id="dType" type="range" min="70" max="130" step="1" value="100"></div>
        <div class="field"><label>留白 <span class="tweakout" id="dPadOut">100%</span></label><input id="dPad" type="range" min="70" max="130" step="1" value="100"></div>
        <div class="oprow"><button id="dReset" class="mini">复原设计旋钮</button></div>
      </div>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="format" data-icon="fmt" title="格式">格式</button>
      <button class="tab" data-tab="anim" data-icon="anim" title="动画效果">动画效果</button>
      <button class="tab" data-tab="doc" data-icon="script" title="文稿">文稿</button>
      <button class="railtog" type="button" title="折叠面板，把地方让给预览">›</button>
    </div>
    <div class="pane" data-pane="format">
      <h3>主题（配色）</h3><div class="field"><select id="theme"></select></div>
      <h3>本页布局</h3><div class="field"><select id="layout"></select></div>
      <h3>添加元素</h3><div class="addrow" id="addrow"></div>
      <div class="nosel">在中间预览中<b>点选一个元素</b>，即可调整其字体与位置。</div>
      <h3 class="needsel" style="display:none">选中元素 · <span class="tag" id="blktype">—</span></h3>
      <div class="needsel" style="display:none">
        <div class="field"><label>字号</label><select id="fsize"></select></div>
        <div class="field"><label>颜色</label><select id="fcolor"></select></div>
        <div class="grid2"><div class="field"><label>粗细</label><select id="fweight"></select></div><div class="field"><label>对齐</label><select id="falign"></select></div></div>
        <h3>元素操作</h3>
        <div class="oprow"><button id="elUp">↑ 上移</button><button id="elDown">↓ 下移</button><button id="elDel" class="danger">删除</button></div>
      </div>
    </div>
    <div class="pane" data-pane="anim" hidden>
      <div class="nosel">在预览中<b>点选一个元素</b>，再为其添加动画。</div>
      <div class="needsel" style="display:none">
        <h3 title="翻到本页时播放一次">入场动画</h3><div class="field"><select id="anim"></select></div>
        <h3 title="一直循环播放，如呼吸灯">持续动效</h3><div class="field"><select id="motion"></select></div>
        <div class="hint">动效在预览与投屏中持续播放；放映时按 <b>B</b> 可关闭全部动画。</div>
      </div>
    </div>
    <div class="pane" data-pane="doc" hidden>
      <h3>本页讲稿</h3>
      <div class="field"><textarea id="notes" rows="6" placeholder="这一页要讲的内容，可用 **关键词** 标注提词。"></textarea></div>
      <h3>讲稿块</h3>
      <div id="noteblocks"></div>
      <div class="oprow"><button id="addCue">＋ 讲法</button><button id="addGolden">＋ 金句</button><button id="addData">＋ 数据</button></div>
      <div class="hint">讲稿仅用于逐字稿与演讲者视图，不显示在幻灯片上。</div>
    </div>
  </aside>
</div>
<div class="toast" id="toast"></div>
<div class="busy" id="busy"><span class="spin"></span><span id="busyTxt">处理中…</span></div>
<div class="restorebar" id="restoreBar" style="display:none">
  <span id="restoreTxt">发现未保存的草稿</span>
  <div class="rb-acts">
    <button class="go" id="restoreGo">恢复</button>
    <button id="restoreDrop">丢弃</button>
  </div>
</div>
<div class="cmodal" id="connectModal" style="display:none">
  <div class="cbox">
    <div class="ctitle">连接 Claude Code</div>
    <div id="cstate"></div>
    <button class="mini cclose" id="cclose">关闭</button>
  </div>
</div>
<div class="libmodal" id="notesModal" style="display:none">
  <div class="libbox notesbox">
    <div class="libhead"><span class="ctitle">讲稿 · 批注</span><span id="noteCount" class="lib-count"></span><span class="grow"></span><button id="notesUndoBtn" class="mini" style="display:none">撤销 Claude 的改写</button><button id="notesClose" class="mini cclose">关闭</button></div>
    <div class="noteswrap">
      <iframe id="notesFrame" class="notesframe"></iframe>
      <div id="notesEmpty" class="notesempty" style="display:none">
        这份 deck 里没有内嵌讲稿。<br><br>
        一体版（<code>slides-presenter-mode</code> 缝出来的单文件）会把整份讲稿 base64 嵌在
        <code>window.__TXB64__</code> 里，Studio 才读得到；三文件联动版的讲稿在隔壁文件，这里看不见。
      </div>
      <div class="noteside">
        <div class="notepick" id="notePickBox" style="display:none">
          <div class="notepickwhere" id="notePickWhere"></div>
          <div class="notepickquote" id="notePickQuote"></div>
          <textarea id="noteText" rows="3" placeholder="这段要怎么改？例：太长了，砍一半；这里要更口语。"></textarea>
          <div class="oprow"><button id="noteAdd" class="primary-mini">加批注</button><button id="noteCancel" class="mini">取消</button></div>
        </div>
        <div id="noteList" class="notelist"></div>
      </div>
    </div>
    <!-- 用户被这里卡过一次：批注写完了，但发送键只在右栏 AI tab 里，弹窗里一颗都没有。
         这条底栏补上入口，**并且写清楚这一按发出去的是整个待办**（改字/配图/导入图/批注），
         不是只发讲稿这几条——否则人会以为「只发了刚写的」。 -->
    <div class="notesfoot">
      <span class="notesfoot-txt" id="notesFootTxt"></span>
      <span class="grow"></span>
      <button id="notesSendAll" class="primary-mini" disabled>一键发送给 AI</button>
    </div>
  </div>
</div>
<div class="libmodal" id="annModal" style="display:none">
  <div class="libbox annbox">
    <div class="libhead"><span class="ctitle">元素批注</span><span id="annCount" class="lib-count"></span><span class="grow"></span><button id="annClose" class="mini cclose">关闭</button></div>
    <div class="annpick">
      <div class="annwhere" id="annWhere"></div>
      <div class="annsnip" id="annSnip"></div>
      <textarea id="annText" rows="3" placeholder="这个元素要怎么改？例：这句太长，砍一半；这张图换成横版；这个数字改成 2025。"></textarea>
      <div class="oprow"><span class="hintk">⌘/Ctrl + Enter 也可提交</span><button id="annCancel" class="mini">取消</button><button id="annAdd" class="primary-mini">加批注</button></div>
    </div>
    <div id="annList" class="notelist annlist"></div>
    <div class="notesfoot"><span class="notesfoot-txt" id="annFoot"></span></div>
  </div>
</div>
<div class="libmodal" id="libModal" style="display:none">
  <div class="libbox">
    <div class="libhead"><span class="ctitle">图片库</span><span id="libCount" class="lib-count"></span><span class="grow"></span><button id="libReload" class="mini">刷新</button><button id="libClose" class="mini cclose">关闭</button></div>
    <div class="libhint">本 deck 用 codex 生成过的图片（存于 ~/.slidesmith/library/）。可重新插入到对应页，或删除以便管理。</div>
    <div id="libGrid" class="libgrid"></div>
  </div>
</div>
<div class="libmodal" id="searchModal" style="display:none">
  <div class="libbox">
    <div class="libhead">
      <span class="ctitle">搜图</span>
      <input id="imgSearchQ" class="searchq" type="text" placeholder="描述画面，例：森林 晨雾 / teamwork office">
      <!-- Google 源已隐藏：其「搜索整个网络」被 Google 弃用、Custom Search API 将于 2027-01 停用。
           bridge 仍支持 source=google（需 googleApiKey+googleSearchCx），要用把该 option 加回即可。 -->
      <select id="imgSearchSrc" class="searchsrc" title="图源"><option value="">默认</option><option value="baidu">百度 · 中文最多</option><option value="wikimedia">维基共享 · 中文文化</option><option value="pexels">Pexels · 精美英文</option><option value="openverse">Openverse · 免密 CC</option></select>
      <button id="imgSearchGo" class="primary-mini">搜索</button>
      <button id="imgSearchClose" class="mini cclose">关闭</button>
    </div>
    <div class="libhint" id="imgSearchHint">点缩略图即下载并加入「暂存盘」，随后在待办里交给 AI 排版；图片内联进 HTML，导出后离线可用。默认走 Pexels（需一次性免费 key），未配置则自动用 Openverse（免密·CC，需署名）。</div>
    <div id="imgSearchGrid" class="libgrid"></div>
  </div>
</div>
<div class="libmodal" id="cmdk" style="display:none">
  <div class="libbox cmdk-box">
    <input id="cmdkQ" class="searchq" type="text" placeholder="输入想做的事：学术 / 第 12 页 / 导出 PDF / 发给 AI / 关提问 …" autocomplete="off" spellcheck="false">
    <div id="cmdkList" class="cmdk-list"></div>
    <div class="libhint">↑↓ 选择 · Enter 执行 · Esc 关闭 · 随时按 ⌘K（Windows: Ctrl+K）呼出</div>
  </div>
</div>
<div class="helppop" id="helpPop"></div>
<div class="swpop" id="swPop">
  <div class="sw-area" id="swArea"><i class="sw-dot" id="swDot"></i></div>
  <input class="sw-hue" id="swHue" type="range" min="0" max="360" step="1" value="0" aria-label="色相">
  <div class="sw-row"><i class="sw-prev" id="swPrev"></i><input class="sw-hexin" id="swHex" maxlength="7" spellcheck="false" aria-label="十六进制颜色"></div>
  <div id="swDeckWrap"><div class="sw-sec">本 DECK 在用</div><div class="sw-grid"></div></div>
  <div class="sw-sec">常用</div>
  <div class="sw-grid" id="swGrid"></div>
</div>`;

  function fillSel(id: string, values: readonly string[], labels?: Record<string, string>, defaultLabel?: string): HTMLSelectElement {
    const sel = $(id) as HTMLSelectElement; sel.innerHTML = '';
    if (defaultLabel != null) { const o = document.createElement('option'); o.value = ''; o.textContent = defaultLabel; sel.appendChild(o); }
    values.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = (labels && labels[v]) || v; sel.appendChild(o); });
    return sel;
  }
  const onChange = (id: string, fn: (v: string) => void) =>
    ($(id) as HTMLSelectElement).addEventListener('change', (e) => fn((e.target as HTMLSelectElement).value));

  // --- 格式: theme + layout + font + element ops ---
  const th = fillSel('#theme', meta.themes);
  th.value = deck.theme || 'editorial';
  th.addEventListener('change', () => { deck.theme = th.value; reloadPreview(); });
  // editorial-slides 换皮（html 模式）：选一套皮，叠加注入其 bundle 重新着皮
  const skinLabels: Record<string, string> = {};
  SKIN_ORDER.forEach((n) => { skinLabels[n] = (SKINS[n].label || n) + ' · ' + n + (SKINS[n].dark ? ' · 暗' : ' · 浅'); });
  fillSel('#hSkin', SKIN_ORDER, skinLabels, '保持原样（不换皮）');
  onChange('#hSkin', (v) => { const tf = tweakFactor('--t-body'), pf = tweakFactor('--pad-x'); harvestAll(); pushHistory('skin'); H.skin = v; applySkinLive(); reapplyTweaksForSkin(tf, pf); refreshHtmlInspector(); markDirty(); });
  ($('#layout') as HTMLSelectElement).addEventListener('change', () => { deck.slides[cur].layout = ($('#layout') as HTMLSelectElement).value; reloadPreview(); });

  fillSel('#fsize', meta.sizes, undefined, '默认'); onChange('#fsize', (v) => setStyle('size', v));
  fillSel('#fcolor', meta.colors, undefined, '默认'); onChange('#fcolor', (v) => setStyle('color', v));
  fillSel('#fweight', meta.weights, undefined, '默认'); onChange('#fweight', (v) => setStyle('weight', v));
  fillSel('#falign', meta.aligns, undefined, '默认'); onChange('#falign', (v) => setStyle('align', v));

  const addrow = $('#addrow');
  NEW_BLOCKS.forEach((nb) => { const b = document.createElement('button'); b.textContent = '+' + nb.label; b.addEventListener('click', () => addElement(nb.make)); addrow.appendChild(b); });
  $('#elUp').addEventListener('click', () => moveElement(-1));
  $('#elDown').addEventListener('click', () => moveElement(1));
  $('#elDel').addEventListener('click', delElement);

  // --- 动画效果: entrance + motion ---
  fillSel('#anim', meta.anims, ANIM_LABEL); onChange('#anim', (v) => setAnim(v));
  fillSel('#motion', meta.motions, MOTION_LABEL); onChange('#motion', (v) => setMotion(v));

  // --- v2 HTML 模式 inspector: tokens / theme / selected element ---
  const onInput = (id: string, fn: (v: string) => void) =>
    ($(id) as HTMLInputElement).addEventListener('input', (e) => fn((e.target as HTMLInputElement).value));
  // —— 设计旋钮 tab：deck 级配色 / 字体 / 字号 / 留白（即时生效、零 token、写入 H.overrides 一并导出）
  onInput('#dAccent', (v) => setHtmlToken('--accent', v));
  onInput('#dAccent2', (v) => setHtmlToken('--accent-2', v));
  onInput('#dPaper', (v) => setHtmlToken('--paper', v));
  onInput('#dInk', (v) => setHtmlToken('--ink', v));
  populateFontSelect('#dFontDisplay'); onChange('#dFontDisplay', (v) => setHtmlTokenFont('--font-display', v));
  populateFontSelect('#dFontSans'); onChange('#dFontSans', (v) => setHtmlTokenFont('--font-sans', v));
  onInput('#dType', (v) => { const f = (parseInt(v, 10) || 100) / 100; const o = $('#dTypeOut'); if (o) o.textContent = Math.round(f * 100) + '%'; applyTweakScale('type', f); });
  onInput('#dPad', (v) => { const f = (parseInt(v, 10) || 100) / 100; const o = $('#dPadOut'); if (o) o.textContent = Math.round(f * 100) + '%'; applyTweakScale('pad', f); });
  $('#dReset').addEventListener('click', resetDesignKnobs);
  onChange('#hTheme', (v) => { harvestAll(); H.theme = v; renderHtmlEdit(); refreshHtmlInspector(); });
  populateFontSelect('#hFont'); onChange('#hFont', (v) => setHtmlFont(v));
  onInput('#hFs', (v) => applyHtmlStyle('font-size', v ? v + 'px' : ''));
  onInput('#hColor', (v) => applyHtmlStyle('color', v));
  onChange('#hWeight', (v) => { applyHtmlStyle('font-weight', v); if (htmlSelEl) showHtmlSel(true, htmlSelEl as HTMLElement); });
  // Keynote-style toggles: bold / italic / underline + alignment
  $('#hBold').addEventListener('click', () => toggleHtmlStyle('font-weight', '700', () => { const w = parseInt((htmlSelEl as HTMLElement | null)?.style.fontWeight || '', 10); return w >= 600; }));
  $('#hItalic').addEventListener('click', () => toggleHtmlStyle('font-style', 'italic', () => (htmlSelEl as HTMLElement | null)?.style.fontStyle === 'italic'));
  $('#hUnder').addEventListener('click', () => toggleHtmlStyle('text-decoration', 'underline', () => /underline/.test((htmlSelEl as HTMLElement | null)?.style.textDecoration || '')));
  const setAlign = (a: string) => { if (!htmlSelEl) return; const cur = (htmlSelEl as HTMLElement).style.textAlign; applyHtmlStyle('text-align', cur === a ? '' : a); showHtmlSel(true, htmlSelEl as HTMLElement); };
  $('#hAlignL').addEventListener('click', () => setAlign('left'));
  $('#hAlignC').addEventListener('click', () => setAlign('center'));
  $('#hAlignR').addEventListener('click', () => setAlign('right'));
  fillSel('#hAnim', meta.anims, ANIM_LABEL); onChange('#hAnim', (v) => { setHtmlAnim(v); previewPlayFx(); });
  fillSel('#hEmph', meta.emphs, EMPH_LABEL); onChange('#hEmph', (v) => { setHtmlEmph(v); previewPlayFx(); });
  fillSel('#hMotion', meta.motions, MOTION_LABEL); onChange('#hMotion', (v) => { setHtmlMotion(v); previewPlayFx(); });
  fillSel('#hAnimOut', meta.animOuts, ANIM_OUT_LABEL); onChange('#hAnimOut', (v) => { setHtmlAnimOut(v); previewPlayFxOut(); });
  ($('#hFxMode') as HTMLSelectElement).value = fxMode;
  onChange('#hFxMode', (v) => {
    fxMode = v === 'manual' ? 'manual' : 'auto';
    const d = previewFrame()?.contentDocument; if (d) d.documentElement.setAttribute('data-smfx', fxMode);
    previewFxCall('__SM_FX_REARM__');
  });
  $('#hAnimPlay').addEventListener('click', previewPlayFx);
  $('#hAnimPlayE').addEventListener('click', previewPlayFx);
  $('#hAnimPlay2').addEventListener('click', previewPlayFx);
  $('#hAnimPlayOut').addEventListener('click', previewPlayFxOut);
  // 动画库子窗口：开 + 接收回传的效果
  $('#hOpenGallery').addEventListener('click', openAnimGallery);
  window.addEventListener('message', (e) => {
    const d = e.data as { type?: string };
    if (d && d.type === 'smfx-pick') applyPicked(d as { code?: string; name?: string; spec?: Record<string, unknown> });
  });
  $('#hElUp').addEventListener('click', () => moveHtmlEl(-1));
  $('#hElDown').addEventListener('click', () => moveHtmlEl(1));
  $('#hElDel').addEventListener('click', delHtmlEl);
  $('#hInsertImg').addEventListener('click', insertImageFromFile);
  onInput('#hElW', (v) => { commitResize(v ? parseInt(v, 10) : 0); });
  $('#hBoxReset').addEventListener('click', resetSelectedBox);
  // undo / redo (buttons + keyboard); autosave lifecycle
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#restoreBar'); // (handlers attached in maybeOfferDraftRestore)
  initEmbedFontsToggle();
  document.querySelectorAll('details.aimore > summary button').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }));
  window.addEventListener('message', (e) => { const d = e.data as { type?: string } | null; if (d && d.type === 'sm-cmdk') openCmdk(); });
  $('#tbPlay').addEventListener('click', studioPresent);
  $('#tbPresenter').addEventListener('click', studioPresenter);
  $('#cmdkBtn').addEventListener('click', openCmdk);
  $('#hSkinGo').addEventListener('click', () => (document.querySelector('.ltab[data-ltab="skins"]') as HTMLElement | null)?.click());
  $('#cmdk').addEventListener('click', (e) => { if (e.target === $('#cmdk')) closeCmdk(); });
  ($('#cmdkQ') as HTMLInputElement).addEventListener('input', () => { cmdkSel = 0; cmdkRender(); });
  ($('#cmdkQ') as HTMLInputElement).addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { cmdkSel = Math.min(cmdkSel + 1, cmdkShown.length - 1); cmdkRender(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cmdkSel = Math.max(cmdkSel - 1, 0); cmdkRender(); e.preventDefault(); }
    else if (e.key === 'Enter') { cmdkRun(); e.preventDefault(); }
    else if (e.key === 'Escape') { closeCmdk(); e.preventDefault(); }
    e.stopPropagation();
  });
  document.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (meta) {
      if (k === 'k') { e.preventDefault(); if (($('#cmdk') as HTMLElement).style.display !== 'flex') openCmdk(); else closeCmdk(); return; }
      if (k === 's') { e.preventDefault(); void saveHtmlInPlace(); }
      else if (k === 'z' && !e.shiftKey) { if (mode === 'html') { e.preventDefault(); undo(); } }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { if (mode === 'html') { e.preventDefault(); redo(); } }
      return;
    }
    // bare-key shortcuts only in HTML mode, and never while typing in a Studio field
    if (mode !== 'html') return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
    if (e.key === 'Escape') { if (htmlSelEl) { deselectHtml(); e.preventDefault(); } }
    else if (e.key === 'Delete') { if (htmlSelEl) { delHtmlEl(); e.preventDefault(); } }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const step = e.shiftKey ? 1 : 10;
      if (htmlSelEl) { // nudge the selected element (Keynote-style)
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commitMove(dx, dy); e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { // no selection → page through slides
        selectHtmlSlide(cur + (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault();
      }
    }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) autosaveDraft(); });
  // HTML-mode top tabs (格式 / 动画效果 / AI 修改) + animation sub-tabs (进入 / 动作 / 消失)
  document.querySelectorAll('.htab').forEach((tb) => tb.addEventListener('click', () => {
    const name = (tb as HTMLElement).dataset.htab;
    document.querySelectorAll('.htab').forEach((x) => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.hpane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.hpane !== name));
    if (name === 'script') { renderCuePane(); refreshNotesStatus(); }
    if (name === 'design') refreshDeckTokenInputs();
    else if (name === 'ai') refreshNotesStatus();
  }));
  // 讲稿批注
  $('#notesOpen').addEventListener('click', openNotes);
  $('#notesClose').addEventListener('click', closeNotes);
  $('#noteAdd').addEventListener('click', addNoteAnn);
  $('#noteCancel').addEventListener('click', () => {
    notePick = null;
    const b = $('#notePickBox'); if (b) (b as HTMLElement).style.display = 'none';
  });
  $('#notesUndoBtn').addEventListener('click', undoNotesPatch);
  // 弹窗里那颗发送键发的是**整个待办**。发完把弹窗关掉、切到 AI tab——
  // 让人当场看见「刚才那一按到底送走了什么」，而不是留在讲稿里猜。
  $('#notesSendAll').addEventListener('click', () => {
    if (!submitAll()) return;
    closeNotes();
    (document.querySelector('.htab[data-htab="ai"]') as HTMLElement | null)?.click();
  });
  // 讲稿 iframe 里点了「加批注」
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; anchor?: string; quote?: string } | null;
    if (!d || d.type !== 'sm-note-pick' || typeof d.quote !== 'string') return;
    onNotePick(d.anchor || '', d.quote);
  });
  // 左栏多功能 tab：页面（缩略图导航）/ 换装（皮肤画廊，就地换肤）/ 插入（添加中枢）
  document.querySelectorAll('.ltab').forEach((tb) => tb.addEventListener('click', () => {
    const name = (tb as HTMLElement).dataset.ltab;
    document.querySelectorAll('.ltab').forEach((x) => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.lpane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.lpane !== name));
    if (name === 'skins') renderSkinGallery();
    else if (name === 'insert') renderInsertPane();
  }));
  document.querySelectorAll('.stab').forEach((tb) => tb.addEventListener('click', () => {
    const name = (tb as HTMLElement).dataset.stab;
    document.querySelectorAll('.stab').forEach((x) => x.classList.toggle('active', x === tb));
    document.querySelectorAll('.spane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.spane !== name));
    if (name === 'out') previewPlayFxOut(); else previewPlayFx();
  }));

  // --- Submit-to-AI: per-page memory + batch send (apply comes back over the bridge) ---
  ($('#aiInstruction') as HTMLTextAreaElement).addEventListener('input', onAiInput);
  ($('#aiDeckInstruction') as HTMLTextAreaElement).addEventListener('input', (e) => { aiDeckInstruction = (e.target as HTMLTextAreaElement).value; renderTodo(); refreshAiMore(); });
  // unified send: one button does text edits + 配图(矢量/照片) + 导入图 for the whole deck
  $('#aiSendAll').addEventListener('click', submitAll);
  // 本页 配图: pick type (segmented) + add to the 配图清单
  document.querySelectorAll('#illSeg .segbtn').forEach((b) => b.addEventListener('click', () => {
    illType = ((b as HTMLElement).dataset.illtype as 'vector' | 'chart' | 'photo') || 'vector';
    document.querySelectorAll('#illSeg .segbtn').forEach((x) => x.classList.toggle('on', x === b));
    const hint = $('#illHint') as HTMLTextAreaElement | null;
    if (hint) hint.placeholder = illType === 'chart' ? '粘贴数据或描述，例：方法A 78、方法B 88…分组柱状图；或点「导入数据文件」' : '想要什么画面（可留空）';
    const dp = $('#illDataPick'); if (dp) (dp as HTMLElement).style.display = illType === 'chart' ? '' : 'none';
  }));
  $('#illAdd').addEventListener('click', addIllustToQueue);
  $('#illDataPick').addEventListener('click', illDataPicker);
  // image tray: import + the dedicated drop-zone highlight (drop handled at window level)
  $('#trayPick').addEventListener('click', trayFilesPicker);
  $('#genOpenLib').addEventListener('click', openLibrary);
  // 元素批注小窗
  $('#annClose').addEventListener('click', closeAnnModal);
  $('#annCancel').addEventListener('click', closeAnnModal);
  $('#annAdd').addEventListener('click', addSlideAnn);
  $('#annModal').addEventListener('click', (e) => { if (e.target === $('#annModal')) closeAnnModal(); });
  ($('#annText') as HTMLTextAreaElement).addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); addSlideAnn(); }
  });
  $('#libClose').addEventListener('click', closeLibrary);
  $('#libReload').addEventListener('click', loadLibrary);
  $('#libModal').addEventListener('click', (e) => { if (e.target === $('#libModal')) closeLibrary(); });
  $('#imgSearchOpen').addEventListener('click', openImageSearch);
  $('#imgSearchClose').addEventListener('click', closeImageSearch);
  $('#imgSearchGo').addEventListener('click', () => { void runImageSearch(); });
  $('#imgSearchSrc').addEventListener('change', () => { if (($('#imgSearchQ') as HTMLInputElement).value.trim()) void runImageSearch(); });
  $('#imgSearchQ').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); void runImageSearch(); } });
  $('#searchModal').addEventListener('click', (e) => { if (e.target === $('#searchModal')) closeImageSearch(); });
  wireHelp();
  wireSwatches();
  renderTodo();
  { const z = $('#trayDrop'); if (z) {
    z.addEventListener('dragenter', (e) => { e.preventDefault(); setTrayOver(true); });
    z.addEventListener('dragover', (e) => { e.preventDefault(); setTrayOver(true); });
    z.addEventListener('dragleave', () => setTrayOver(false));
  } }
  $('#aiClearOne').addEventListener('click', () => {
    const box = $('#aiInstruction') as HTMLTextAreaElement; box.value = ''; onAiInput();
  });
  $('#aiRevertOne').addEventListener('click', () => { if (aiCurId) revertSlide(aiCurId); });
  const confirmTog = $('#aiConfirmTog') as HTMLInputElement | null;
  if (confirmTog) { confirmTog.checked = aiConfirm; confirmTog.addEventListener('change', () => { aiConfirm = confirmTog.checked; try { localStorage.setItem(CONFIRM_KEY, aiConfirm ? '1' : '0'); } catch { /* noop */ } }); }
  $('#aiKeep').addEventListener('click', keepProposed);
  $('#aiRevertAll').addEventListener('click', revertProposed);
  $('#auditRun').addEventListener('click', () => renderAuditReport(auditImportedDeck()));
  $('#expPdf').addEventListener('click', exportPdf);
  const remoteTog = $('#embedRemote') as HTMLInputElement | null;
  const newRoomTog = $('#newRoom') as HTMLInputElement | null;
  const newRoomWrap = $('#newRoomWrap') as HTMLElement | null;
  const relayWrap = $('#relayWrap') as HTMLElement | null;
  const relaySel = $('#relaySel') as HTMLSelectElement | null;
  const relayHint = $('#relayHint');
  if (relaySel) {
    relaySel.innerHTML = PR_RELAYS.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
    relaySel.value = relayId;
    const showHint = () => { const h = PR_RELAYS.filter((r) => r.id === relaySel.value)[0]; if (relayHint) relayHint.textContent = h ? h.hint : ''; };
    showHint();
    relaySel.addEventListener('change', () => {
      relayId = relaySel.value;
      try { localStorage.setItem('sm-relay', relayId); } catch { /* noop */ }
      showHint(); toast('中转已切到：' + (PR_RELAYS.filter((r) => r.id === relayId)[0]?.label || relayId));
    });
  }
  const passBox = $('#remotePass') as HTMLInputElement | null;
  if (passBox) passBox.addEventListener('input', () => { remotePass = passBox.value.trim(); void computePassHash(remotePass); });
  const syncRoomTog = () => {
    if (newRoomWrap) newRoomWrap.style.display = embedPhoneRemote ? '' : 'none';
    if (relayWrap) relayWrap.style.display = embedPhoneRemote ? '' : 'none';
  };
  if (remoteTog) { remoteTog.checked = embedPhoneRemote; remoteTog.addEventListener('change', () => { embedPhoneRemote = remoteTog.checked; syncRoomTog(); if (embedPhoneRemote) toast('导出的 HTML 将带「📱 手机遥控」按钮'); }); }
  if (newRoomTog) { newRoomTog.checked = newRoomOnExport; newRoomTog.addEventListener('change', () => { newRoomOnExport = newRoomTog.checked; if (newRoomOnExport) toast('导出时会铸新房间号 —— 手机要重扫码'); }); }
  syncRoomTog();

  // --- 文稿: notes + note blocks ---
  ($('#notes') as HTMLTextAreaElement).addEventListener('input', (e) => {
    const v = (e.target as HTMLTextAreaElement).value;
    deck.slides[cur].notes = v ? v : undefined;
  });
  $('#addCue').addEventListener('click', () => addNoteBlock('cue'));
  $('#addGolden').addEventListener('click', () => addNoteBlock('golden'));
  $('#addData').addEventListener('click', () => addNoteBlock('data'));

  // --- tabs ---
  document.querySelectorAll('.tab').forEach((tb) =>
    tb.addEventListener('click', () => {
      const name = (tb as HTMLElement).dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === tb));
      document.querySelectorAll('.pane').forEach((p) => ((p as HTMLElement).hidden = (p as HTMLElement).dataset.pane !== name));
    }),
  );

  // --- slide ops ---
  $('#add').addEventListener('click', addSlide);
  $('#del').addEventListener('click', delSlide);
  $('#up').addEventListener('click', () => moveSlide(-1));
  $('#down').addEventListener('click', () => moveSlide(1));

  $('#navtog').addEventListener('click', () => document.body.classList.toggle('navcollapsed'));
  $('#deckNavTog').addEventListener('click', () => {
    deckChromeOn = !deckChromeOn;
    try { localStorage.setItem('sm-deckchrome', deckChromeOn ? 'on' : 'off'); } catch { /* 无痕模式，忘掉就忘掉 */ }
    applyDeckChrome();
    toast(deckChromeOn ? '预览里显示 deck 自带的段导航' : '已收起段导航，宽度还给幻灯片');
  });
  applyDeckChrome();   // 开机把按钮状态和当前选择对上
  const expMenu = $('#expMenu'), expOpts = $('#expOpts');
  const closeExp = () => { expMenu?.classList.remove('show'); expOpts?.setAttribute('aria-expanded', 'false'); };
  expOpts?.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !expMenu?.classList.contains('show');
    expMenu?.classList.toggle('show', on);
    expOpts.setAttribute('aria-expanded', String(on));
  });
  expMenu?.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeExp);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeExp(); });
  document.querySelectorAll('.railtog').forEach((b) => b.addEventListener('click', () => setRightCollapsed(!document.body.classList.contains('panelcollapsed'))));
  try { if (localStorage.getItem(RAIL_KEY) === '1') setRightCollapsed(true); } catch { /* noop */ }
  $('#themeTog').addEventListener('click', toggleStudioTheme);
  initStudioTheme();
  markAppHost();
  $('#connectBtn').addEventListener('click', openConnectModal);
  $('#cclose').addEventListener('click', closeConnectModal);
  $('#connectModal').addEventListener('click', (e) => { if (e.target === $('#connectModal')) closeConnectModal(); });
  // import via the File System Access picker when available (captures a writable handle
  // so 保存 HTML can later overwrite in place); else fall back to the classic <input>.
  $('#imp').addEventListener('click', async () => {
    const w = window as unknown as { showOpenFilePicker?: (o?: unknown) => Promise<FsFileHandle[]> };
    if (w.showOpenFilePicker) {
      try {
        const [h] = await w.showOpenFilePicker({
          types: [{ description: 'HTML deck', accept: { 'text/html': ['.html', '.htm'] } }],
        });
        const file = await h.getFile();
        importFile(file.name, await file.text()); // clears fileHandle…
        fileHandle = h;                            // …then remember this one for overwrite-save
        return;
      } catch (e) { if ((e as Error).name === 'AbortError') return; /* else fall back */ }
    }
    ($('#file') as HTMLInputElement).click();
  });
  ($('#file') as HTMLInputElement).addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    f.text().then((t) => importFile(f.name, t)); // no handle from a plain <input> → save will prompt once
  });
  $('#saveHtml').addEventListener('click', () => { void saveHtmlInPlace(); });
  // 另存为：导出一份新的 HTML 副本（不覆盖原文件）。三级兜底，避免「闪一下找不到文件」：
  //   ① 连了 Claude（bridge）→ 存到 deck 同目录并在访达高亮（最稳，不靠浏览器下载）
  //   ② 原生「保存到…」对话框（能自己选文件夹）
  //   ③ 退回 blob 下载，并明确告知落到「下载」文件夹
  $('#expHtml').addEventListener('click', async () => {
    const html = mode === 'html' ? await buildExportHtml() : renderDeckHtml(deck);
    // 在 app 壳里：交给原生弹真正的「另存为」面板，用户自己挑位置和文件名。
    //
    // **这条以前没有，后果是「另存为」根本没在另存**：它走桥写盘，而桥只会写到
    // deck 旁边的同名文件——桥一旦知道原文件路径，那就是原文件本身，
    // 「另存为」等于变成了第二个「保存」，而且不弹任何窗口。
    const native = (window as unknown as {
      webkit?: { messageHandlers?: { smSaveAs?: { postMessage(m: unknown): Promise<string | null> } } };
    }).webkit?.messageHandlers?.smSaveAs;
    if (native) {
      try {
        const saved = await native.postMessage({ name: fileBase + '.html', html });
        if (saved) toast('✅ 已另存为：' + saved + '（已在访达高亮）');
        return;                       // 用户取消也到此为止，别再往下走
      } catch (e) {
        toast('另存为失败：' + ((e as Error).message || e), true);
        return;
      }
    }
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch(`${libBase()}/api/export-html?name=${encodeURIComponent(fileBase)}.html`, {
          method: 'POST', headers: { 'content-type': 'text/html;charset=utf-8' }, body: html,
        });
        const j = await r.json() as { ok: boolean; path?: string; error?: string };
        if (j.ok && j.path) {
          toast('✅ 已另存为：' + j.path + '（已在访达高亮）'
            + (embedPhoneRemote ? (newRoomOnExport ? ' · 已换新房间号，手机需重扫码' : ' · 沿用原房间号，手机不用重扫') : '')
            + (embedPhoneRemote ? ' · 中转 ' + (PR_RELAYS.filter((r) => r.id === relayId)[0]?.label || relayId)
                + (remotePassHash ? ' · 已设遥控密码' : '') : ''));
          return;
        }
      } catch { /* bridge 不可用 → 往下走 */ }
    }
    const w = window as unknown as { showSaveFilePicker?: (o?: unknown) => Promise<FsFileHandle> };
    if (w.showSaveFilePicker) {
      try {
        const h = await w.showSaveFilePicker({
          suggestedName: fileBase + '.html',
          types: [{ description: 'HTML deck', accept: { 'text/html': ['.html', '.htm'] } }],
        });
        const ws = await h.createWritable();
        await ws.write(html); await ws.close();
        toast('已保存：' + (h.name || fileBase + '.html'));
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // 用户取消对话框
        /* 其它错误 → 退回下载 */
      }
    }
    download(fileBase + '.html', html, 'text/html');
    toast('已下载到「下载」文件夹：' + fileBase + '.html', false);
  });

  // drag & drop import anywhere
  let dragN = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragN++; document.body.classList.add('dragging'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => { if (--dragN <= 0) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragN = 0; document.body.classList.remove('dragging'); setTrayOver(false);
    const dt = e.dataTransfer; if (!dt) return;
    // image files → stage them in the tray (AI-first: don't import an image as a deck).
    // Needs an open HTML deck to place into; otherwise tell the user to import one first.
    const imgFiles = Array.prototype.filter.call(dt.files || [], (f: File) => f.type.indexOf('image/') === 0) as File[];
    if (imgFiles.length && (!dt.files || imgFiles.length === dt.files.length)) {
      if (mode !== 'html') { toast('请先导入 HTML deck，再拖入图片素材', true); return; }
      imgFiles.forEach((f) => { const r = new FileReader(); r.onload = () => addTrayImage(f.name, String(r.result)); r.readAsDataURL(f); });
      toast(`已暂存 ${imgFiles.length} 张图片到「图片素材」，备齐后交给 AI 排版`);
      return;
    }
    // prefer a file-system handle (drag-drop on Chromium) so 保存 HTML can overwrite in place
    const item = dt.items && dt.items[0];
    const getH = item && (item as unknown as { getAsFileSystemHandle?: () => Promise<FsFileHandle | null> }).getAsFileSystemHandle;
    if (getH) {
      try {
        const h = await (item as unknown as { getAsFileSystemHandle(): Promise<FsFileHandle | null> }).getAsFileSystemHandle();
        if (h && h.kind !== 'directory' && h.getFile) {
          const file = await h.getFile();
          importFile(file.name, await file.text()); // clears fileHandle…
          fileHandle = h;                            // …then remember the dropped file
          return;
        }
      } catch { /* fall through to plain file read */ }
    }
    const f = dt.files?.[0]; if (f) f.text().then((t) => importFile(f.name, t));
  });

  // automation hooks: agents / verification can drive Studio programmatically
  (window as unknown as { __SM_IMPORT__: typeof importFile }).__SM_IMPORT__ = importFile;
  (window as unknown as { __SM_EXPORT_HTML__: () => string }).__SM_EXPORT_HTML__ = () =>
    mode === 'html' ? exportHtmlDeck() : renderDeckHtml(deck);
  (window as unknown as { __SM_BUILD_EXPORT__: () => Promise<string> }).__SM_BUILD_EXPORT__ = buildExportHtml;
  (window as unknown as { __SM_DEDUPE_FONTS__: typeof dedupeFontFaces }).__SM_DEDUPE_FONTS__ = dedupeFontFaces;
  (window as unknown as { __SM_USED_FONTS__: () => Record<string, string[]> }).__SM_USED_FONTS__ = () => Object.fromEntries(Array.from(usedFontWeights(), ([k, v]) => [k, Array.from(v)]));
  (window as unknown as { __SM_SAVE_HTML__: typeof saveHtmlInPlace }).__SM_SAVE_HTML__ = saveHtmlInPlace;
  (window as unknown as { __SM_HAS_FILE_HANDLE__: () => boolean }).__SM_HAS_FILE_HANDLE__ = () => !!fileHandle;
  (window as unknown as { __SM_SET_INSTR__: (id: string, t: string) => void }).__SM_SET_INSTR__ = (id, t) => {
    if (t) { aiInstructions[id] = t; aiApplied.delete(id); } else { delete aiInstructions[id]; }
    // 写的正好是当前页的话，文本框也得跟着变 —— 否则下一次 saveAiInstruction()
    // 会拿那个还空着的文本框把刚写进去的意见抹掉（真人走 UI 不会遇到，脚本会）。
    if (id === aiCurId) { const b = $('#aiInstruction') as HTMLTextAreaElement | null; if (b) b.value = t || ''; }
    if (mode === 'html') refreshTasks();
  };
  (window as unknown as { __SM_APPLY_PATCH__: typeof applyAiPatch }).__SM_APPLY_PATCH__ = applyAiPatch;
  // image-tray hooks (for automation / headless verification)
  (window as unknown as { __SM_TRAY_ADD__: typeof addTrayImage }).__SM_TRAY_ADD__ = addTrayImage;
  (window as unknown as { __SM_TRAY_SET_NOTE__: (id: string, n: string) => void }).__SM_TRAY_SET_NOTE__ = (id, n) => { const t = trayImages.find((x) => x.id === id); if (t) { t.note = n; renderTray(); } };
  (window as unknown as { __SM_TRAY_SET_PAGE__: (id: string, slideId: string) => void }).__SM_TRAY_SET_PAGE__ = (id, slideId) => { const t = trayImages.find((x) => x.id === id); if (t) { t.slideId = slideId; renderTray(); } };
  (window as unknown as { __SM_TRAY_LIST__: () => { id: string; name: string; note: string; placed: boolean; slideId: string }[] }).__SM_TRAY_LIST__ = () => trayImages.map((t) => ({ id: t.id, name: t.name, note: t.note, placed: t.placed, slideId: t.slideId }));
  // unified 配图清单 + 待办 + send hooks
  (window as unknown as { __SM_GEN_MARK__: (id: string, type?: 'vector' | 'chart' | 'photo', hint?: string) => void }).__SM_GEN_MARK__ = (id, type, hint) => { genQueue[id] = { type: type || 'vector', hint: hint || '' }; if (mode === 'html') refreshTasks(); };
  (window as unknown as { __SM_ILL_DATA__: (text: string, name?: string) => void }).__SM_ILL_DATA__ = (text, name) => applyIllData(text, name || 'data.csv');
  (window as unknown as { __SM_GEN_LIST__: () => { id: string; type: string; hint: string }[] }).__SM_GEN_LIST__ = () => Object.keys(genQueue).map((id) => ({ id, type: genQueue[id].type, hint: genQueue[id].hint }));
  (window as unknown as { __SM_TODO__: () => { label: string; page: number; cls: string }[] }).__SM_TODO__ = () => todoItems().map((it) => ({ label: it.label, page: it.page, cls: it.cls }));
  (window as unknown as { __SM_ALL_REQUEST__: typeof buildAllRequest }).__SM_ALL_REQUEST__ = buildAllRequest;
  (window as unknown as { __SM_SEND_ALL__: () => void }).__SM_SEND_ALL__ = submitAll;
  (window as unknown as { __SM_OPEN_LIBRARY__: () => Promise<void> }).__SM_OPEN_LIBRARY__ = openLibrary;
  (window as unknown as { __SM_AUDIT__: typeof auditImportedDeck }).__SM_AUDIT__ = auditImportedDeck;
  (window as unknown as { __SM_PDF_HTML__: typeof pdfPrintHtml }).__SM_PDF_HTML__ = pdfPrintHtml;
  // 预览里的 window.open shim 回头找它要一份「副屏能直接跑」的 deck HTML。
  // 用导出态（不带 contenteditable / 选中框 / keyguard 这些编辑脚手架），但**必须把手机遥控关掉**：
  // 房间号烘死在 deck 里，副屏再连一次就是同一房间的第二个放映端，会把主窗口顶掉（evicted）。
  (window as unknown as { __SM_PRESENTER_HTML__: () => string }).__SM_PRESENTER_HTML__ = () => {
    const saved = embedPhoneRemote;
    embedPhoneRemote = false;
    try { return assembleDeck(false); } finally { embedPhoneRemote = saved; }
  };
  // bridge hooks (for automation / headless verification)
  (window as unknown as { __SM_BRIDGE__: () => { connected: boolean; owner: { label: string; since: number } | null; port: number } }).__SM_BRIDGE__ = () => ({ connected: bridge.connected, owner: bridge.owner, port: bridge.port });
  // permission mode + proposal state (for verification)
  (window as unknown as { __SM_SET_CONFIRM__: (v: boolean) => void }).__SM_SET_CONFIRM__ = (v) => { aiConfirm = v; const t = $('#aiConfirmTog') as HTMLInputElement | null; if (t) t.checked = v; };
  (window as unknown as { __SM_PROPOSAL__: () => { count: number; visible: boolean } }).__SM_PROPOSAL__ = () => ({ count: proposed.size, visible: ($('#aiProposalBar')?.style.display !== 'none') });
  // resilience hooks (autosave / undo / image) for verification
  (window as unknown as { __SM_UNDO__: () => void }).__SM_UNDO__ = undo;
  (window as unknown as { __SM_REDO__: () => void }).__SM_REDO__ = redo;
  (window as unknown as { __SM_STATE__: () => { dirty: boolean; undo: number; redo: number; draft: boolean } }).__SM_STATE__ = () => {
    let draft = false; try { draft = !!localStorage.getItem(DRAFT_KEY); } catch { /* noop */ }
    return { dirty, undo: undoStack.length, redo: redoStack.length, draft };
  };
  (window as unknown as { __SM_PLACE_IMAGE__: (u: string) => void }).__SM_PLACE_IMAGE__ = placeImage;
  (window as unknown as { __SM_MOVE_SEL__: (dx: number, dy: number) => void }).__SM_MOVE_SEL__ = commitMove;
  (window as unknown as { __SM_RESIZE_SEL__: (w: number, h?: number) => void }).__SM_RESIZE_SEL__ = commitResize;
  (window as unknown as { __SM_GIZMO_ON__: () => boolean }).__SM_GIZMO_ON__ = () => !!gizmoEl;
  // 元素批注（自动化 / 无头验证）
  (window as unknown as { __SM_ANN_OPEN__: (slideId: string, sel: string) => boolean }).__SM_ANN_OPEN__ = (slideId, sel) => {
    const d = previewDoc(); const slide = d ? annSlideEl(d, slideId) : null;
    const el = slide?.querySelector(sel); if (!el) return false;
    openAnnFor(el); return true;
  };
  (window as unknown as { __SM_ANN_ADD__: (slideId: string, sel: string, note: string) => boolean }).__SM_ANN_ADD__ = (slideId, sel, note) => {
    const d = previewDoc(); const slide = d ? annSlideEl(d, slideId) : null;
    const el = slide?.querySelector(sel); if (!el) return false;
    openAnnFor(el);
    const t = $('#annText') as HTMLTextAreaElement | null; if (t) t.value = note;
    addSlideAnn(); return true;
  };
  (window as unknown as { __SM_ANN_LIST__: () => SlideAnn[] }).__SM_ANN_LIST__ = () => slideAnns.map((a) => ({ ...a, sel: { ...a.sel } }));
  (window as unknown as { __SM_ANN_BADGES__: () => number }).__SM_ANN_BADGES__ = () => previewDoc()?.querySelectorAll('.sm-annlayer .sm-annbadge').length || 0;
  (window as unknown as { __SM_ANN_CLOSE__: () => void }).__SM_ANN_CLOSE__ = closeAnnModal;

  // edits from the preview iframe
  window.addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d !== 'object') return;
    if (d.type === 'sm-cmdk') { openCmdk(); return; }
    if (d.type === 'sm-edit') applyEdit(d.bid, d.field, d.value);
    else if (d.type === 'sm-select') { selBid = d.bid; showBlock(d.bid, d.btype); }
    else if (d.type === 'sm-ready') gotoPreview(cur);
  });

  renderLeft(); refreshSlidePanel(); renderDoc(); reloadPreview();
  updateBridgeBadge(); connectBridge();
  maybeOfferDraftRestore();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
else buildUI();
