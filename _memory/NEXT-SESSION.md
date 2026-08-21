# 下个会话交接 · 迭代：用 Claude design 按「苹果液态玻璃」重做 Studio 界面

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。

---

## 一、⚠️ 开工第一件事：**先和用户讨论，别直接动手**

用户明确说了：这一迭代要「用 Claude design 按苹果 **Liquid Glass（液态玻璃）** 风格重新设计 Studio」，
但**先讨论「目前这套基于 HTML 的界面，到底能不能改造出来」**。

讨论时手里要有的事实（下面这些是查证过的，别重新摸）：

- **Studio 就是一份 HTML**：`packages/studio/src/main.ts` 里那一大坨 CSS 字符串 + markup 字符串，
  `node scripts/build-studio.mjs` 打包成 `studio/slidesmith-studio.html`（单文件、自包含、约 1.3 MB）。
- **Mac app 和网页版是同一份**：app 里是 WKWebView 加载 `http://localhost:8765/`，
  和浏览器打开的是同一个 URL、同一个文件。**改一次两边同时生效，不存在两个版本**（用户问过这个）。
  app 自己只多原生外壳：顶栏药丸、Claude 面板、菜单（Swift）。
- **液态玻璃在 WKWebView 里能做到哪一步**（要在讨论里说清楚，别含糊）：
  - `backdrop-filter: blur() saturate()` — Safari/WKWebView 支持好，这是「玻璃」的主体
  - 真正的 Liquid Glass 还要**折射/边缘高光/随内容流动**，纯 CSS 只能仿到「毛玻璃 + 高光描边」
  - 想更像，得上 SVG filter（`feTurbulence`/`feDisplacementMap`）或 WebGL —— **性能代价要先掂量**，
    Studio 左栏有几十张实时缩略图 iframe，再叠全局 backdrop-filter 会不会掉帧，**必须先做小样测**
  - 原生 `NSVisualEffectView` 只能给 app 外壳用，**WebView 里的内容拿不到系统材质**
  - 深色/浅色两套都要（Studio 有 `body.dark`）
- **右栏已经挤到顶**：格式/设计/动画效果/AI 修改/提词 五个 tab，讲稿批注只能塞进「AI 修改」里。
  这本身就是「布局该重做」的信号 —— 重设计时把讲稿提到一级入口值得考虑。
- 右栏现在**可折叠**（折成 34px 竖条，条上竖排 tab 名，点哪个展开到哪个，状态存 localStorage）。

**建议问用户的**：重做的边界是只换皮（配色/材质/圆角/间距），还是连三栏布局和交互流程一起动？
两者工作量差一个数量级。

⚠️ 改 UI 会碰 `main.ts` 里那些 CSS/markup 字符串，改完必须 `node scripts/build-studio.mjs`，
然后在 app 里 ⌘R「重新载入 Studio」。

---

## 二、上一迭代做完的（都已 commit + 实测，别重做）

| commit | 内容 |
|---|---|
| `e710d02` | **一键加提词**：`slidesmith_cues` 通道（apply_patch 够不着 `#deck` 之外的 `__SM_CUES__`）+ 提词面板全 deck 账 / 撤销 / 跳到下一个待处理 + app 预设 |
| `34119c5` | **讲稿批注 → AI 改写**：`slidesmith_notes` 通道 + 讲稿 modal（划一段→加批注，批注挂锚点）+ **Studio 验锚点，丢了整块拒收** + 撤销 |
| `edac2ac` | 修 **hasDeck 恒 false**（Studio 自己导入的 deck 桥不认）· 右栏可折叠 |
| `ae300cc` | 一键加提词能**自己烘 watch mode**（Studio 报频道名，Claude 填模板，Studio 注入） |
| `55c418b` | 菜单加**「重启 deck 桥」** · Studio 重连后自己把 deck 报回桥（自愈） |
| `986f52f` | **重新导出沿用原房间号**（另给「换新房间号」开关）——否则每导一版手机都要重扫码 |
| `19f0ff2` | **提词浮层重做 v0.5**：DOM 定页 / 页内浮层 / 按钮抄「演讲者」的皮 |

用户那份真 deck（`~/.slidesmith/exports/DYQ-defense-一体版-学术题词版.html`，44 页）
**已经手工升级到 v0.5 并实开验证过**，44 条提词全部合规，备份在同目录 `.bak-20260821`。

---

## 三、Studio ↔ Claude 的三条写入通道（记住这张表，别再走弯路）

| 写什么 | 在 deck 的哪里 | 用哪个工具 |
|---|---|---|
| 幻灯片正文 | `#deck > section[data-id]` | `slidesmith_apply_patch` |
| 手表提词 | `#deck` **之外** 的 `window.__SM_CUES__` | `slidesmith_cues` |
| 内嵌讲稿 | `#deck` **之外** 的 `window.__TXB64__`（base64） | `slidesmith_notes` |

- 读之前一律先 `slidesmith_outline`（`data-id` 是 Studio 导入时才生成的，磁盘文件里通常没有）。
- **提词的键只认 `slidesmith_cues` 自己返回的 anchor**，别拿 outline 的 id 顶替：deck 没写
  `window.SLIDE_MAP`（只在 `deckAPI` 里暴露）时 outline 只能退到 `s1/s2/s3`，拿错了整批被判「不认识的锚点」。
- `slidesmith_cues` 会报 `watchOutdated` —— 老版注入块（提词窗永远空白那一版）用
  `enableWatchMode + replaceExisting=true` 换掉，提词表原样保留。

---

## 四、这一迭代踩过的坑（会再犯的那几个）

1. **改了 `packages/bridge/` 的代码，光重装 app 没用**。app 看到 8765 上已有桥就「直接用它，别抢」，
   而且不持有那个 Process、退出也收不掉 —— 网页是新的（桥每请求重读磁盘），桥进程还是旧的。
   **走菜单「重启 deck 桥」**，或 `lsof -ti tcp:8765 | xargs kill`。
   ⚠️ 8765 上那个进程可能同时是**某个 Claude 会话的 slidesmith MCP**（它探到端口空就自己当桥），
   杀它会连带让那个会话的 `slidesmith_*` 工具失效 —— 用 curl 打 HTTP 接口照样能干活。
2. **别猜广播频道名**。提词窗 v0.4 监听 `{{CHANNEL}}-presenter-sync`，而 editorial-slides 的引擎
   广播在不带后缀的 `CONFIG.channel` → 一条都收不到 → 每页都显示「这一页没有提词」，
   看着像提词没写进去，其实表是满的。**以 DOM 为准**（`deckAPI.idx` 优先），广播只当增强。
3. **数 `.slide` 要 scope 到 `#deck`**：缩略图导航里的小图也顶着 `.slide` 类，16 页会数成 19 页。
4. **同一份数据别留两处**：deck 里混进两份 `__SM_CUES__` 时，浏览器认最后一份、Studio 改第一份，
   两边静默分家。已改成「有几块摘几块 + 全局替换所有赋值」。
5. **预览 iframe 没就绪时别缓存「没有」**：`loadCues`/`loadNotes` 读到 undefined 会把它永久缓存，
   明明有提词的 deck 从此显示「没有」。已加 `previewReady()` 守门。
6. **写 JSON-RPC 测试别用 printf 拼**：payload 里有换行会把那一行 RPC 截断成静默失败，用 python 生成 jsonl。

---

## 五、实测硬数据（写代码前看这个，别重新量）

- **Apple Watch Ultra 3 = 211 × 257 点**；Series 11 46mm = 208 × 248 点 —— 一套规则通用
- 19pt 半粗下：一条提词超过约 **10 个汉字**就折行；50 字直接铺满整屏
- 表盘放得下 **5 行**短提词
- 一份 45 页真讲稿里 27 页标了 `<strong>`，**约三分之一不合规** → 「不许直接倒进提词表」这条红线

---

## 六、怎么测（照做，省一小时）

```bash
npx tsx packages/cli/src/index.ts serve --no-open -p 8790 <deck.html>
```
- Playwright 开 `http://127.0.0.1:8790/`，等 `/api/status` 的 `connected:1`
- `curl /api/cues`、`curl -XPOST /api/cues`；讲稿同理 `/api/notes`
- MCP 客户端模式也验一遍：`npx tsx packages/cli/src/index.ts mcp -p 8790` 喂 jsonl
- 没有现成的 watch-mode / 一体版 deck 做夹具，往 `dogfood-slidesmith-intro/slides.html` 尾部注入
  `window.__SM_CUES__ = {}` / `window.__TXB64__ = "…"` 现造（`</body>` 有两处，取 `rindex`）
- Studio 页面重新导航会弹 beforeunload，Playwright 要 `browser_handle_dialog` 接一下
- 要在真 deck 上验：拷到 scratchpad 起个 `python3 -m http.server` 用 http 打开（Playwright 拦 `file://`）

手机遥控侧：`cd plugin/slidesmith/skills/phone-remote/relay && node relay.mjs --port 8799`
（8787 被 WebXR-Lab 占着）。模拟器用 **Series 11 46mm**（`F9E3C0EB-781E-40B3-9DFE-84859C78F881`），
Ultra 3 模拟器连不上中转。

装 Mac app：`./scripts/install-studio-app.sh`。
装真机：`DEVELOPMENT_TEAM=C5BH6BHB9Q -allowProvisioningUpdates`，iPhone UDID `A32A899E-AF60-588B-A3EB-B3E738E31CEF`。

---

## 七、这台机器的两个坑（已记进长期记忆 `mac-dev-env-quirks`）

1. **模拟器 MCP 截图必崩** —— macOS 27 beta 的 CoreImage/Metal bug。
   绕过：MCP 负责 `tap`/`swipe`，`xcrun simctl io <udid> screenshot` 负责看。
2. **iPhone 无线调试断了、手表是好的** → 不是网络问题，是 iPhone 不广播 `_remotepairing._tcp`。
   排查 `dns-sd -B _remotepairing._tcp local.`，出现在 **if 14** 就是通了。
   待用户试：重启 iPhone → 关开开发者模式 → 还原位置与隐私。

---

## 八、⚠️ 未决 / 别自作主张

- **三文件联动版**：讲稿在隔壁文件，Studio 读不到 → **讲稿批注对它不可用**（modal 会明说）。
  点「演讲者」也开不出来（开的是相对路径 `演讲者模式.html`）。**一体版才是首选交付形态**，这条一直没修。
- **导出 PPTX**：方案早已定稿（headless 截图 + python-pptx），动手前先问用户「图片版可接受吗」。
- **`~/.zshrc` 明文存着邮箱 SMTP 密码和 Gamma API key**，已提示用户，未处理。
- **协作环**：`slidesmith_get_requests` 返回的请求是用户主动提交的，**照做**，别判 stale 拒绝。
- **git push 走 SSH-over-443**（origin 已切），别再耗 HTTPS。
