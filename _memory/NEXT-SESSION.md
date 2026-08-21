# 下个会话交接 · 迭代：Studio「美化 + 交互重构」三批走（批次二起步）

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。

---

## 一、方向已定，别再讨论液态玻璃

2026-08-21 讨论后用户拍板：**液态玻璃搁置**（结论：技术上能做，但要「有玻璃感」必须把三栏
实心布局改成「deck 满幅 + 面板悬浮」，本质是改布局不是换皮，这一轮不划算）。
改做「让工具更好用、更美观」，**分三批，每批单独截图验收**。

### 批次一 · 已完成并 commit（`e794e78`），别重做

| 做了什么 | 关键点 |
|---|---|
| `--sm-*` 设计令牌层 | 原来 532 处硬编码色 / 1 个变量 / 90 条 `body.dark` 手工覆盖；现在深色只重定义变量。**前缀必须是 `--sm-`**：`--accent`/`--ink`/`--paper` 是 deck 自己的令牌（换皮和调色板在用），撞名极难查 |
| 藏掉预览里 deck 自带的段导航 | 顶栏 `▦`（`#deckNavTog`）开关，默认关，记 localStorage `sm-deckchrome` |
| **Studio 接管 `--fit-scale`** | ⚠️ 最容易漏的一步。deck 自己的公式是 `innerWidth - 300 - 60`，那 300 是段导航宽度、**硬编码在 deck 里**。光藏不接管＝地方腾出来了幻灯片却不变大。接管后 672px → 972px（+45%）。播放态 `body.present` 让给 deck；另在 `fullscreenchange` 后补算一次（退出全屏时 resize 和 fullscreenchange 谁先到没保证） |
| deck 顶栏在编辑预览里不折行 | 它按 1920 宽设计；只在编辑预览收紧 + nowrap，**导出文件一个字节不动**（规则在 `forEdit` 分支里） |
| 草稿条 → 右下角卡片 | 原来横在顶部正中，正好盖住 deck 的标题栏 / 页码 /「全屏播放」 |
| 顶栏分组 + 导出选项收进 `⚙` 浮层 | 三个几乎看不见的灰 checkbox 收进 `#expMenu`，每条配一行说明 |

### 批次二 · 下一步做这个：右栏重构（一～两天）

- 五个 tab 重新归类。**用户自述最常用 = 「AI 修改」+「提词 / 讲稿」**，按这个排优先级，别照搬现在的顺序
- **讲稿提到一级入口**（现在只能塞在「AI 修改」里）
- 折叠态改图标竖条 —— 现在是竖排单字（「格/式」「动/画/效/果」每字一行），几乎没法读
- 每个面板砍说明文字，改成 `?` 悬浮提示（`.ihelp` 机制代码里已有，直接沿用）
- 强调色 / 背景色 / 文字色三个原生 `<input type=color>` 大色块换成正经色板控件

### 批次三 · 之后

左栏页面列表加缩略图（彻底合并两套导航）· AI 待办流程状态可见性 · 快捷键梳理

---

## 一之二、验收怎么做（照做，别碰用户正在用的那份）

用户的 Mac app + 真 deck 常年占着 **8765**，**别去动它**。另起一个：

```bash
cp ~/.slidesmith/exports/DYQ-defense-一体版-学术题词版.html <scratchpad>/probe-deck.html
npx tsx packages/cli/src/index.ts serve --no-open -p 8790 <scratchpad>/probe-deck.html
```
Playwright 开 `http://127.0.0.1:8790/` 截图。⚠️ Playwright MCP 只许写仓库内路径，
截图落 `.playwright-mcp/`（已 gitignore）；给绝对路径到 scratchpad 会被拒。
⚠️ 别点草稿条的「丢弃」——那可能是用户真的未保存草稿。

改完 UI 一律 `node scripts/build-studio.mjs`，app 里 ⌘R「重新载入 Studio」。

---

## 二、更早那一迭代做完的（都已 commit + 实测，别重做）

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
