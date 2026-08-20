# 下个会话交接 · 迭代：iPhone / Apple Watch 端跟上新的 remote 协议

> `/clear` 后先读 `_memory/active.md`（精简版·启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。
> 上一迭代（2026-08-19/20）把「手机遥控」扩成了「遥控 + 讲稿」双模式，**网页端已完成并上线，原生 iOS/Watch 端没跟上**，本迭代补齐。

---

## 一、先搞清楚状况：原生 app 落后了一整代

**网页遥控端**（`/r/<room>`，云端已部署 Version `21aaadd3`）现在是：遥控 / 讲稿 双模式，能收讲稿全文、显示当前页·下一张·计时、讲稿自动滚到当前页、✦ 提词开关。

**原生 iOS / Watch 还停在「瞎按的遥控器」**——实测确认：
- `Shared/RelayClient.swift:145` 的 `handle(text:)` **只认 `joined` / `peer`**，`deck-info` / `state` / `evicted` 全部落地即丢
- 只发 `{"type":"cmd","action":…}`（`RelayClient.swift:180`）
- 全仓 iOS/Watch 代码里 `RTC|txb64|deck-info` 命中数 = **0**（无 WebRTC、无讲稿）
- iOS 界面（`iOS/ContentView.swift:85`）＝ prev/next/first/last/black/present 六个按钮 + 扫码配对
- Watch（`Watch/WatchRemoteView.swift:20`）＝ 上/下两个热区，经 WCSession 把 `["cmd": action]` 交给手机转发（`Watch/WatchLinkManager.swift:112`）

所以现在的实际体验是：**用户拿 iPhone 装了 app，功能反而不如直接扫码开网页**。

---

## 二、协议现状（写代码前先看这张表，别去猜）

中转是**透明转发**（本地 `relay.mjs` + Cloudflare worker 都是），只按 room 在 `deck` / `remote` 两个角色之间对转。以下是两端实际收发的全部消息：

| 方向 | 消息 | 载荷 | 出处 |
|---|---|---|---|
| deck → remote | `deck-info` | `{txb64, title, state}` 配对时推一次，讲稿约 30–60 KB | `pair-client.js:250` |
| deck → remote | `state` | `{slideIdx, total, segment, anchor, title, prevTitle, nextTitle, source}` 每翻一页 | `pair-client.js:121,240` |
| deck → remote | `evicted` | `{reason:'another-deck'}` 被同一份 deck 的另一个窗口顶掉 | `pair-client.js:426` |
| 中转 → 两端 | `joined` / `peer` | `{peers:{deck,remote}}` | 中转自己发 |
| remote → deck | `cmd` | `{action: next\|prev\|first\|last\|black\|present}` | 现有 app 只会这个 |
| remote → deck | `need-info` | 要讲稿（**网页端每 2 秒重问直到拿到**） | `remote.html:166` |
| remote → deck | `jump` | `{slideIdx}` 直接跳页 | `pair-client.js:315` |

**两条容易踩的规则**（都是上一迭代真机踩出来的，别重蹈）：
1. **直连（WebRTC）要先验证再用**。deck 侧有 `dcProven` 门闩——只有收到过对端从数据通道发来的消息，才认为这条道双向通。原因：WebRTC 会**半开**，deck 这边 `readyState==='open'` 而手机根本没连上，往里发**不报错、静默丢弃**（30 KB 讲稿直接进黑洞）。
2. **一个房间只留一个放映端，新的顶掉旧的**。房间号烘死在 deck 文件里 → 任何拷贝/备份都带同一个号，两份同开会互相打架。被顶掉的一方收到 `evicted`。

---

## 三、本迭代该怎么做（方案已定，附理由，别再重复论证）

### 结论：**原生壳 + WebView 装讲稿**，不要用 Swift 重写讲稿端

**决定性理由：讲稿本身就是一份完整的 HTML 文档**（`__TXB64__` base64 解出来就是 `<!DOCTYPE html>…`，带自己的 `fuquan-scroll` / `fuquan-cue` 监听）。要在原生里渲染它，**无论如何都得用 WKWebView**。既然如此，就别只塞讲稿——直接把整个 `/r/<room>` 页面装进 WebView，协议、滚动、提词、计时全部免费继承，而且**以后网页端改什么，原生端自动跟上，永远不会再出现这次这种落后一代的情况**。

反过来说，**原生端要保留的是网页做不到的那部分**：

| 能力 | 只有原生能做 | 说明 |
|---|---|---|
| **Apple Watch** | ✅ | 网页跑不到手表上。这是原生 app 存在的头号理由 |
| **屏幕常亮** | ✅ | `UIApplication.shared.isIdleTimerDisabled`。Safari 页面讲到一半自动锁屏是真实事故 |
| **触觉反馈** | ✅ | `UIImpactFeedbackGenerator`，讲台上不用低头确认按到没有 |
| **后台存活** | ✅ | Safari 标签页会被系统回收，原生 app 不会 |
| **扫码配对** | ✅ | 已有（`iOS/QRScannerView.swift`）|

### 具体任务（按优先级）

**P0 · iOS 加「讲稿」标签页**
- `iOS/ContentView.swift` 顶部加「遥控 / 讲稿」分段控件（对齐网页端的交互）
- 讲稿页 = `WKWebView` 加载 `link.phoneURL`（`PairingStore.swift:44` 已有 `"\(relayBase)/r/\(room)"`）
- **注意**：WebView 里那个页面会自己以 `role=remote` 连中转 → 这样一个房间里会有**两个 remote**（原生的 + WebView 的）。中转只限制 deck 数量、remote 不限，功能上没问题，但**两条连接会各自收到一份 30 KB 讲稿**。若嫌浪费，可让原生侧在切到讲稿页时断开自己的 WS（Watch 转发另说，见 P1）。**先按简单做法上，实测再优化。**
- 原生遥控页保留（有触觉反馈、且是 Watch 的上游）

**P0 · 屏幕常亮**：配对成功后 `isIdleTimerDisabled = true`，断开/退到后台恢复。这条最便宜、现场收益最大。

**P1 · Watch 从「瞎按」升级成「看得见」**
手表屏幕塞不下讲稿，但**页码 + 下一张标题 + 计时**是刚需（低头一眼就知道讲到哪、还剩几张）。链路：
1. `RelayClient.swift:145` 的 `handle(text:)` 补 `state` 分支 → 存成 `@Published var deckState`（只取 `slideIdx / total / nextTitle` 三个字段，**别把 txb64 也解析进来**，手表用不上）
2. 手机经 `PhoneLinkManager.swift:54` 的 `updateApplicationContext` 把这三个字段推给手表（**注意节流**：`updateApplicationContext` 会合并，但翻页快时别每页都调，加个 ≥0.5s 的合并窗口）
3. `Watch/WatchRemoteView.swift` 顶部显示 `3 / 44` + 下一张标题

**P1 · 认 `evicted`**：现在 deck 被顶掉后，app 会继续往空房间发指令、界面还显示「已连接」。补一个分支，界面提示「放映端已被另一个窗口接管」。

**P2 · 原生端加 WebRTC**：优先级低。`cmd` 只有几十字节，走中转完全够用；讲稿走 WebView 那条连接。**除非**用户明确提出隐私顾虑（讲稿不过第三方），否则不做。

---

## 四、动手前必须问用户的两件事

1. **原生 iOS app 还要不要保留？** 网页端功能已经超过它，且不用装。我的判断是**保留**——因为 Apple Watch 只能靠它，屏幕常亮和触觉也只有原生能做。但这是产品判断，**让用户拍板**再动手。
2. **手表要不要显示状态（页码/下一张/计时）？** 还是保持纯翻页器？加状态会让手机端多一条节流转发链路，也会耗一点手表电。

---

## 五、怎么测（照做，能省一小时踩坑）

```bash
# 1) 起本地中转（云端那份不用动）
cd plugin/slidesmith/skills/phone-remote/relay && node relay.mjs --port 8799
```

- **默认端口 8787 被用户机器上的 WebXR-Lab 占着**（`~/Codex/WebXR-Lab/scripts/serve-control-gui.mjs`），所以用 8799。客户端已能自动探测 8787/8788/8799 并校验响应形状。
- **测试用的 deck 必须重新导出**：客户端是烘死在 HTML 文件里的，老文件带的是老版本。判断方法——用编辑器搜 `dcProven`，**搜得到就是新的**。或者用 `DYQ-defense-一体版-remote.html`（已更新到最新客户端）。
- 网页端对照物：`http://<局域网IP>:8799/r/<房间号>`，房间号在 deck 里搜 `__SM_ROOM__`。
- 云端中转部署：`cd plugin/slidesmith/skills/phone-remote/relay/cloudflare && npx wrangler deploy`。**wrangler 走代理会挂**——用户 shell 无条件把代理指向 127.0.0.1:7897，Clash 关掉 UI 后内核还在监听但出不去。`~/.zshrc` 已修成「探测要验真」，若仍报 fetch failed，加前缀 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY …`。

---

## 六、上个会话（2026-08-19/20）做完的事 · 全部已 commit + push

| commit | 内容 |
|---|---|
| `4ca7012` | 遥控扩成「遥控 / 讲稿」双模式（原型）· deck 旁听自身 BroadcastChannel，接到中转管道；中转零改动 |
| `34487e0` | 讲稿走直连不过中转 · 一个房间只留一个放映端 · 局域网端口自动探测 |
| `1eee8bf` | presenter-mode 模板频道名改成每份 deck 专属占位符（原来写死 `fuquan-presenter-sync`，两份 deck 同开会串台）|
| `6afb8ae` | 修真机「讲稿过一会儿才出来」：直连要先验证（`dcProven`）、讲稿要要到手为止（每 2 秒重问）|
| `0f44a8f` | 讲稿脱离「一体版」：普通 deck 写 `<aside class="notes">` 也能用；DOM 状态兜底常驻 |
| `8a2d301` | **导出会把一体版 deck 的脚本拦腰截断** —— `replace('</body>')` 只换首次匹配，而一体版把整份副屏 HTML 当字符串存在 JS 里、那串里也有 `</body>`。四处同类地雷一起修（手机遥控注入 / bridge 注入 / 字体内嵌 / PDF 打印样式），改用 `insertBeforeBodyEnd` / `insertBeforeHeadEnd` 按文档结构定位 |
| `ae65a1f` | 第三种讲稿载体 `window.SM_NOTES`（presenter-mode 单文件版）|

**讲稿载体现在认四种**，优先级：`__TXB64__`（一体版）> `SM_NOTES`（单文件版）> `<aside class="notes">`（html-ppt 写法 / Studio 里随手加的备注）> 无（手机端显示提示）。

---

## 七、⚠️ 未验证 / 遗留

- **Mac app 的 WKWebView 弹窗修复只做了编译验证，没在 app 里跑过**（`StudioWebView.swift` 加了 `javaScriptCanOpenWindowsAutomatically` + `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs`）。症状是「Studio 里点『演讲者』弹不出窗」。**下个会话开场先问用户重新构建后好了没**，没好我再上手调。
- **安全口子（用户已知悉，未决定）**：房间号 = 唯一凭证，且烘死在文件里 → **把 deck 文件发给别人 = 他能在你演讲时静默接进来看实时页码、甚至翻页**。可做的加固：导出时重新生成房间号 / 配对成功后锁定不再接受新遥控端。等用户点头。
- **`~/.zshrc` 里明文存着邮箱 SMTP 密码和 Gamma API key**，会被每个子进程继承（包括 npx 临时下载的包）。已提示用户，未处理。
- 三文件联动版 deck（slides / 副屏壳 / 讲稿分开）**手机讲稿模式用不了**——讲稿在隔壁文件，客户端读不到；`file://` 下也没法 fetch 兄弟文件。解法是「Studio 支持把讲稿一起拖进来、导出时缝成一体化」，**已提方案、用户未定**。

---

## 八、和本迭代无关但别弄丢的待办

- **导出 PPT / PPTX**：方案早已调研定稿（headless 截图 + python-pptx 满版塞图，复用 PDF 管线），**动手前先问用户「图片版 PPTX 可接受吗」**。原文见 `_memory/history.md` 里搜 `export-pptx`。
- **协作环提醒**：`slidesmith_get_requests` 返回的请求**是用户主动提交的，照做**，别因 deck 名不符就判 stale 拒绝。
