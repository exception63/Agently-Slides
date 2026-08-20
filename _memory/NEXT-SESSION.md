# 下个会话交接 · 迭代：真机验收 + 未决的产品选择

> `/clear` 后先读 `_memory/active.md`（精简版·启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。
> 上一迭代（2026-08-20）把 iPhone / Watch 补齐到了新协议，**模拟器全通，真机没测**。本迭代先验收，再挑下一件事做。

---

## 一、上个会话（2026-08-20）做完的事 · 已 commit

| commit | 内容 |
|---|---|
| `ce82e1c` | **Studio 点「演讲者」弹出空白窗口**——真因不在 Mac app，在 Studio：一体版 deck 靠 `window.open(location.href+'#presenter')` 重开自己，而预览是 srcdoc iframe，里面 `location.href === 'about:srcdoc'`。改成用父窗口给的干净 deck 做 blob URL 再开 |
| `ee6e07e` | **iPhone / Watch 跟上新 remote 协议**：讲稿页（WebView 装整个 `/r/<room>`）+ 页码状态 + 屏幕常亮 + Watch 显示 `8/15` 和下一张标题 |

两件都用**模拟器 / Playwright 实拍验证过**，不是「编译过就算」。

---

## 二、⚠️ 开场先做这两件验收

### 1. Studio 副屏（**不用重新构建 Xcode**）
修的是 Studio 的网页 bundle，不是 Swift。`studio/slidesmith-studio.html` 已重建，**bridge 每请求重读 → 在 Mac app 里刷新一下 WebView 就生效**。
- 验收：Studio 里打开一体版 deck → 点「演讲者」→ 副屏应该显示讲稿 + 目录 + 计时 + 跟随开关，而不是白窗口。
- 已验证过的部分（Playwright · 44 页真 deck）：副屏正常渲染、副屏按 → 主 deck 跟着翻到第 3 页（双向联动通）、副屏那份 HTML 不带手机遥控（否则会把主窗口顶掉）。

### 2. iPhone / Watch 真机
模拟器全通，**真机一次没跑过**。要装的话：
```bash
cd "apps/SlidesmithRemote" && xcodegen generate && open SlidesmithRemote.xcodeproj
```
真机上重点看这三条（模拟器测不了）：
- **手表经 iPhone 那条路**：模拟器没配对手表，测的是手表**直连**中转那条路。`.phone` 那条（手表每 3 秒 ping 手机、手机在 reply 里捎带 `idx/total/next`）代码写好了但没跑过。
- **屏幕常亮**：`isIdleTimerDisabled`，模拟器看不出来。
- **讲稿页在 4G / 会场 Wi-Fi 下多久出来**（云端中转 + 30–60 KB 讲稿）。

---

## 三、协议现状（写代码前先看这张表，别去猜）

中转是**透明转发**（本地 `relay.mjs` + Cloudflare worker 都是），只按 room 在 `deck` / `remote` 两个角色之间对转。

| 方向 | 消息 | 载荷 | 出处 |
|---|---|---|---|
| deck → remote | `deck-info` | `{txb64, title, state}` 配对时推一次，讲稿约 30–60 KB | `pair-client.js:250` |
| deck → remote | `state` | `{slideIdx, total, anchor, title, prevTitle, nextTitle, source}` 每翻一页 | `pair-client.js:121` |
| 中转 → **旧 deck** | `evicted` | `{reason:'another-deck'}` | `relay.mjs:105` / `worker.mjs:55` |
| 中转 → 两端 | `joined` / `peer` | `{peers:{deck,remote}}` | 中转自己发 |
| remote → deck | `cmd` | `{action: next\|prev\|first\|last\|black\|present}` | |
| remote → deck | `need-info` | 要讲稿 + 当前状态 | `remote.html:166` |
| remote → deck | `jump` | `{slideIdx}` 直接跳页 | `pair-client.js:315` |

**`slideIdx` 是 0 基**，显示时才 `+1`（`remote.html:202`）。别在解析层偷偷改基数。

**⚠️ 上一版交接把 `evicted` 的方向写反了**（写成 deck→remote）。实际是**中转发给被顶掉的那个 deck**，遥控端根本收不到。原生端加了防御性分支，但「app 显示已连接却在往空房间发指令」如果真出现，原因另有其他，别再照那条线索查。

**两条真机踩出来的规则**：
1. **直连（WebRTC）要先验证再用**。deck 侧有 `dcProven` 门闩——只有收到过对端从数据通道发来的消息才认为双向通。WebRTC 会**半开**：deck 这边 `readyState==='open'` 而手机根本没连上，往里发**不报错、静默丢弃**。
2. **一个房间只留一个放映端，新的顶掉旧的**。房间号烘死在 deck 文件里 → 任何拷贝/备份都带同一个号。

---

## 四、原生端现在的形状（别再重复论证这个方案）

**原生壳 + WebView 装讲稿。** 讲稿本身就是一份完整 HTML，横竖都得用 WKWebView；既然如此就把整个 `/r/<room>` 装进来——协议、滚动、提词、计时全部继承，**以后网页端改什么原生自动跟上**。

原生只保留网页做不到的：Apple Watch、屏幕常亮、触觉反馈、后台存活、扫码配对。

两个已知的、当时判断「可接受」的代价，真机上如果难受再动：
- **一个房间里有两个 remote**（原生的喂手表页码 + WebView 的显示讲稿），配对时**两条连接各收一份 30–60 KB 讲稿**。嫌费流量的话，可让原生在切到讲稿页时断开自己的 WS（但手表就没页码了，要另想）。
- 网页端那组「遥控/讲稿」开关是用 **WKUserScript 注入**藏掉的（`#modes{display:none}`），并预先把 `localStorage.sm-remote-mode` 设成 `script`。**故意不改 remote.html**：改网页要连云端 worker 一起重部署，老部署/老房间会立刻不一致。万一网页端将来改了 id，这里只是安静失效（退回两组开关），不会把讲稿弄坏。

---

## 五、怎么测（照做，能省一小时踩坑）

```bash
cd plugin/slidesmith/skills/phone-remote/relay && node relay.mjs --port 8799
```
- **默认端口 8787 被用户机器上的 WebXR-Lab 占着**，所以用 8799。客户端能自动探测 8787/8788/8799。
- **测试用的 deck 必须重新导出**：客户端烘死在 HTML 里，老文件带老版本。判断方法——搜 `dcProven`，**搜得到就是新的**。或用 `KeynoteSpeech/DYQdefense2026/DYQ-defense-一体版-remote.html`（已是最新）。
- 网页端对照物：`http://<局域网IP>:8799/r/<房间号>`，房间号在 deck 里搜 `__SM_ROOM__`。
- **模拟器里塞配对信息**（没相机扫不了码）：
  ```bash
  xcrun simctl spawn <udid> defaults write com.zlyscu.slidesmithremote sm.room testroom01
  xcrun simctl spawn <udid> defaults write com.zlyscu.slidesmithremote sm.relay "http://127.0.0.1:8799"
  ```
  手表那份 bundle id 是 `com.zlyscu.slidesmithremote.watchkitapp`。ATS 不拦 `ws://127.0.0.1`，实测通。
- **假放映端**（按线上格式说话，用来单独验原生端）：`_memory/` 没留，需要时重写——连 `ws://127.0.0.1:8799/ws?room=X&role=deck`，收到 `need-info` 回 `deck-info`，收到 `cmd` 改页码后推 `state`。注意假讲稿要自带 `fuquan-scroll` 监听，否则副屏不滚（**这不是 bug，真讲稿自带监听**，我为此白查过一轮）。
- 云端中转部署：`cd .../relay/cloudflare && npx wrangler deploy`。**wrangler 走代理会挂**——用户 shell 无条件把代理指向 127.0.0.1:7897。若报 fetch failed，加前缀 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY …`。

---

## 六、⚠️ 未决 / 等用户拍板

- **安全口子（用户 2026-08-20 明确说「暂时不管」）**：房间号 = 唯一凭证且烘死在文件里 → **把 deck 发给别人 = 他能在你演讲时静默接进来看实时页码、甚至翻页**。加固选项：导出时重新生成房间号 / 配对成功后锁定不再接受新遥控端。**别自作主张做，用户已经选了不管。**
- **三文件联动版 deck**（slides / 副屏壳 / 讲稿分开）**手机讲稿模式用不了**——讲稿在隔壁文件，`file://` 下也没法 fetch 兄弟文件。解法是「Studio 支持把讲稿一起拖进来、导出时缝成一体化」，**已提方案、用户未定**。顺带：三文件版在 Studio 里点「演讲者」也开不出来（它开的是相对路径 `演讲者模式.html`，Studio 那边没这个文件）——这次没修，一体版才是首选交付形态。
- **`~/.zshrc` 里明文存着邮箱 SMTP 密码和 Gamma API key**，会被每个子进程继承（包括 npx 临时下载的包）。已提示用户，未处理。

---

## 七、和本迭代无关但别弄丢的待办

- **导出 PPT / PPTX**：方案早已调研定稿（headless 截图 + python-pptx 满版塞图，复用 PDF 管线），**动手前先问用户「图片版 PPTX 可接受吗」**。原文见 `_memory/history.md` 里搜 `export-pptx`。
- **协作环提醒**：`slidesmith_get_requests` 返回的请求**是用户主动提交的，照做**，别因 deck 名不符就判 stale 拒绝。
