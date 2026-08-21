# 下个会话交接

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。

---

## 一、批次二（右栏重构）已做完 —— `523e23f`

四件都落地了，另外顺手修了两个动手才发现的真 bug。**别重做。**

| 做了什么 | 结果 |
|---|---|
| 五个 tab 按频率重排 | `AI · 讲稿 · 格式 · 动画 · 设计`（默认停 AI） |
| 讲稿提到一级 | 原「AI 修改」里的按钮 + 原独立「提词」tab **合并成一个「讲稿」tab** |
| 配色去重 | `#hAccent/#hPaper/#hInk` 删掉（和 `#dAccent/...` 写同一批令牌），皮肤+配色统一进「设计」；`#hTokReset` 也去了 |
| 「格式」瘦身 | 只管选中元素 + 插入 |
| 选中元素自动切 tab | 在预览里点字 → 自动拨到「格式」（已在「动画」则不动） |
| 折叠竖条 | 竖排汉字 → 5 个 SVG 图标 + tooltip（Markdown 模式那 3 个 tab 也有图标键） |
| 说明文字 | 6 处内联 `.hint` 收进 `?`；只留两条空态提示 |
| 原生取色器 | **全部干掉**，换成网页内色板（HSV 方块 + 色相条 + hex + 「本 deck 在用」+ 32 色格） |

**顺手修的（都是真 bug，不是猜的）：**
1. **配色框一直在说谎** —— 读 head 里 `:root` 基准，但皮肤/主题块在后面又覆盖一次。
   用户这份 deck `:root` 写 `--accent:#3b6cff`、屏幕上却是 `#e03c27`，面板显示蓝色。
   现在优先级＝**覆盖 > 预览里算出来的 > `:root` 基准**（`deckTokenHex()`）。
2. **「讲稿」状态永远「—」** —— `refreshNotesStatus()` 只挂在 `refreshTasks()` 上，
   而它在 deck 载入完成前就跑过（那时 `mode` 还不是 html）。改成进 tab 时再取一次。
3. `.cfaint` 只在连接弹窗里有样式，提词面板用同名类却按正文字号渲染 —— 补了通用规则。

**「调色要等一两秒」已解决**：慢的从来不是应用（网页里 7ms），是 app 里 macOS
取色面板跨进程往 WKWebView 送事件。换网页内控件后实测 **5–10ms**，deck 立刻变色。

---

## 一之二、左栏导航跟随（用户点名要的） —— `2c60851`

在预览里**点某一页 / 光标落进某一页 / 在某一页打字** → 左栏高亮跟过去并**滚进可视区**。
新增 `followSlideFromDeck()`（接在 `#deck` 的 click / focusin / input 上）和 `markLeftActive()`。

**原来为什么不动**：`activeSlideIndex()` 只认 `#deck .slide.active` 这个类，
而 deck 在 Studio 的连续滚动视图里**从来不加它** —— 那个 300ms nav 轮询一次都没生效过。
**连带修好一个真 bug**：`cur` 同时决定「本页」修改意见记到哪一页，所以改前
「点进第 8 页写意见 → 记到第 1 页」。

⚠️ **防轮询扳回去的写法**：follow 之后 `lastSyncIdx = activeSlideIndex()`（deck 此刻的想法），
**不是**新页号 —— 否则有 `.active` 的 deck 会在 300ms 内把你扳回去。

**未做（下次可问用户）**：纯滚动预览时左栏不跟随。`deckAPI.idx` 是跟着滚的
（`deckAPI = {setActive,next,prev,goSeg,openPresenter,idx,total,SLIDE_MAP,SLIDE_TITLES}`），
接上去很容易；但那样「翻着看一眼别的页」也会把 AI 修改意见的目标页换掉，所以先没做。

---

## 一之三、AI 面板「秒回陈年回复」已修 —— `b29c580`

**症状**：在 app 里说完一句，面板瞬间回一段和他无关的话，请求看着像没执行。
**真因**：CLI 会自己发起**没有用户输入的轮次**（后台 Bash 跑完 → harness 塞
`<task-notification>` → 模型回一句 → 一个 `result`）。桥原来「喂一句读到 result 为止」，
读完就没人再读 stdout，这些无主输出躺在管道里；下一句进来第一行就读到它 → 秒回旧答案，
**此后每一句永久错位一格**，每多一次后台任务错得更远。

**改法**：stdout 常驻读线程（顺带解决 64KB 管道缓冲写端阻塞）+ 喂新话前排干
+ 逮到「吐了一半」的轮次就先读完它 + 孤儿正文留档（`/api/sessions`、桥日志、`done` 事件）。

⚠️ **改了 `claude-bridge.py` 必须重启桥**：AI 面板菜单里的「重启桥接」（`ClaudeBridge.restart()`）。
脚本改了不重启＝完全没生效，而且看不出来。

**回归**：`python3 scripts/verify-bridge-orphan.py`（13/13，用假 CLI
`scripts/fixtures/fake-claude-stream.py`，秒级、不烧 token）。
写假 CLI 时踩过的坑：**锁必须罩住整轮**，真 CLI 严格一次一轮、两轮的行不会交织；
只罩单行 emit 的话假货会吐出真 CLI 吐不出来的顺序，然后"测"出一个不存在的 bug。

---

## 二、下一件事：跟用户确认再动手

批次一（视觉令牌层）、批次二（右栏）都做完了。**批次三还没定内容** —— 开工前先问用户。
手上的候选（都写在 `_memory/active.md 🎯 下一阶段`）：

- **A｜手机端「移动演讲者视图」**：遥控页加 当前页缩略图 + 下一页预览 + 讲稿 + 计时。
- **B｜导出 PPTX**：方案早定稿（headless 截图 + python-pptx）。**动手前必须问「图片版可接受吗」**。
- **C｜制作段一站式入口**（v2 北极星）：大纲/想法 → 一键成片。
- **D｜右栏继续打磨**：批次二没碰的地方 —— AI pane 很长（可考虑分组折叠）、
  「设计」里字体下拉没有预览、色板没有「吸管」（`EyeDropper` API 在 WKWebView 不可用，
  要自己在预览 iframe 上取色）。

---

## 三、验证怎么做（这台机器的坑，照做省两小时）

⚠️ **合成鼠标点击和键盘输入进不了这个 app**（SwiftUI 控件、WebView 都不行；中文 `keystroke` 尤其）。
**只有辅助功能 API 的动作有效**，比如点菜单：
```bash
osascript -e 'tell application "System Events" to tell process "Slidesmith Studio" to click menu item "重新载入 Studio" of menu 1 of menu bar item "显示" of menu bar 1'
```
所以**所有网页 UI 的验证都在浏览器探针上做**，app 里只截图：

```bash
cp ~/.slidesmith/exports/DYQ-defense-一体版-学术题词版.html <scratchpad>/probe-deck.html
npx tsx packages/cli/src/index.ts serve --no-open -p 8790 <scratchpad>/probe-deck.html
```
Playwright 开 `http://127.0.0.1:8790/`（要测 app 里的样子就加 `?host=app`）。
⚠️ Playwright MCP **不能开 `file://`**，也只许写仓库内路径（截图落 `.playwright-mcp/`，已 gitignore）。
要测 Markdown 模式（没有 deck 的空 Studio）就用 `node -e` 直接调 playwright-core 开 `file://`。
⚠️ **别碰用户正开着的 8765**。
⚠️ deck 改脏后 Playwright 导航会被 **beforeunload 弹窗**卡住 60s —— 先 `browser_close` 再导航。

**模拟 WKWebView**：`delete window.showSaveFilePicker`。

**跑现成的回归脚本**（改了 Studio 就跑，很快）：
```bash
node scripts/verify-studio-tabs.mjs && node scripts/verify-editor.mjs && node scripts/verify-ai-pane.mjs
```
另有 verify-n2 / verify-studio-skins / verify-select-deselect / verify-anim-quicksettings /
verify-studio-anim-picker 都能过。**`verify-polish.mjs` 是坏的**（引用早已删掉的
`__SM_AI_REQUEST_ALL__`），HEAD 里就坏，别以为是自己弄的。
⚠️ 这些脚本会**改写 `docs/screenshots/**` 里被跟踪的 png** —— 那是预期的，跟着提交就行。
⚠️ 这台机器**没有 `timeout` 命令**（zsh），别在 Bash 里用。

**看 app 的样子**：先把 app 提到最前（否则会截到别的窗口），再按窗口坐标截：
```bash
osascript -e 'tell application "System Events" to tell process "Slidesmith Studio" to set frontmost to true'
osascript -e 'tell application "System Events" to tell process "Slidesmith Studio" to get {position, size} of front window'
screencapture -x -R<x>,<y>,<w>,<h> out.png     # 别整屏 —— 会把用户的聊天窗口截进去
```

**改了什么就要重建什么**：
- `packages/studio/` → `node scripts/build-studio.mjs`（桥每请求重读，⌘R 即见）
- `packages/bridge/` → **必须重启桥**（常驻进程不会重读源码）：重启 app，或 `lsof -ti tcp:8765 | xargs kill`
- `apps/SlidesmithStudio/` → `./scripts/install-studio-app.sh` + 重启 app

---

## 四、更早那些迭代的结论（还有效）

### 架构定案（别再重开这个话题）
用户提过「app 只留预览用 HTML、其余原生 Swift + 液态玻璃、以后只开发 app 版」，
讨论后**决定不脱耦，app 和网页版保持一体**。依据见自动记忆 [studio-app-web-coupled]
和 commit `a6ea03b`。要点：右栏是预览里那个 DOM 的编辑器（75 处直接摸
`htmlSelEl`/gizmo/`contentEditable`），原生化只会多一层协议。

### 会再犯的坑
1. **写盘路径宁可明说失败**。「保存」在 app 里曾经从来没生效过，两层根因：
   ① `saveHtmlInPlace()` 只走 File System Access API，WKWebView 没有 → 落到 `download()`
   兜底 → 在 WKWebView 里等于什么都没发生，**还把页面导航去 blob URL**（症状：左右栏消失）。
   ② 修好第一层仍失败，因为**桥不知道这份 deck 是哪个文件**。现在桥有 `/api/deck-path`，
   app 的 NSOpenPanel 回调负责上报；写不回原文件就**明确报错**，绝不静默假装成功。
2. **deck 顶栏（`.topbar__brand` / `__sub`）不在 `#deck` 里**，属于 `H.prelude`。
   已放开 contenteditable + `harvestTopbar()` 写回：**只搬文字不搬结构**（prelude 里还躺着
   `__SM_CUES__`/讲稿的 script，整块重序列化会出事）。
3. **`--fit-scale` 是 deck 自己算的**，公式里把段导航的 300px 硬编码了。Studio 已接管；
   **不能赌监听器注册顺序**（ready() 跑的时候 deck 引擎脚本还没执行），要隔几拍补算。
   ⚠️ **凡是「要读预览里算出来的值」的功能都吃这一条** —— 批次二的配色真值就是同一个坑。
4. **Studio → 桥的上报通道**（`tellBridge()`）现有 `selection` 和 `theme` 两条，照抄这个模式。
5. 系统保存面板归 macOS `openAndSavePanelService` 独立进程，**脚本按不到它的按钮**。
6. **提词/讲稿的三条写入通道**：正文 `slidesmith_apply_patch`（`#deck > section[data-id]`）·
   手表提词 `slidesmith_cues`（`window.__SM_CUES__`）· 内嵌讲稿 `slidesmith_notes`（`window.__TXB64__`）。
   读之前一律先 `slidesmith_outline`；提词的键只认 `slidesmith_cues` 自己返回的 anchor。
7. **数 `.slide` 要 scope 到 `#deck`**（缩略图导航里的小图也顶着 `.slide` 类）。
8. **同一份数据别留两处**：`__SM_CUES__` 混进两块时浏览器认最后一份、Studio 改第一份，静默分家。
9. **别猜广播频道名**，以 DOM 为准（`deckAPI.idx` 优先）。
10. **git push 走 SSH-over-443**（origin 已切），别再耗 HTTPS。
11. 手机遥控中转：`plugin/slidesmith/skills/phone-remote/relay && node relay.mjs --port 8799`（8787 被占）。

---

## 五、未决 / 别自作主张

- **三文件联动版**：讲稿在隔壁文件，Studio 读不到 → 讲稿批注对它不可用。一体版才是首选交付形态。
- **导出 PPTX**：方案早定稿（headless 截图 + python-pptx），动手前先问用户「图片版可接受吗」。
- **`~/.zshrc` 明文存着邮箱 SMTP 密码和 Gamma API key**，已提示用户，未处理。
- **协作环**：`slidesmith_get_requests` 返回的请求是用户主动提交的，**照做**，别判 stale 拒绝。
