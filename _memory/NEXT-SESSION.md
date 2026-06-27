# 下个会话交接 · Studio↔Claude「握手式自动协作环」

> 写于 2026-06-27 会话末（用户要清空上下文，新会话继续）。`/clear` 之后：先读 `_memory/active.md` 顶部各 ✅ 块 + 🎯，再读本文件。

## 🎯 北极星（用户 2026-06-27 定）
把 Studio↔Claude 的桥接从**手动拉**升级成**握手式自动协作环**，**借鉴 `claude-to-im` skill 的做法**——它能在飞书/Telegram 和 Claude 互动，且**不用手动在 session 里拉需求**。

## 用户原话描述的目标流程（照此实现）
1. **从 Claude 发起**：用户在 session 里主动调用 `/slidesmith` → **直接桥接好**。此后所有需要 AI 改的：用户在 Studio 发出需求 → **这个 session 自动轮询到该需求 → 主动完成修改**。同时用户**要在 session 里看到 Studio 发来的信息**（才能掌握状态）。
2. **从 Studio 发起（冷启动）**：用户先从 Studio 发请求 → session 里**以明确信息告知** → AI 通过 slidesmith 去拉这个需求 → 建立通讯 → 打开服务 → 主动轮询。
3. **核心**：一旦建立通讯，**双方就握手了**，之后持续协作（双向自动同步、零手动拉）。

## claude-to-im 怎么做到"不用手动拉"（已读源码 `~/.cc-switch/skills/claude-to-im`）
- **一个常驻后台守护进程（Node.js）**，关终端不停（带 supervisor 脚本 `scripts/supervisor-*`）。
- 守护进程用 **`@anthropic-ai/claude-agent-sdk` 的 `query()`** 跑 Claude（headless/SDK，**不是交互终端会话**）。IM 来消息 → 守护把消息喂给 `query()` → **流式**跑一个 agent 回合 → 结果发回 IM。
- **会话续接**：`query({ resume: sdkSessionId, permissionMode, canUseTool, ... })` 续同一会话（对话跨守护重启保留，消息按会话分文件存于 `~/.claude-to-im/`）。
- **流式 + 权限网关**：`for await (const msg of q)` 流式回传；`canUseTool` 回调 → IM 内联"批准"按钮（**先批准再执行工具**）。
- 关键文件：`src/llm-provider.ts`（`query()` 用法 / `resume` 续接 / `canUseTool`）、`src/main.ts`（守护入口）、`dist/daemon.mjs`（构建产物）、`README_CN.md`（架构图：IM ↔ 后台守护 ↔ Claude Agent SDK）。
- **可借鉴的 4 点**：① 守护拥有一个长跑 Agent SDK 会话、自动喂入、零手动拉；② 进度/消息**流式回传到来源**（这里=Studio）；③ **权限网关**（改前批准）；④ **sessionId 续接 + 消息历史持久化**。

## Slidesmith 桥接现状（起点）· 读 `packages/bridge/{bridge.ts,mcp.ts}`
- 桥接 = 单进程、**一个内存请求队列**（`pending` 数组，**无 session/client 标签**）。
- **pull 模型**：session 必须主动调 `slidesmith_get_requests`（或后台 `curl /api/requests` 轮询）才拿到；桥接**不会 push 给 session**。
- Studio 绑定它连上的那个桥接（`ws://location.host`，即"开它的那次服务"）。MCP 工具：`slidesmith_open / get_requests / apply_patch / status`。
- 当前"自动接活"= dogfood 用过的**后台 Bash 轮询** `curl /api/requests?drain=0`（超时与命中都 exit 0，读 output 区分）——手动搭的，非握手机制。
- 多 session 时每个可能各起一个桥接（端口占用→EADDRINUSE 自动换端口），Studio 只连其一 → 需求只有那个桥接的"主人 session"能取。
- **缺**：握手 / 会话归属、push 或自动轮询、双向状态在 session 可见、Studio-first 冷启动如何通知到 session。

## 下个会话要做（设计 → 实现，按用户工作方式 demo 验证）
1. **先定架构**（两条路，权衡后选或混合，先给用户讲清取舍再动手）：
   - **A · 守护拥有 Agent（最贴 claude-to-im）**：起一个 Slidesmith 守护进程跑 `claude-agent-sdk query()`，Studio 发→守护喂 agent→agent 用 slidesmith MCP 工具改→回传 Studio。真·零手动拉、可常驻；但"用户的 session"变成守护里的 SDK 会话，"在 session 里看到"需另设计（状态回灌 Studio + 一个会话视图）。
   - **B · 交互 session 自动轮询（最贴用户描述）**：用户在交互式 Claude Code session 里 `/slidesmith` → 建桥 + **在本 session 内起轮询循环**（用 `/loop` 机制或 ScheduleWakeup/后台任务自再调用）→ Studio 发→本 session 轮到→AI 改→Studio 消息**在 session 内联可见**→续循环。保留人类交互 session 为中心。**用户描述强烈指向 B**。
   - 现实可能 **B 为主 + 借 A 的握手/续接/权限思想**。
2. **握手协议**：双向标识——Studio 顶栏显示"已连接会话 X / 端口 Y"；桥接握手带会话 id；session 侧记"我负责哪个 Studio/deck"。彻底消除"需求落到哪个 session"的歧义（上个会话末用户问的正是这个）。
3. **两种发起的体验**：
   - Claude-first：`/slidesmith <deck>` 即建桥 + 自动轮询 + Studio 消息进 session。
   - Studio-first：Studio 发请求 → 目标 session 冒出明确提示（"Studio 有新需求，我去拉"）→ AI 调 slidesmith 拉取 + 建桥 + 开轮询。
4. **双向状态可见**：session 看到 Studio 发来的内容（需求/导出/连接事件）；Studio 看到 AI 在改/改完（已有 `aiSent`/`aiApplied` 徽标 + 回灌，可复用）。
5. **权限**：AI 自动改前要不要用户确认？借 `canUseTool` 网关思路，给"自动应用 / 先确认"开关。

## 本会话（2026-06-27）已完成 · 全部 commit+push 到 origin/main（HEAD=d9cc05e）
选中框 bug 修复 · transitions.dev 动效（动效令牌 + A5 数字弹入 / A12 多行浮现 / H8 成功对勾）· Studio 界面文案专业化（去 emoji/口语）· acrylic 毛玻璃皮（第 22 套，Fluent，PDF 实测不丢）· 动画库画廊深色专业重设计（复制写法/明暗底/筛选/scrollspy/组合预览）· editorial-slides 选皮流程（推荐→看全 22 皮总览图→真内容试皮→定；build.py `--title`→真封面；`gallery/theme-contact-sheet.png` + `scripts/build-contact-sheet.mjs`；version 1.6.0）。详见 `active.md` 顶部各 ✅ 块。
**闭环三段诊断**（对话里 show_widget 图）：制作=本会话补了选皮入口 · 修改=强（Studio 已完整）· 呈现=待补演讲者视图 · 讲稿同步=最后做。本"握手自动环"属**修改**段的协作打通；**呈现/讲稿**仍待下下阶段。

## 开工先读
`_memory/active.md`（顶部 ✅ 块 + 🎯）· 本文件 · `packages/bridge/{bridge.ts,mcp.ts}` · `~/.cc-switch/skills/claude-to-im/{SKILL.md,src/llm-provider.ts,src/main.ts,README_CN.md}` · `AGENTS.md`（§4b 桥接接口）· `plugin/slidesmith/`（MCP 插件 + .mcp.json）。
