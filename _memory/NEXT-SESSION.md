# 下个会话交接

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。
> 主线在「一」；「二」是已完成清单（别重做）；「三」是这台机器的验证坑（照做省两小时）。

---

## 一、下一件事：等用户试用「批注 → 一次发给 AI」后的反馈

**上一轮点名的两件（1a 找不到发送键 / 1b slides 元素批注）都做完了**，见 `d948559`。
用户还没亲手试过 —— 所以这一轮**先别急着往下加功能**，等他用一次再说。

### 已经做好的形状（试用时对照）
- **AI tab 上有数字角标**：待办几项就显示几，tooltip 写明构成；折成窄条也跟着走。
- **发送键有两颗、但发的是同一件事**：AI tab 里那颗，和讲稿弹窗底栏新加的那颗。
  底栏那句话会写清「本次发送 N 项：改字 1 · 配图 1 · 讲稿批注 2」，
  按完自动关弹窗 + 切回 AI tab，让人看见送走了什么。
- **元素批注**：预览里点中元素 → 上方那排把手第二颗 **💬** → 写一句 → 加批注。
  元素上留橙色序号角标（点开可看 / 可删），左栏那一页挂 ●，待办里是「批注 · 元素」。
  一页可以同时有「整页修改意见」和多条元素批注。

### 他大概率会接着提的（想清楚再动手，别抢跑）
1. **待办点一下跳过去**。现在待办行只能删、点不动。改字 / 配图 / 元素批注都该能
   「点一下跳到那一页（元素批注再滚到那个元素并选中）」。这条最像下一个自然需求。
2. **批注刷新就没了**。`autosaveDraft()` 只存 deck HTML，不存待办 —— 改字 / 配图 /
   导入图 / 讲稿批注一直都是这样，元素批注只是跟着一致。要做就四类一起做，别只补一类。
3. **左栏跟随滚动**（老问题，`五` 里那条）：还是要先问用户。

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
| `d948559` | **批注一次性发给 AI**：① AI tab 数字角标（折叠窄条也带）② 讲稿弹窗底栏＝发送键 + 「本次发送 N 项：…」的构成说明，发完关窗切回 AI tab ③ **slides 元素批注**：gizmo 第三把手 💬 → 小窗 → 元素上留序号角标、左栏挂 ●、待办里「批注 · 元素」，和改字/配图/导入图/讲稿批注**同一次发送**；AI 改完那页自动清。锚点＝**原文前 40 字**为主、tag/nth/class 兜底。角标**放映整层藏、导出零残留**。新增 `verify-annotations.mjs`（26/26），`AGENTS.md §4c/§5` 同步 |

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
node scripts/verify-studio-tabs.mjs && node scripts/verify-editor.mjs && node scripts/verify-ai-pane.mjs && node scripts/verify-annotations.mjs && node scripts/verify-present-fit.mjs && python3 scripts/verify-bridge-orphan.py
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
