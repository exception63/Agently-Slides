# Slidesmith — 高度 AI 整合的 HTML Slides 编辑器

> GitHub: [exception63/Agently-Slides](https://github.com/exception63/Agently-Slides)

一个**浏览器里改 HTML slides、Claude Code 实时帮你改**的编辑器。

## 核心：分工

- **你做高频细活**：点字、换色、调字号、加动画、移动/删除元素 —— 即时、零 token。
- **AI 做模糊重活**：你在那一页上留一句**评论**（"改成两栏""统一全套风格"），Claude 改完按页回写。

像 Claude Design 的 comment→edit，但**真 HTML 你自己拥有**、只把相关页发给 Claude（省 token、不撞上限）、完全可定制。
真相源始终是那份**契约 HTML deck**（单文件、离线、可移植）。

## 两种用法

**① 连上 Claude Code（推荐，实时协作）**

1. 跟 Claude 说"用 slidesmith 打开这个 deck"，或敲 `/slidesmith <deck.html>`；浏览器弹出 Studio，顶栏绿色 **● 已连接 Claude**。
2. 在某页写句评论（如"把三个要点改成左右两栏"）→ 点 **🚀 发送给 Claude**。
3. 那几页变蓝色脉冲「已发送 · 等待」→ Claude 改完自动回写 → 变绿 **✓ 已改**；不满意点 **↩︎ 还原本页**。

**② 离线单干（双击即用，无需 Claude）** —— 双击 [`studio/slidesmith-studio.html`](studio/slidesmith-studio.html)：

拖入 deck，点字改、换色、加动效、移动/删除元素、视觉自检、导出 HTML/PDF。想连 Claude 时点顶栏 **🔌 连接 Claude**（见下）。

## 连接 Claude（一键）

桥接跑在 `http://localhost:8765`。只要 Claude Code 开着（装了插件），桥接就在。

- **从 Claude 起**：`/slidesmith <deck>`（或"用 slidesmith 打开"）→ 自动弹出**已连接**的 Studio。
- **从 Studio 起**：点顶栏蓝色 **🔌 连接 Claude** → 自动检测本地服务 → 一键「**打开连接版**」（带上你当前 deck）；没检测到会给小白也能照做的分步指引并自动重试。
- **状态**：顶栏绿 **● 已连接 Claude** = 连上；蓝 **🔌 连接 Claude** 按钮 = 未连。Claude 侧用 `slidesmith_status` 查。

## 安装插件

```bash
npm install && npm run build:studio
claude plugin marketplace add "$(pwd)/plugin" --scope user
claude plugin install slidesmith@slidesmith-local --scope user
# 重启 Claude Code 后，MCP 工具 slidesmith_open/get_requests/apply_patch/status 生效
```

不装插件也能用：`npm run sm -- serve <deck.html>`（自己起桥接、开浏览器、连上模式）。

## 架构

```
   浏览器 Studio  ──WebSocket──▶  桥接(bridge)  ◀──MCP──  Claude Code
   (人做高频细活)                 localhost:8765            (做模糊重活)
        │  在某页留"评论"(任务)  ──向上──▶  请求队列  ──▶  slidesmith_get_requests
        │                                                        │ 按 data-id 改那几页
        ◀── 当场替换那几页(✓已改/可还原) ◀── 补丁 ◀── slidesmith_apply_patch
```

桥接是中间人：浏览器沙箱关着 Studio、Claude Code 在桌面，谁也直接够不到谁。Studio 走**同源 WebSocket**、Claude Code 走 **MCP**，桥接两边都够得着。`file://` 打开 Studio 则退回纯离线手动模式。

## 功能一览

- **页内评论**：评论跟随当前页；左列每页徽标（●待发送 / ●已发送脉冲 / ✓已改）+ 可点跳的任务队列。
- **整份 deck 评论**：「对整份 deck 说…」一句话，AI 自己挑相关页改（请求附带全 deck 结构总览）。
- **审阅 / 还原**：AI 改过的页一键 **↩︎ 还原本页** 回到改之前。
- **直接编辑**：点字改、配色令牌、选中元素调字号/色/对齐/入场动画/持续动效、↑↓ 排序、🗑 删除。
- **进度提示**：发送 → 蓝色脉冲徽标 + 顶部闪烁横幅「已发送 N 个任务…」→ 改完逐页变绿。
- **视觉自检 + 导出**：检查溢出/对比度/坏图；导出单文件 HTML / 一页一张 PDF。

## 仓库结构

| 路径 | 内容 |
|---|---|
| `studio/slidesmith-studio.html` | 成品 Studio（单文件、离线、双击即用）。源在 `packages/studio/`，改后 `npm run build:studio` |
| `packages/bridge/` | 桥接：HTTP + WebSocket + MCP + 控制 API |
| `plugin/` | Claude Code 插件（本地市场 + `.mcp.json` + `/slidesmith` 命令） |
| `packages/{ir,parser-md,engine,qa,themes,runtime,editor,cli}/` | 渲染引擎、契约校验、CLI 等 |
| `scripts/verify-*.mjs` · `dogfood.mjs` | 端到端验证（bridge / editor / connect / dogfood，全绿） |

命令：`npm run sm -- serve|mcp|build|export|doctor <…>` · `npm test` · `npm run typecheck`。

## 文档

| 文档 | 内容 |
|---|---|
| [GUIDE.md](GUIDE.md) | **人类指南**：怎么连 Claude、连接状态、评论工作流、进度/审阅/还原、离线用法 |
| [AGENTS.md](AGENTS.md) | **AI 接口**：MCP 工具、怎么读评论请求、按 data-id 回写、生成契约 deck |
| [packages/bridge/README.md](packages/bridge/README.md) | 桥接：`serve`/`mcp` 命令、WebSocket 协议、控制 API |
| [plugin/slidesmith/README.md](plugin/slidesmith/README.md) | 插件：清单 / 市场 / `.mcp.json` / `/slidesmith` |
| [docs/DECK-CONTRACT.md](docs/DECK-CONTRACT.md) | **Deck 契约**：AI 照此生成、导入器照此解析（合规层级 L1/L2/L3） |
