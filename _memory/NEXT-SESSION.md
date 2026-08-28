# 下个会话交接

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。
> 主线在「一」；「二」是已完成清单（别重做）；「三」是这台机器的验证坑（照做省两小时）。

---

## 一、下一件事：再挑一两种玩法做出来

**「装配」这件事的形状已经定下来了**（2026-08-28）：`/slidesmith:live`，
在 `plugin/slidesmith/skills/live/`。插件已升到 0.3.0 并 `claude plugin update` 过，
`phone-remote` 也跟着第一次进了已装插件（之前它只在仓库里、命令行看不到）。

### 管理台已经 AI 化（2026-08-28 当天追加）
用户的原话：「我是指挥者，AI 是执行者」。所以给中转加了第二道门
`/api/agent/*` + Bearer 令牌，和管理台 `/api/admin/*` **共用同一份业务逻辑**；
客户端是 `skills/live/scripts/smlive.mjs`（rooms/new/rename/rm/sessions/items/export/
clear/close/open/urls/whoami，都支持 `--json`）。令牌在服务器 `/etc/smrelay/token`，
Mac 上 `~/.slidesmith/live.json`（0600）。**已部署上线并线上联调过**。

顺手修掉两个线上真 bug：① 条目 `ts` 库里是毫秒、场次时间是秒，接口原样吐毫秒 ——
管理台和导出把日期显示成**公元 58626 年**；现在接口对外统一成秒（WebSocket 那侧仍是毫秒，
大屏靠它，别顺手改）。② 服务器跑 UTC，导出时间差 8 小时；`smrelay.service` 里设 `TZ=Asia/Shanghai`。

⚠️ 部署走 `myspace ssh`（它转发 stdin，tar 管道直接推，不用 scp）；
公网 SSH 从这台机器连不通，`~/.myspace/config.json` 的 `host` 现在指着 Tailscale `100.89.145.35`。

### 已经有的
- **一种玩法 = 一个块目录** `assets/blocks/<key>/{slide.html, block.html, README.md}`
- **注入器** `scripts/inject-live.mjs <deck> --room <号>`：插页 + 烘配置 + 二维码库 + 遥控客户端，
  **幂等 + 可逆到字节一致**，加新块不用改它
- **块 qa**（扫码提问上墙）已从现场那份 `qa-block.html` 提炼成皮肤无关版，22 张皮通用
- **回归** `node scripts/verify-live-inject.mjs`（16/16 · 装配）和
  `node scripts/verify-live-agent.mjs`（22/22 · 管理 CLI）：都自己起一份本地中转，
  **不碰线上、不写用户真账本**。要连线上试就用一次性房间号，跑完删掉
  ⚠️ `verify-live-service.mjs` 起服务前要先放一个 `oldroom01.json` 夹具，否则最后一条必挂
  （不是回归，是缺夹具；脚本头部已注明）
- 三份 references：`protocol.md` / `admin-console.md` / **`new-block.md`（加玩法必读）**

### ⚠️ 动手加第二种玩法前，先读 `references/new-block.md`
交接里那句「新玩法只写两页、中转一行不用改」**只在复用 `qa-*` 消息时成立**。
`smrelay.py` 的 `on_message()` 是**类型白名单**，自己造 `{type:"vote"}` 会被默默丢掉、
两头都不报错；学生页 `/q/<房间>` 也是中转写死的提问页，换不了。两条路：
**A 搭 qa 便车**（`text` 里编码，吃 4 秒节流，零风险）· **B 改服务端**（`item.kind` 字段早就留好了）。
建议第二种玩法先走 A 试水，要上三种以上再一次性做 B。

菜单和每种玩法该走哪条路，表在 `new-block.md` 里。抢答**必须走 B**（4 秒节流废掉抢答）。

### 还没做的
- 用户还没试用过这个 skill —— **先等他用一次的反馈，再决定下一种玩法做哪个**
- 管理台目前只认「提问」一种条目；真上了第二种玩法，导出和展示要按 `kind` 分开

## 二、已完成（别重做）

| commit | 内容 |
|---|---|
| `e794e78` | **批次一**：`--sm-*` 令牌层 · 藏 deck 段导航并接管 `--fit-scale` · 顶栏分组 |
| `523e23f` | **批次二 · 右栏重构**：tab 重排成 `AI·讲稿·格式·动画·设计`（默认 AI，点中元素自动切「格式」）· 讲稿+提词合并成一级 tab · 折叠竖条换 SVG 图标 · 6 处说明收进 `?` · **原生取色器全换成网页内色板** · 配色去重 |
| `2c60851` | **左栏导航跟随**：预览里点某页 / 光标落进某页 / 打字 → 左栏高亮并滚过去。连带修好「点进第 8 页写的意见被记到第 1 页」 |
| `b29c580` | **AI 面板秒回陈年回复**：CLI 会自己起「没有用户输入的轮次」（后台任务完成通知），桥读完就不读 stdout 了，下一句进来秒回旧答案、**此后永久错位一格**。改成 stdout 常驻读线程 + 喂新话前排干 |
| `c745e2e` | **全屏播放画面偏出可视区**：`transform:scale()` 不改布局尺寸，1920×1080 的盒子在所有笔记本上都把容器撑出滚动条。负 margin 收回布局盒子；模板 + Studio 注入 + 33 份成品一起修 |
| `fc1a4da` | 导出的 deck 放映时藏起「📱 手机遥控」按钮（配对二维码遮罩一起藏） |
| — | **现场互动（2026-08-28，不在本仓库的交付）**：企业管理培养方案宣讲 deck（31 页 academic）+ 一体版讲稿 + 扫码提问。自托管中转 `smrelay` 上线 `live.zhouliying.com`；`phone-remote` 角色扩到 5 个、deck 改先到先得 + 显式接管、iPad 加问答模式、问题落盘；修掉 `PFEED.chan` 未判空致讲稿首推丢失的既有 bug。三端联调 12/12。全套已归档到 Aboutme 的导师组模块 |
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
