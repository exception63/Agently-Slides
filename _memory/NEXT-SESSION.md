# 下个会话交接

> 写于 2026-06-27 会话末。`/clear` 之后：先读 `_memory/active.md` 顶部各 ✅ 块 + 🎯，再读本文件。

## ✅ 本会话(2026-06-27)已完成：Studio↔Claude「握手式自动协作环」
**详见 `active.md` 顶部第一个 ✅ 块。** 一句话：桥接从「手动拉」升级成「握手后零手动拉的自动环」——
`slidesmith_open`(开+握手,Studio 顶栏显「会话 X·端口 Y」)→ `slidesmith_wait`(长轮询阻塞)→ 用户 Studio 发需求 → wait 立刻返回 → 改 → `apply_patch`(用户开了「改前先问我」就 `preview:true` 走提议预览)→ 回 wait。
- **改的文件**：`packages/bridge/src/{bridge.ts,mcp.ts}`（owner/handshake/waitForRequests/`/api/wait`/`/api/handshake`/confirm/preview + 新 MCP 工具 connect/wait）、`packages/studio/src/main.ts`（顶栏会话徽标 + 「改前先问我」开关 + 提议横幅,已 `node scripts/build-studio.mjs` 重建）、`plugin/slidesmith/commands/slidesmith.md`、`AGENTS.md` §4b。
- **验证**：`scripts/verify-handshake.mjs` **18/18** + 全套回归绿 + 单测 40 + typecheck 0。截图 `docs/screenshots/handshake/`。
- **架构决策**：用户 AskUserQuestion 选 **B 会话自动轮询环** + **权限=Studio 开关默认自动应用**。借了 claude-to-im 的握手/回灌/权限思想，未做 A 守护常驻形态。

## 开工先验证环还在
1. 跑 `node scripts/verify-handshake.mjs`（应 18/18）。
2. **真跑一轮**（本会话只 headless 验过，没经真人 Studio 端到端）：`/slidesmith docs/style-reference/keynote-target.html` → 看 `slidesmith_open` 是否握手 → `slidesmith_wait` 是否阻塞到用户提交 → 改完 `apply_patch` 是否当场回灌。
3. **注意**：新 MCP 工具(connect/wait/preview)走仓库源(`.mcp.json` 绝对路径 tsx)，下个会话启动即生效；但 `/slidesmith` 命令文案是 plugin cache 副本，要 `claude plugin marketplace update slidesmith-local` + `claude plugin update slidesmith@slidesmith-local` 才更新（工具本身不需要）。

## 下一步候选（择一，先与用户确认 · 三段闭环里「呈现/讲稿」未补）
- **① 呈现态演讲者视图接 HTML-first 主流程**：现 `renderPresenterHtml` 只服务旧 IR 管线；HTML-first 的契约 deck 缺双屏/备注/计时。需从 deck 抽 speaker notes（契约里 notes 较 fuzzy，keynote 自带演讲者钮另说）。这是闭环最后一段「呈现」。
- **② 制作→修改 交接顺滑**：`editorial-slides` 生成完初版后，一键进 Studio（免用户手动 `serve`），把「制作」和「修改」两段缝起来。
- **③ 讲稿同步**：用户明确说"最后再接"。

## 开工先读
`_memory/active.md`（顶部 ✅ 块 + 🎯）· 本文件 · `packages/bridge/{bridge.ts,mcp.ts}`（握手环现状）· `packages/studio/src/main.ts`（Studio）· `AGENTS.md` §4b · `scripts/verify-handshake.mjs`。呈现相关另读 `packages/engine`（`renderPresenterHtml`）+ `docs/DECK-CONTRACT.md`。
