# 下个会话交接

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。
> 主线在「一」；「二」是已完成清单（别重做）；「三」是这台机器的验证坑（照做省两小时）。

---

## 一、下一件事：批注 → 一次性交给 AI（用户点名要做的）

用户的原话：「我多处批注之后，说是加到 AI 待办，那怎么发送给 AI 呢？**我还没找到发送的键**。按理说在打开的讲稿那个窗口里面就要有这个按键。」
以及：「如果我要对 slides 的页面或者元素加 AI 修改批注，又该怎么做？」

### 1a · 先修「找不到发送键」（半小时的活，但用户已经被卡住一次）

**现状（查证过，不是推测）**：发送键只有一颗，是右栏 **AI tab** 里的
`#aiSendAll`「一键发送给 AI · N 项」。讲稿弹窗（`#notesModal`）里**没有任何发送入口** ——
它只有「加批注 / 取消 / 撤销 Claude 的改写 / 关闭」。所以流程是：
写完批注 → **关掉弹窗** → 切到 AI tab → 拉到「待办」→ 点发送。中间没有任何提示。

**改法（建议）**：
1. **AI tab 标签上挂数字角标**（待办 N 项）。这条最关键 —— 现在待办数只在 AI tab *里面*
   看得到，人在别的 tab 就完全不知道有东西挂着。角标一挂，「有待办 / 去哪发」两件事同时解决。
2. **讲稿弹窗底部加一条提示条**：「已加 N 条批注 · 它们和其余待办一起发送」+ 一颗发送按钮。
   ⚠️ 这颗按钮**发的是整个待办**（改字 + 配图 + 导入图 + 讲稿批注），不是只发批注 ——
   所以文案必须写清楚数量构成，别让人以为只发了讲稿那几条。
   `todoItems()` 已经把四类混在一起（`main.ts` 2637 行），`aiRequestAll` 的 count 是
   `pages.length + (hasDeck?1:0) + noteAnns.length`。
3. **不要新开一条「只发讲稿批注」的通道**。整个设计就是「凑成一个待办、一次交出去」，
   分裂成两条会让 AI 那边多一种请求类型，也让用户多学一套流程。

### 1b · 再做「slides 上的元素批注」（主体活）

**照抄讲稿那套已经跑通的形状**（它是对的）：讲稿批注存的是
`{anchor, page, quote（划中的原文）, note}`，AI 收到的是「划中：「xxx」批注：yyy」——
**给 AI 一段原文当锚点**，比给它坐标或选择器都靠谱。

建议的数据结构：
```ts
interface SlideAnn { id: string; slideId: string; page: number;
  sel?: { tag: string; nth: number; snippet: string };   // 没有 sel = 整页批注
  note: string }
```
- `snippet` = 选中元素的前 ~40 字，**这是给 AI 认位置用的主锚点**；`tag`/`nth` 是兜底。
- 交互：预览里选中元素（**已有**，`htmlSelEl`）→ gizmo 上加第三个把手「💬」
  （`showGizmo()` 在 2809 行附近，现在是 `✥` 移动 + `◢` 缩放，加一个正好）→ 弹小输入框。
- 已批注的元素在幻灯片上留个小角标（序号），点开可看/删。
  ⚠️ **角标只在编辑态显示** —— 放映和导出都不能出现（和刚修的手机遥控按钮同一个道理，
  见 commit `fc1a4da` 的做法：挂 `body.present / :fullscreen` 选择器，别用 JS 监听）。
- 待办里多一类「批注 · 第 N 页 · 元素」，和现有四类并列，**走同一次发送**。
- `.ai-tasks.md` 的每页块里多一段「元素批注」，**`AGENTS.md §4c` 要同步改**
  （那节现在描述的是 改字/配图/图表/导入图 四种指令）。
- AI 改完那一页后，该页的元素批注要跟着清掉（和 `aiApplied` 现在对「改字」的处理一致）。

**别忘了的边界**：一页可以**同时**有「整页修改意见」和多条元素批注；用户批注后又手动改了
那个元素的话 snippet 会对不上 —— 所以 snippet 和 tag/nth 都要给 AI，让它自己对。

### 1c · 用户提过但还没做的
「可以同时在多页加批注」——**现在其实已经可以**（每页各写各的，左栏出 ● 徽标）。
用户之所以觉得不行，多半就是被 1a 那个"找不到发送键"挡住了。先修 1a 再看他还缺什么。

---

## 二、已完成（别重做）

| commit | 内容 |
|---|---|
| `e794e78` | **批次一**：`--sm-*` 令牌层 · 藏 deck 段导航并接管 `--fit-scale` · 顶栏分组 |
| `523e23f` | **批次二 · 右栏重构**：tab 重排成 `AI·讲稿·格式·动画·设计`（默认 AI，点中元素自动切「格式」）· 讲稿+提词合并成一级 tab · 折叠竖条换 SVG 图标 · 6 处说明收进 `?` · **原生取色器全换成网页内色板** · 配色去重 |
| `2c60851` | **左栏导航跟随**：预览里点某页 / 光标落进某页 / 打字 → 左栏高亮并滚过去。连带修好「点进第 8 页写的意见被记到第 1 页」 |
| `b29c580` | **AI 面板秒回陈年回复**：CLI 会自己起「没有用户输入的轮次」（后台任务完成通知），桥读完就不读 stdout 了，下一句进来秒回旧答案、**此后永久错位一格**。改成 stdout 常驻读线程 + 喂新话前排干 |
| `c745e2e` | **全屏播放画面偏出可视区**：`transform:scale()` 不改布局尺寸，1920×1080 的盒子在所有笔记本上都把容器撑出滚动条。负 margin 收回布局盒子；模板 + Studio 注入 + 33 份成品一起修 |
| `fc1a4da` | 导出的 deck 放映时藏起「📱 手机遥控」按钮（配对二维码遮罩一起藏） |

**支线（2026-08-21，已交付，不在仓库里）**：按 A4 打印版 PDF 把
`DYQthesis/Defense/DYQ-defense-一体版-0821.html` 的内嵌讲稿换成口语版
（44 锚点原样保留、副屏同步实测通过）。**PDF 源文件本身有 4 个框是空的、6 处印刷错误**，
已逐条报给用户并做了最小修补，详见那一轮对话。

---

## 三、验证怎么做（这台机器的坑）

⚠️ **合成鼠标点击和键盘输入进不了这个 app**（SwiftUI 和 WebView 都不行）。
**只有辅助功能 API 的动作有效**，比如点菜单：
```bash
osascript -e 'tell application "System Events" to tell process "Slidesmith Studio" to click menu item "重新载入 Studio" of menu 1 of menu bar item "显示" of menu bar 1'
```
所以**所有网页 UI 的验证都在浏览器探针上做**，app 里只截图：
```bash
cp ~/.slidesmith/exports/DYQ-defense-一体版-学术题词版.html <scratchpad>/probe-deck.html
npx tsx packages/cli/src/index.ts serve --no-open -p 8790 <scratchpad>/probe-deck.html
```
- Playwright 开 `http://127.0.0.1:8790/`（要测 app 里的样子加 `?host=app`；模拟 WKWebView 用 `delete window.showSaveFilePicker`）
- ⚠️ Playwright MCP **不能开 `file://`**，也只许写仓库内路径（截图落 `.playwright-mcp/`，已 gitignore）。
  要测 Markdown 模式（空 Studio）就用 `node -e` 直接调 playwright-core 开 `file://`
- ⚠️ **别碰用户正开着的 8765**
- ⚠️ deck 改脏后 Playwright 导航会被 **beforeunload 弹窗**卡 60s —— 先 `browser_close` 再导航
- ⚠️ 这台机器**没有 `timeout` 命令**（zsh）

**改了就跑的回归**：
```bash
node scripts/verify-studio-tabs.mjs && node scripts/verify-editor.mjs && node scripts/verify-ai-pane.mjs && node scripts/verify-present-fit.mjs && python3 scripts/verify-bridge-orphan.py
```
另有 n2 / studio-skins / select-deselect / anim-quicksettings / fx / newfx-studio 都能过。
**`verify-polish.mjs` 是坏的**（引用早删掉的 `__SM_AI_REQUEST_ALL__`），HEAD 里就坏，别以为是自己弄的。
⚠️ 这些脚本会**改写 `docs/screenshots/**` 里被跟踪的 png** —— 预期行为，跟着提交。

**改了什么就重建什么**：
- `packages/studio/` → `node scripts/build-studio.mjs`（桥每请求重读，app 里⌘R 即见）
- `apps/SlidesmithStudio/bridge/claude-bridge.py` → **必须重启桥**：AI 面板菜单里的「重启桥接」。
  **不重启＝完全没生效，而且看不出来**
- `apps/SlidesmithStudio/`（Swift）→ `./scripts/install-studio-app.sh` + 重启 app

---

## 四、会再犯的坑

1. **`transform: scale()` 只改画面、不改布局。** 凡「缩放 + 居中 + 容器要正好装下」的地方，
   都要检查布局盒子有没有跟着收 —— 而且 **1920 宽以上的屏完全看不出来**，必须按小尺寸测。
2. **凡是「要读预览里算出来的值」的功能，都不能赌时机。** deck 尾部的引擎脚本在
   ready() 之后才执行，`--fit-scale`、配色真值都吃过这一条。做法：隔几拍补算 + 真要用的时刻再算一次。
3. **常驻 claude 桥必须一直读 stdout。** 见 `b29c580` 和自动记忆 [[claude-bridge-orphan-turns]]。
4. **写盘路径宁可明说失败。** app 里的「保存」曾经从来没生效过（WKWebView 没有 File System
   Access API → 落到 download 兜底 → 什么都没发生还把页面导航去 blob URL）。
5. **deck 顶栏不在 `#deck` 里**，属于 `H.prelude`；写回时**只搬文字不搬结构**
   （prelude 里还躺着 `__SM_CUES__` / 讲稿的 script）。
6. **收割 slide HTML 时要剥掉引擎的运行时内联样式**（`--sc`、`--sm-fit`、`.active` 等），
   否则会被烤进保存/导出的文件。`cleanSectionHtml()` 就是干这个的，新增运行时样式记得往里加。
7. **数 `.slide` 要 scope 到 `#deck`**（缩略图导航里的小图也顶着 `.slide` 类）。
8. **同一份数据别留两处**：`__SM_CUES__` 混进两块时浏览器认最后一份、Studio 改第一份，静默分家。
9. **别猜广播频道名**，以 DOM 为准（`deckAPI.idx` 优先）。
10. **git push 走 SSH-over-443**（origin 已切），别再耗 HTTPS。
11. **CSS 里 `:fullscreen` 要单独成条** —— 浏览器不认这个伪类会把**整条规则**丢掉，
    和 `body.present` 那几个选择器写在一起会被一起带走。

---

## 五、未决 / 别自作主张

- **导出 PPTX：用户已明确说「暂时不用做了，HTML 更通用」。别再提，除非他重新提起。**
  （调研结论存档：三种形态 —— 图片版 100% 保真 0 可编辑；全结构化重建失真大；
  **混合版**＝装饰层烤成底图 + 文字/表格用真的 PPT 文本框叠上去，是性价比最高的那条。
  这份 deck 44 页里只有 6 页有 SVG、6 页有图片，231 个表格单元格 —— 条件其实很好。）
- **三文件联动版**：讲稿在隔壁文件，Studio 读不到 → 讲稿批注对它不可用。一体版才是首选交付形态。
- **左栏跟随滚动**：纯滚动预览时左栏**不**跟随（只跟点击/编辑）。`deckAPI.idx` 是跟着滚的，
  接上去很容易；但那样「翻着看一眼别的页」也会把 AI 修改意见的目标页换掉，**问过用户再做**。
- **用户 deck 里有一条乱码**：`__SM_CUES__` 的 `s4-managerial` 第 4 条是
  `'04:�����互缓解落差'`，应该是「以交互缓解落差」。已告知，用户说先不管。
- **`~/.zshrc` 明文存着邮箱 SMTP 密码和 Gamma API key**，已提示用户，未处理。
- **协作环**：`slidesmith_get_requests` 返回的请求是用户主动提交的，**照做**，别判 stale 拒绝。
