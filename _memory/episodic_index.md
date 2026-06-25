# Episodic Index: Slidesmith — AI-first HTML Slides System

Do not write long prose here. Use one searchable row per meaningful event.

| Date | Episode | Keywords | Files |
|---|---|---|---|
| 2026-06-24 | 初始化项目记忆系统 | memory; active; episodic; procedures; archive | `_memory/` |
| 2026-06-24 | 需求调研: 现有3 skill 引擎拆解(DNA+痛点) | editorial-slides; transcripts_html; presenter-mode; SLIDE_MAP; 锚点; baked html; 不可再编辑 | `docs/REQUIREMENTS-RESEARCH.md` §2 |
| 2026-06-24 | 需求调研: 6 收藏项目可复用资产 | html-ppt; huashu; guizang; humanize; beautiful-templates; frontend-slides; 数据驱动; 校验器 | `docs/REQUIREMENTS-RESEARCH.md` §3 |
| 2026-06-24 | 需求调研: 外部最佳实践 | reveal; slidev; marp; GSAP; view-transitions; DTCG; CJK; editor.js; tiptap; postMessage 同步 | `docs/REQUIREMENTS-RESEARCH.md` §4 |
| 2026-06-24 | 确认 4 关键决策 | hybrid; markdown; json-ir; node; typescript; 实时预览; 流水线优先 | `_memory/decisions.md` |
| 2026-06-24 | 写定 IR schema v1 + 架构 | IR; SlideNode; Block; 锚点派生; 主题token; 动画; 打包; CLI; 模块布局 | `docs/ARCHITECTURE.md` |
| 2026-06-24 | 写定路线图 M0-M5 | milestone; M0 IR; M1 render; M2 cli; M3 presenter; M4 themes; M5 editor | `docs/ROADMAP.md` |
| 2026-06-24 | 决策: 程序界面=HTML 浏览器 Web 应用(跨系统) | editor; GUI; html; browser; cross-platform; 跨系统 | `_memory/decisions.md` |
| 2026-06-24 | M0 完成: monorepo + @slidesmith/ir | monorepo; npm workspaces; zod; schema; validate; deriveAnchors; json-schema; vitest; typescript; 13 tests | `packages/ir/`; `examples/` |
| 2026-06-24 | M1 完成: 渲染引擎跑通 IR→单文件HTML | engine; themes; editorial; runtime; engine.js; 1920x1080; 缩放; 段导航; 缩略图; 进度条; 全屏; CJK; style-token; 截图验证 | `packages/{engine,themes,runtime}/`; `examples/preview/` |
| 2026-06-24 | 修 CSS 特异性: style token 工具类用 !important | css; specificity; c-accent; !important; utilities; bug | `packages/themes/src/editorial/theme.css` |
| 2026-06-24 | 风格目标 keynote.html 拆解为 theme spec | keynote; dark; amber; #0C0D11; #F4B73E; space-grotesk; 布局archetype; 动画; M4 | `docs/style-reference/keynote-theme-spec.md`; `keynote-target.html` |
| 2026-06-24 | M2 完成: Markdown 解析 + CLI | parser-md; markdown-it; gray-matter; frontmatter; `:::`容器; cli; commander; new/build/validate; stdin; tsx | `packages/{parser-md,cli}/`; `examples/demo.deck.md` |
| 2026-06-24 | M3 完成: 讲稿+双屏演讲者模式同步跑通 | transcript; presenter; noteBlocks; cue/golden/data; deriveSlideMeta; 锚点单一来源; window.open; postMessage; 心跳; heartbeat; 无BroadcastChannel; 整块高亮; smt-current; cue-on; 提词; 双向同步; reverse; source防回声; slideTitle回退; 双窗口截图实测 | `packages/runtime/src/{engine.js,presenter.js,transcript.js,presenter.css,transcript.css}`; `packages/engine/src/render.ts`; `packages/ir/src/{schema,anchors,tokens}.ts`; `packages/parser-md/src/index.ts` |
| 2026-06-24 | M3 修正: file:// 同步主通道改 window.open+postMessage(弃BC) | file://; opaque origin; BroadcastChannel失效; localStorage失效; window.opener; iframe.contentWindow; targetOrigin '*'; 主通道修正 | `packages/runtime/src/presenter.js`; `docs/ARCHITECTURE.md` §8 |
| 2026-06-24 | M4 完成: 多主题 + 动画 + 导出 + QA lint | keynote-dark; academic; theme; 换肤; runtime T; media-gated; allThemes; data-anim; CSS keyframes; fade; rise; stagger-list; counter-up; B键; reduced-motion; export; pdf; png; playwright-core; headless-shell; @media print; window.__SM_GO__; qa; lintDeck; 截图实测 | `packages/themes/src/{keynote-dark,academic}/theme.css`; `packages/runtime/src/{engine.js,core.css}`; `packages/engine/src/render.ts`; `packages/cli/src/{export.ts,index.ts}`; `packages/qa/src/index.ts` |
| 2026-06-24 | M4 决策: 动画用纯 CSS(非 GSAP) + 导出用 playwright-core headless-shell | gsap弃用; css-only animation; rAF counter; playwright-core; chromium-headless-shell; build1228; offline | `_memory/decisions.md`; `packages/cli/src/export.ts` |
| 2026-06-24 | M5 完成: 可视化编辑器(实时预览+内联快编) + v1 完工 | editor; edit命令; node http server; 三栏GUI; contentEditable; bridge; postMessage; sm-edit; sm-select; data-bid; __SM_GO__; 自动保存; deck.json; 重建产物; 换主题; 换布局; 块动画; 加删移幻灯; 0次AI; 截图实测; v1完成 | `packages/editor/src/{server,app,bridge,index}.ts`; `packages/engine/src/render.ts`(data-bid); `packages/cli/src/index.ts`(edit命令) |
| 2026-06-24 | M5 决策: v1 不用重型块编辑库 + 结构改动先存后刷 | editor.js弃用; tiptap弃用; lexical弃用; contentEditable轻量; commit-before-reload; 竞态bug修复; 块编辑选型定案 | `_memory/decisions.md`; `packages/editor/src/app.ts` |
| 2026-06-24 | 用户澄清: 要"双击打开的 HTML UI" → 做独立 Studio | 用户需求; 非程序员; 双击; HTML界面; 双轨; 人类侧; 不要CLI; keynote式; 导入导出 | `studio/slidesmith-studio.html`; `packages/studio/`; `_memory/decisions.md` |
| 2026-06-24 | Studio 完成: 单文件浏览器工作台(导入/编辑/导出) | studio; slidesmith-studio.html; 单文件; 离线; esbuild; build-studio.mjs; 虚拟模块; gray-matter shim; srcdoc; postMessage; 拖拽导入; Blob下载; irToMarkdown; 304KB; 截图实测 | `packages/studio/src/main.ts`; `scripts/build-studio.mjs`; `packages/engine/src/markdown.ts`; `studio/` |
| 2026-06-24 | 写 AGENTS.md(agent 接口) + GUIDE.md(人类指南) + 对比分析 | AGENTS.md; GUIDE.md; agent接口; IR schema; CLI契约; 人类指南; 双轨; 选型对比; vs Claude Design; 何时用什么 | `AGENTS.md`; `GUIDE.md`; `studio/README.md`; `README.md` |
| 2026-06-24 | 设计系统 v1: Keynote 式三 tab + 动效库(呼吸灯) | design-system; 设计系统; 会生长; Keynote inspector; 三tab; 格式; 动画效果; 文稿; build.motion; 持续动效; 呼吸灯; glow; breathe; float; pulse; neon; stress; expoOut; 元素增删移; 符号token; huashu; keynote.html; 提取; 登记册 | `packages/ir/src/tokens.ts`; `packages/runtime/src/core.css`; `packages/studio/src/main.ts`; `docs/design-system.md` |

| 2026-06-25 | 桥接最小闭环: 本地服务(http+WS) + MCP,Studio 连接模式 | bridge; 桥接; @slidesmith/bridge; startBridge; node:http; ws; WebSocket; 同源; location.host; MCP; @modelcontextprotocol/sdk; stdio; slidesmith_open; get_requests; apply_patch; status; serve命令; mcp命令; connectBridge; submitRequests; 已连接Claude; 绿badge; __SM_BRIDGE__; __SM_SEND_ALL__; 请求队列; data-id补丁; 退回手动; file://; 14/14; 截图实测 | `packages/bridge/src/{bridge,mcp,index}.ts`; `packages/bridge/README.md`; `packages/studio/src/main.ts`(connectBridge/submitRequests); `packages/cli/src/index.ts`(serve/mcp); `scripts/verify-bridge.mjs`; `AGENTS.md`(§4b); `docs/screenshots/bridge/` |

| 2026-06-25 | Claude Code 插件打包 + headless 部署 + 全链路 dogfood | plugin; 插件; marketplace; slidesmith-local; .claude-plugin; plugin.json; .mcp.json; 扁平格式; commands; ${CLAUDE_PLUGIN_ROOT}; cache拷贝; 绝对路径; node tsx cli mcp; claude plugin CLI; marketplace add; install --scope user; enabledPlugins; extraKnownMarketplaces; 下次启动才连; 控制API; /api/requests; /api/patch; syncExportToBridge; 回灌deck; EADDRINUSE回退; dogfood; 真浏览器; open; 第3页标题改写; 晚到者也见; 截图实测 | `plugin/.claude-plugin/marketplace.json`; `plugin/slidesmith/.claude-plugin/plugin.json`; `plugin/slidesmith/.mcp.json`; `plugin/slidesmith/commands/slidesmith.md`; `packages/bridge/src/bridge.ts`(控制API/回灌/EADDRINUSE); `packages/studio/src/main.ts`(syncExportToBridge); `scripts/dogfood.mjs`; `docs/screenshots/dogfood/`; `~/.claude/settings.json` |

| 2026-06-25 | 产品重定位 + 编辑器重构 ①-④(评论模型/分工/审阅还原/直接编辑) | 高度AI整合编辑器; 分工; 人做高频细活; AI做模糊重活; 评论; comment模型; Claude Design; 省token; 可定制; mockup; show_widget; AI只按评论改; 页内评论闭环; 跟随当前页; navSyncTimer; 轮询active; updateAiTarget用cur; 修bug; 左列徽标; 待发送; 已改; 任务队列; aiApplied; deck级评论; 对整份deck说; 结构总览; 审阅; 还原本页; aiBefore; 直接编辑; 选中元素上移下移删除; harvest; verify-editor; 22/22 | `packages/studio/src/main.ts`(navSyncTimer/aiApplied/aiBefore/aiDeckInstruction/revertSlide/moveHtmlEl/delHtmlEl/renderAiQueue); `scripts/verify-editor.mjs`; `AGENTS.md`(§4b); `docs/screenshots/editor/` |

## Search Tips

```bash
rg -n "keyword" _memory docs .
```
