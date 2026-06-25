# NEXT-SESSION 交接 (2026-06-25 · 插件+闭环+dogfood 已成)

> `/clear` 之后:**先读 `_memory/active.md`,再读本文件 + `_memory/decisions.md`**。

## 现状一句话
"快速改 slides 编辑器" + **桥接闭环** + **Claude Code 插件**全部就位且实测通过。导入契约 HTML deck → Studio 就地编辑 → Submit-to-AI（手动文件 **或** 桥接直连）→ 视觉自检 + PDF 导出。插件已装好（`slidesmith@slidesmith-local`，user scope，已启用）。

- Studio 成品 `studio/slidesmith-studio.html`；源 `packages/studio/src/main.ts`，改源后 `npm run build:studio`。
- 桥接 `packages/bridge`：`slidesmith serve [deck]`（给人）/ `slidesmith mcp`（给 Claude Code）。HTTP 控制 API：`/api/status`、`/api/requests`(GET 取走)、`/api/patch`(POST)。
- 插件 `plugin/`：marketplace `slidesmith-local` + 插件 `slidesmith`；MCP 在 `plugin/slidesmith/.mcp.json`（扁平格式，绝对路径 node+tsx+cli mcp）；命令 `commands/slidesmith.md`。
- 文档：`AGENTS.md`(§4b 桥接)、`packages/bridge/README.md`、`plugin/slidesmith/README.md`、`docs/DECK-CONTRACT.md`。
- 验证：`scripts/verify-bridge.mjs`(14/14) + `scripts/dogfood.mjs`(对实跑的 serve 黑盒闭环)。截图 `docs/screenshots/{bridge,dogfood}/`。

## ✅ 这次做完了什么（插件 + 部署 + dogfood）
1. 插件三件套：`plugin/.claude-plugin/marketplace.json`、`plugin/slidesmith/.claude-plugin/plugin.json`、`plugin/slidesmith/.mcp.json`（**MCP 必须放单独 .mcp.json，扁平 name→config**；plugin.json 里内联 `mcpServers` 这版**不识别**）。
2. 部署：`claude` CLI（v2.1.162）`plugin marketplace add` + `plugin install --scope user`；`claude plugin details slidesmith` → MCP servers(1)。
3. bridge：HTTP 控制 API + patch 回灌内存 deck（`syncExportToBridge`）+ EADDRINUSE 自动换端口。
4. dogfood：真浏览器弹出（serve 的 `open` 没被沙箱挡）→ 全闭环跑通，第3页标题被精准改写、其它不动、晚到者也见。

## 🆕 2026-06-25 续:产品重定位 + 编辑器重构 ①-④ 已完成
用户拍板项目 = **高度 AI 整合的 HTML slides 编辑器**(核心**分工**:人做高频细活、AI 经**评论**做模糊重活;像 Claude Design comment→edit 但真 HTML 自有/省 token/可定制)。给用户看 mockup 对齐了:AI 角色=**只按评论改**;①→④ 全做完且 `scripts/verify-editor.mjs` 22/22:
- ① **页内评论闭环**:评论跟随当前页(`navSyncTimer` 轮询 deck `.active`;`updateAiTarget` 用 `cur`)、左列每页徽标(●待发送/✓已改)、右栏「全部任务」队列、apply 标✓不删评论。**修好了用户报的 bug**。
- ② **deck 级评论**「对整份 deck 说」+ 请求带 36 页结构总览。③ **审阅/还原**(`aiBefore`→「还原本页」)。④ **直接编辑**(选中元素 ↑↓🗑)。
- 插件 MCP 本会话**已连**(`mcp__plugin_slidesmith_slidesmith__*` 可用);AGENTS.md §4b 已更新请求新形态。

**下一步候选**(未与用户最终敲定先后):用原生 MCP 把**新评论流**真跑一遍(slidesmith_open→用户逐页留评论+对整份说→get_requests→改→apply→用户审阅/还原);按 mockup 把「评论卡」做成贴在幻灯片下方的 docked card;加「已发送·等待中」中间态;deck 级 token 补丁(字体/配色,现 apply_patch 只换 section 不改 head 令牌);需要时再做「AI 主动提建议」(用户当前选不做)。

## 🏁(旧)收尾 = 原生 MCP 实跑 + 打磨
1. **重启 Claude Code 后**，插件的 MCP server `slidesmith` 才会连上（本会话内连不上，是预期）。届时跑 `/slidesmith docs/style-reference/keynote-target.html`：我应能调 `mcp__slidesmith__slidesmith_open`（弹 Studio+已连）→ 用户在 Studio 提交一句 → `mcp__slidesmith__slidesmith_get_requests` 读到 → 按 data-id 改 → `mcp__slidesmith__slidesmith_apply_patch` 回写 → 当场可见。**这是唯一还没经 Claude Code 自带 MCP 客户端实跑的链路**（本会话用 control-API 等价验过）。
2. 可选：Studio 人类/AI 两套模式键位再清晰分离；serve deck 存盘 / `slidesmith_save` 工具；发布插件到真 marketplace；把 `mcp` 入口打包成自包含 bundle（免依赖 tsx/node_modules）。

## 坑（已踩，别回退）
- **插件 MCP 放单独 `.mcp.json`**（扁平），不是 plugin.json 内联。装插件会**拷贝到 `~/.claude/plugins/cache/...`**，所以 MCP 命令用**绝对路径指向仓库**（`${CLAUDE_PLUGIN_ROOT}` 指 cache，无 node_modules）。MCP 命令：`<abs>/.local/bin/node  <abs repo>/node_modules/tsx/dist/cli.mjs  <abs repo>/packages/cli/src/index.ts  mcp`，cwd=仓库。
- 新 MCP server **下次启动**才连；本会话内 ToolSearch 搜不到 `slidesmith` 工具是正常的。
- 改 deck 路由靠**同源 WS**（`ws://location.host`）。bridge **stdout 专给 MCP**，日志走 stderr（`log()` 已是）。CLI `--port 0` 会被 `||DEFAULT_PORT` 吃掉（0 falsy）。
- `verify-bridge.mjs`/`dogfood.mjs` 用 **`npx tsx`** 跑；deck 在 `#preview` iframe，DOM 查询走 `contentDocument`，`__SM_*` 钩子在 top window。
- **遗留 serve 别长开**:它占 8765，重启后插件 MCP 会 EADDRINUSE→已加自动换端口兜底，但最好先停掉旧 serve。
- 用户非技术:每步要有能演示/截图的产物;自主推进。
