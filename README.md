# Slidesmith — 高度 AI 整合的 HTML Slides 工作台

> GitHub: [exception63/Agently-Slides](https://github.com/exception63/Agently-Slides)

一套从**做 slides → 改 slides → 放映 → 现场互动 → 事后复盘**都在同一份 HTML 上完成的工具：
浏览器（或 Mac app）里的 **Studio** 负责可视化编辑，**Claude Code** 通过桥接实时帮你改，
手机 / 手表当遥控器，学生扫码提问实时上大屏。成品永远是**一个单文件 HTML**，离线、可移植、你自己拥有。

## 核心：分工

- **你做高频细活**：点字、换色、调字号、换皮、加动画、移动 / 删除元素、写讲稿批注 —— 即时、零 token。
- **AI 做模糊重活**：在那一页写一句「改成两栏」，攒成待办一键发送，Claude 按页回写、告诉你改了什么，不满意一键还原。

## 一条龙（每一步都是一个 skill 或一个按钮）

| 阶段 | 用什么 | 一句话 |
|---|---|---|
| **做** | `/slidesmith:editorial-slides` | 从内容出片，22 套皮肤（学术 / 杂志 / 暗场主旨 / 毛玻璃 …），带编号动画库 |
| **配讲稿** | `/slidesmith:transcripts_html` | 与 slides 同一套视觉的 HTML 讲稿，锚点天然对齐 |
| **接副屏** | `/slidesmith:slides-presenter-mode` | slides + 讲稿 + 副屏缝成**一体化单文件**，iPad 跟着翻 |
| **改** | Studio（`/slidesmith <deck.html>`） | 点字就地改 · 换装 · 设计旋钮 · AI 待办 · ⌘K 命令面板 |
| **放** | Studio 顶栏「放映」/ `/slidesmith:phone-remote` | 全屏放映；iPhone / Apple Watch 翻页，iPad 看讲稿 |
| **互动** | Studio「插入 → 现场互动」/ `/slidesmith:live` | 学生扫码提问实时上墙；散场一键关提问；按天记账 |
| **复盘** | `smlive` CLI / 管理台 | 每场提问导出 CSV / Markdown，AI 直接读来分析 |

## Studio 长什么样

```
┌ 顶栏：导入 · 放映 · 演讲者 · ⌘K · 导出 PDF · 另存为 · 保存 · ● 已连接 Claude ┐
│ 左栏           │           画布（1920×1080，点字就改）           │ 右栏          │
│  页面 · 换装 ·  │   选中元素 → 蓝框 gizmo：✥ 移动 · 💬 批注 · ◢ 缩放   │  AI · 讲稿 ·  │
│  插入(含互动)   │                                                │  格式 · 动画 · │
│                │                                                │  设计          │
└────────────────┴────────────────────────────────────────────────┴───────────────┘
```

- **AI tab**：首屏只有「这一页想怎么改」+ 待办 + 一键发送；整份 deck / 配图（矢量 · 图表 · 照片）/ 导入图片 / 图片库·自检折在下面，有内容自动展开。AI 回写后「AI 改了什么」列出页名和一句话。
- **⌘K**（Windows: Ctrl+K）：打字就能做任何事 —— 「学术」换皮、「第 12 页」跳页、「导出 PDF」、「发给 AI」、「关闭提问」。
- **换装**：22 张皮肤卡片，点一下整份 deck 就地换风格（不重建、不黑屏）。
- **讲稿 / 提词**：一体版内嵌讲稿可批注（划一段写一句，随待办发给 AI）；Apple Watch 每页提词。
- **保存 vs 另存为**：「保存」（⌘S）写回源文件，不嵌字体，快；「另存为 / 导出」才是交付件，按 ⚙ 里的勾选嵌入**只用到的字重**的字体子集和手机遥控客户端。

## 两种用法

**① 连上 Claude Code（推荐）**：跟 Claude 说「用 slidesmith 打开这个 deck」或敲 `/slidesmith <deck.html>`
→ 浏览器弹出 Studio，顶栏绿色 **● 已连接 Claude** → 你改细活、给难改的页留一句 → 点 **一键发送给 AI**
→ 那几页变「已发送」→ Claude 改完变 **✓ 已改**，右栏写着改了什么 → 不满意 **↩︎ 还原本页**。

**② Mac app**：`Slidesmith Studio.app` 把同一个 Studio 装进原生窗口，多一块原生 Claude 面板
（打开 deck、保存、另存为、和 Claude 聊、一键「讲讲这份 deck」「统一视觉」「压缩文字」「配张图」）。
安装：`./scripts/install-studio-app.sh`（需 Xcode 与 xcodegen；app 仍依赖本仓库）。

**③ 离线单干**：双击 [`studio/slidesmith-studio.html`](studio/slidesmith-studio.html)，拖入 deck，改、换皮、导出 —— 不需要 Claude。想连时点顶栏 **连接 Claude Code**。

## 现场那一套

- **手机 / 手表遥控**：导出时勾「嵌入手机遥控」→ 任何电脑打开 deck → 点「📱 手机遥控」→ 扫码即用。云中转自带，同 Wi-Fi 自动升级为直连；iPad 上同步看讲稿；Apple Watch 捏合翻页。
- **现场互动**：Studio「插入 → 现场互动」装一页扫码提问（也可 `/slidesmith:live`）。学生扫 `live.zhouliying.com/q/<房间>` 匿名提问、实时上大屏；你在 iPad `/r/<房间>` 主持（清屏 / 隐藏 / 关提问 / 翻墙）。**给学生扫的码永远不要密码，也别用 `*.workers.dev`**（国内打不开）。
- **散场第一件事：关提问**——二维码还贴在教室里。Studio 状态卡、⌘K、或让 Claude `smlive close <房间>`，不需要 slides 还开着。
- **记账**：一门课一个房间号（烘一次、二维码永不变），**一个自然日一场**；管理台 / `smlive` 按场导出 CSV（带 BOM，Excel 不乱码）或 Markdown。不存任何设备标识。

## 安装插件

```bash
npm install && npm run build:studio
claude plugin marketplace add "$(pwd)/plugin" --scope user
claude plugin install slidesmith@slidesmith-local --scope user
# 重启 Claude Code：MCP 工具 slidesmith_open / wait / apply_patch / outline / cues / notes / status 生效
```

改了仓库里的技能之后：`claude plugin marketplace update slidesmith-local && claude plugin update slidesmith@slidesmith-local`，再重启。
（**已装插件的缓存不会自己更新** —— phone-remote 技能曾经写好两个月没人装上过，原因就在这。）

不装插件也能用：`npm run sm -- serve <deck.html>`（自己起桥接、开浏览器、连上模式）。

## 架构

```
   浏览器 Studio / Mac app  ──WebSocket──▶  桥接(bridge · localhost:8765)  ◀──MCP──  Claude Code
   (人做高频细活)                             │ 请求队列 · 补丁 · 导出 PDF · 搜图 · 互动接口
                                              ▼
   iPhone / Watch / iPad ──WS──▶  中转 relay(云 / 自托管 live.zhouliying.com)  ◀──WS──  放映端 deck · 学生手机
```

桥接是中间人：浏览器沙箱关着 Studio、Claude Code 在桌面，谁也直接够不到谁。Studio 走**同源 WebSocket**、
Claude Code 走 **MCP**。`file://` 打开 Studio 则退回纯离线手动模式，什么都不坏。

## 仓库结构

| 路径 | 内容 |
|---|---|
| `studio/slidesmith-studio.html` | 成品 Studio（单文件、离线、双击即用）。源在 `packages/studio/`，改后 `npm run build:studio` |
| `packages/bridge/` | 桥接：HTTP + WebSocket + MCP + 控制 API（含 `/api/live/*`） |
| `plugin/slidesmith/` | Claude Code 插件：5 个 skill + `/slidesmith` 命令 + `.mcp.json` |
| `plugin/slidesmith/skills/phone-remote/relay/` | 中转：Cloudflare Worker 版 + 自托管版（`selfhost/`，含管理台、令牌接口、部署脚本） |
| `plugin/slidesmith/skills/live/` | 现场互动：互动块（`assets/blocks/qa`）· 装配器 `inject-live.mjs` · 管理 CLI `smlive.mjs` |
| `apps/SlidesmithStudio/` · `apps/SlidesmithRemote/` | Mac app（WKWebView + Claude 桥）· iPhone / Apple Watch 遥控 app |
| `scripts/verify-*.mjs` | 端到端回归（Playwright，全绿）；`docs/REVIEW-2026-08-30.md` 是最近一次全面审查 |

命令：`npm run sm -- serve|mcp|build|export|doctor <…>` · `npm test` · `npm run typecheck`。

## 文档

| 文档 | 内容 |
|---|---|
| [GUIDE.md](GUIDE.md) | **人类指南**：连 Claude、Studio 每个面板、⌘K、放映、遥控、现场互动、保存与导出 |
| [AGENTS.md](AGENTS.md) | **AI 接口**：MCP 工具、协作环怎么挂、请求格式、按 data-id 回写、提词 / 讲稿的硬约束 |
| [docs/DECK-CONTRACT.md](docs/DECK-CONTRACT.md) | **Deck 契约**：AI 照此生成、导入器照此解析（L1/L2/L3） |
| [docs/REVIEW-2026-08-30.md](docs/REVIEW-2026-08-30.md) | 全面审查与推进批次（批次一、三已完成） |
| [plugin/slidesmith/skills/phone-remote/relay/selfhost/README.md](plugin/slidesmith/skills/phone-remote/relay/selfhost/README.md) | 自托管中转 / 管理台 / 令牌接口 / 部署 |
