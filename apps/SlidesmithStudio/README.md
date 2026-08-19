# Slidesmith Studio.app

一个 Mac 原生窗口里同时装下「编辑 deck」和「跟 Claude 说话」。**不用开浏览器，也不用
在终端里另开一个 Claude Code 会话。**

```
┌──────────────────────────────────┬─────────────────┐
│  Studio（WKWebView）              │  Claude 面板     │
│  ← deck 桥 :8765（app 拉起）      │  ← Claude 桥     │
└──────────────────────────────────┴──────:8991──────┘
        ▲                                    │
        └────── slidesmith_apply_patch ──────┘
                （claude 的 MCP 以客户端模式接上 :8765）
```

## 装 / 跑

```bash
./scripts/install-studio-app.sh          # 装到 ~/Applications
```

需要 `xcodegen`（`brew install xcodegen`）、Xcode、`node`、`python3`、`claude`。
改了 Swift 源之后重跑这个脚本即可；改了 `bridge/claude-bridge.py` 用 app 菜单里的
「重启桥接」，改了 `packages/studio/src/main.ts` 要
`node scripts/build-studio.mjs` + 在 app 里「重新载入 Studio」（⌘R）。

## 三条链路

| 你做的事 | 走的路 |
|---|---|
| 在 Studio 里点字、换色、拖图 | 纯前端，零 token，和以前一样 |
| 在右栏跟 Claude 说话 | app → Claude 桥 `/chat` → 常驻 `claude` → MCP → deck 桥 → WebView |
| 在 Studio 里写「AI 待办」点发送 | deck 桥 `/api/wait` → **app 自动接住** → 同上 |

第三条替掉了过去每个会话都要手挂一遍的后台 `curl /api/wait` 自循环脚本。

## 这个面板到底是什么

**是你终端里的 Claude Code**，不是另一个云端助手。工作目录就是仓库根，所以：

- skill 能用（`/slidesmith:editorial-slides`…）
- MCP 能用（`slidesmith_outline` / `slidesmith_apply_patch`…）
- CLAUDE.md、AGENTS.md 生效
- `_memory/`、`packages/` 它直接读得到、改得动

桥接**不解析、不改写、不注入任何提示词**，只把 `claude` stdout 的每一行 JSON 原样
以 SSE 转过来。形状抄自 OmniSecretary 的 `bridge/omni-bridge.py`（那边的
`docs/bridge.md` 是这套东西的权威说明）。

## 关键设计（改之前先读）

### 桥的命拴在 app 上，不拴在会话上

老形状是「Claude Code 会话 → MCP 进程 → 它顺手 listen 8765」，会话一关 Studio 立刻失联。
现在 **app 拥有两条桥**，Claude 只是接上来的客户端之一。

`packages/bridge/src/remote.ts` 就是这个反转：MCP 进程启动时先探 8765，
有活着的桥就当客户端（HTTP），没有才自己起一个。**终端老路一点不受影响。**

不这么做的后果很隐蔽：`startBridge` 撞到 EADDRINUSE 会**静默退到随机端口**，
于是 `apply_patch` 推进一个没人连着的空桥——用户看到「AI 说改好了，但屏幕没变」。

### 读页之前必须先向 Studio 要一次最新的

桥里那份 `deck.html` 只在导入 / AI 补丁后 / 用户按保存时刷新，**手打的字不在其列**。
所以 `/api/outline` 会先广播 `sync-request`、等 Studio 把当前 deck 推上来（1.5 秒超时）。
少了这一步：用户手改两页 → 让 AI 改第 5 页 → AI 读到手改之前的版本 → 回写 →
**手改被无声抹掉**。

### data-id 是 Studio 导入时才生成的

磁盘上的 deck 文件通常没有 `data-id`（`editorial-slides` 出的写的是 `data-seg`），
而 `apply_patch` 靠 data-id 定位。所以有 `slidesmith_outline`：按和 Studio
**逐字相同**的规则（`data-id → window.SLIDE_MAP[i] → s{i+1}`）在服务端复算一遍。
直接去读文件的话，AI 手里一个合法 id 都没有。

### 两条桥都必须由 app 收尾

`applicationWillTerminate` 里收。不收的话 node / python3（以及 python3 拉起的常驻
`claude`）会变成孤儿留在系统里——那正是"我不知道什么东西还在后台跑"的来源。
`start()` 也必须幂等，否则两处并发各起一条，第二条顺延端口变成**没人持有**的孤儿。

### 沙盒关掉了

要拉起 node / python3、要在仓库里读写、背后那个 claude 还要跑 git / playwright。
沙盒里这些一条都不成立，而失败的表现全是"它没反应"。代价是上不了 App Store，
本来也没打算上。

## WKWebView 要补的浏览器行为

| Studio 用到的 | WKWebView 默认 | 补法 |
|---|---|---|
| `<input type=file>`（导入图片） | **什么都不发生** | `runOpenPanelWith` → NSOpenPanel |
| `window.open`（动画库 / PDF） | 静默丢弃 | `createWebViewWith` → 独立窗口 |
| `alert` / `confirm` / `prompt` | 静默丢弃 | 转 NSAlert |
| `showSaveFilePicker`（另存为） | 没这个 API | 不用管——http 环境下 Studio 本来就走桥的 `/api/export-html` |

## 出问题先看这里

```bash
tail -50 ~/Library/Logs/SlidesmithStudio-claude-bridge.log
tail -50 ~/Library/Logs/SlidesmithStudio-deck-bridge.log
```

面板里输入 `/诊断` 会把桥接状态和日志尾巴一次拉出来。

| 症状 | 多半是 |
|---|---|
| 左边一直转圈 | node 起不来 → 看 deck-bridge 日志（多半是 PATH 里找不到 node） |
| 面板顶栏「未连接」 | python3 或 claude 找不到 → 看 claude-bridge 日志 |
| 「AI 说改好了但没变」 | 有第二条桥抢了端口 → `lsof -nP -iTCP:8765` 应该只有 app 的那个 |
| 端口被占 | 两条桥都会往后顺延（8765→…、8991→9002）。客户端会校验 `/health` 的 `app` 字段，所以不会误连到别的项目的桥 |
