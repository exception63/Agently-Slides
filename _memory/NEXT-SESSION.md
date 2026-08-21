# 下个会话交接 · 做「批次二：Studio 右栏重构」

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。

---

## 一、下一件事就是这个：右栏重构（一～两天）

**改哪儿**：`packages/studio/src/main.ts`（网页版和 app 共用同一份，改完 `node scripts/build-studio.mjs`）。
右栏 markup 从 **4036 行** 起：`<aside class="right">` → `.railstrip`（折叠竖条）→ `#htmlpanel` → 五个 `.hpane`。

| tab | `data-hpane` | 起始行 | 控件数 |
|---|---|---|---|
| 格式 | `fmt` | 4052 | 20 |
| 设计 | `design` | 4098 | 10 |
| 动画效果 | `anim` | 4120 | 14 |
| AI 修改 | `ai` | 4158 | 19 |
| 提词 | `cue` | — | 11 |

### 要做的四件

1. **五个 tab 重新归类，讲稿提到一级。**
   用户自述最常用 = **「AI 修改」+「提词 / 讲稿」**，按这个排优先级，别照搬现在的顺序。
   讲稿现在只能从「AI 修改」里的按钮打开（modal），不是一级入口。
2. **折叠态别再竖排汉字。**
   现在 `.railstrip button.striptab` 用 `writing-mode:vertical-rl`（3830 行），
   于是「格/式」「动/画/效/果」每个字一行，几乎没法读。换成图标竖条。
3. **面板里说明文字比控件还多** → 收进 `?` 悬浮提示。
   机制现成：`<button class="ihelp" data-help="…">?</button>` + `wireHelp()`（2228 行），
   照 4099 / 4159 行那两处的写法用即可。
4. **三个原生 `<input type=color>` 换成网页内色板**（4057/4058/4060 行：`#hAccent` / `#hPaper` / `#hInk`）。
   ⚠️ **这条同时治好用户报的「调色要等一两秒」**：实测网页里应用只要 7ms、序列化 2ms，
   慢的是 **app 里 macOS 原生取色面板**往 WKWebView 送事件——换成网页内控件就不经过它了。

---

## 二、验证怎么做（这台机器有个大坑，照做省两小时）

⚠️ **合成鼠标点击和键盘输入进不了这个 app**（SwiftUI 控件、WebView 都不行；中文 `keystroke` 尤其）。
**只有辅助功能 API 的动作有效**，比如点菜单：
```bash
osascript -e 'tell application "System Events" to tell process "Slidesmith Studio" to click menu item "重新载入 Studio" of menu 1 of menu bar item "显示" of menu bar 1'
```
所以**所有网页 UI 的验证都在浏览器探针上做**，别试图驱动 app：

```bash
cp ~/.slidesmith/exports/DYQ-defense-一体版-学术题词版.html <scratchpad>/probe-deck.html
npx tsx packages/cli/src/index.ts serve --no-open -p 8790 <scratchpad>/probe-deck.html
```
Playwright 开 `http://127.0.0.1:8790/`（要测 app 里的样子就加 `?host=app`）。
⚠️ Playwright MCP 只许写仓库内路径，截图落 `.playwright-mcp/`（已 gitignore）。
⚠️ **别碰用户正开着的 8765**。

**模拟 WKWebView 的独门办法**：在浏览器里 `delete window.showSaveFilePicker`，
就能精确复现 app 的环境（这次找保存的 bug 全靠它）。

**看 app 的样子**用截图（`screencapture -R` 按窗口坐标截，别整屏——会把用户的聊天窗口截进去）：
```bash
osascript -e 'tell application "System Events" to tell process "Slidesmith Studio" to get {position, size} of front window'
```

**改了什么就要重建什么**：
- `packages/studio/` → `node scripts/build-studio.mjs`（桥每请求重读，⌘R 即见）
- `packages/bridge/` → **必须重启桥**（常驻进程不会重读源码）：重启 app，或 `lsof -ti tcp:8765 | xargs kill`
- `apps/SlidesmithStudio/` → `./scripts/install-studio-app.sh` + 重启 app

---

## 三、这一轮做完的（都已 commit + 实测，别重做）

| commit | 内容 |
|---|---|
| `e794e78` | **批次一**：`--sm-*` 令牌层（532 处硬编码 → 30）· 藏 deck 段导航并**接管 `--fit-scale`** · deck 顶栏防折行 · 草稿条改右下角 · 顶栏分组 + 导出选项收进 ⚙ |
| `c7ca556` | Claude 桥加 `/interrupt`（**stdin 控制协议，不是信号**）· `/sessions` · `/history` |
| `1daeb76` | Studio 把「当前选中页」报给桥，`/api/status` 带出来 |
| `07e337c` | AI 面板四件：工具卡片（新接 `case "user"` 收 tool_result）· 上下文自动带 · 历史会话可回 · 停这一轮 |
| `a6ea03b` | AI 面板视觉（`SMPalette` 对齐 Studio 令牌）+ **架构定案** |
| `8aedc24` | 修用户截图逮到的六件（气泡漏前言 · 深色不同步 · 首屏不铺满 · 顶部三处文件名 · deck 顶栏可编辑 · 药丸加「带上」） |
| `67c6a8f` `caa69ca` | **保存在 app 里从来没生效过**——两层根因，见下 |
| `ced4c57` | 「另存为」接上原生 NSSavePanel（以前既不弹窗、还写在原文件上）· 文件菜单加 ⌘S / ⌘⇧S |

### 架构定案（别再重开这个话题）
用户提过「app 只留预览用 HTML、其余原生 Swift + 液态玻璃、以后只开发 app 版」，
讨论后**决定不脱耦，app 和网页版保持一体**。依据见 `_memory/` 里的
[studio-app-web-coupled] 记忆和 commit `a6ea03b`。要点：右栏是预览里那个 DOM 的编辑器
（75 处直接摸 `htmlSelEl`/gizmo/`contentEditable`），原生化只会多一层协议，
且 `slidesmith_open` 走的是开浏览器。

---

## 四、这一轮踩过、会再犯的坑

1. **「保存」在 app 里从来没生效过**，而且是两层：
   ① `saveHtmlInPlace()` 只会走 File System Access API，WKWebView 两个都没有 →
   落到 `download()` 兜底 → 在 WKWebView 里等于什么都没发生，**还把页面导航去 blob URL**
   （症状：左右栏突然消失）。② 修好第一层后仍失败，因为**桥不知道这份 deck 是哪个文件**——
   用户是在 Studio 里点「导入 HTML」打开的，网页拿不到路径。
   现在：桥有 `/api/deck-path`，app 的 NSOpenPanel 回调负责上报；写不回原文件就**明确报错**，
   绝不再静默假装成功。**新写任何"写盘"路径都要守这条：宁可明说失败。**
2. **deck 顶栏（`.topbar__brand` / `__sub`）不在 `#deck` 里**，属于 `H.prelude`。
   已放开 contenteditable + `harvestTopbar()` 写回：**只搬文字不搬结构**（prelude 里还躺着
   `__SM_CUES__`/讲稿的 script，整块重序列化会出事）。
3. **`--fit-scale` 是 deck 自己算的**，公式里把段导航的 300px 硬编码了。Studio 已接管；
   注意**不能赌监听器注册顺序**（ready() 跑的时候 deck 引擎脚本还没执行），要隔几拍补算。
4. **Studio → 桥的上报通道**（`tellBridge()`）现在有 `selection` 和 `theme` 两条，
   右栏要往 app 报什么，照抄这个模式即可。
5. 系统保存面板归 macOS `openAndSavePanelService` 独立进程，**脚本按不到它的按钮**。

---

## 五、更早那些迭代的结论（还有效）

- **提词/讲稿的三条写入通道**：正文 `slidesmith_apply_patch`（`#deck > section[data-id]`）·
  手表提词 `slidesmith_cues`（`window.__SM_CUES__`）· 内嵌讲稿 `slidesmith_notes`（`window.__TXB64__`）。
  读之前一律先 `slidesmith_outline`；提词的键只认 `slidesmith_cues` 自己返回的 anchor。
- **数 `.slide` 要 scope 到 `#deck`**（缩略图导航里的小图也顶着 `.slide` 类）。
- **同一份数据别留两处**：`__SM_CUES__` 混进两块时浏览器认最后一份、Studio 改第一份，静默分家。
- **别猜广播频道名**，以 DOM 为准（`deckAPI.idx` 优先）。
- **git push 走 SSH-over-443**（origin 已切），别再耗 HTTPS。
- 手机遥控中转：`plugin/slidesmith/skills/phone-remote/relay && node relay.mjs --port 8799`（8787 被占）。
- 装 app：`./scripts/install-studio-app.sh`。

---

## 六、未决 / 别自作主张

- **三文件联动版**：讲稿在隔壁文件，Studio 读不到 → 讲稿批注对它不可用。一体版才是首选交付形态。
- **导出 PPTX**：方案早定稿（headless 截图 + python-pptx），动手前先问用户「图片版可接受吗」。
- **`~/.zshrc` 明文存着邮箱 SMTP 密码和 Gamma API key**，已提示用户，未处理。
- **协作环**：`slidesmith_get_requests` 返回的请求是用户主动提交的，**照做**，别判 stale 拒绝。
