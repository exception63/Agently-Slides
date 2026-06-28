# Active Memory: Slidesmith — AI-first HTML Slides System

> Last updated: 2026-06-28 ·〔精简版 · 全部历史在 `_memory/history.md`〕

## ⚡ 启动须知（省 token · 每个新会话先读这块）
- **不要通读整个仓库**。开工只需：① 本文件 ② `_memory/NEXT-SESSION.md`（下阶段任务）③ 要驱动 Studio 时 `AGENTS.md §4b/§4c`（接口契约）。具体某功能细节再去 `_memory/history.md` 里 grep/跳读，别整篇通读。
- **Studio 对话机制不靠"读代码"，靠 MCP 工具 + AGENTS.md**。新会话启动即自动加载 `slidesmith` 插件的 MCP 工具（`slidesmith_open / wait / apply_patch / status / connect`，用户级安装，任意会话可用）。
- 改了 Studio 源（`packages/studio/src/main.ts`）要 `node scripts/build-studio.mjs` 重建 `studio/slidesmith-studio.html`；bridge 每请求重读，刷新浏览器即见。

## 🔌 Studio ↔ Claude 协作机制（一图流）
1. `slidesmith_open(deckPath)` → 浏览器开 Studio + 握手（连上即顶栏「● 已连接 Claude」）。deck = **契约 HTML**（`#deck > .slide[data-id]`）。
2. **实时协作环（正解）= 后台 `curl /api/wait` 自循环脚本**（`run_in_background`，**别 nohup**否则 harness 跟不住）：只在用户真按「发送」时 exit→唤醒我，空闲在后台内部消化 ≈ 零 token。**新会话要重新挂一次**。别用前台 `slidesmith_wait`（卡死对话）。
3. 用户在 Studio 写「AI 待办」（改字 / 配图：矢量·图表·照片 / 导入图）→ 一键发送 → 我收到**单个 `.ai-tasks.md`** → 改写对应 `<section data-id>` → `slidesmith_apply_patch` 回灌。
4. **分工**：人做高频细活（点字/换色/字号/动画/移删元素，即时零 token）；AI 做模糊重活（经待办）。

## ✅ 当前状态（已完成，详见 history.md）
- **Studio** 单文件离线编辑器（`studio/slidesmith-studio.html`，源 `packages/studio/src/main.ts`）+ **bridge** MCP（`packages/bridge`）+ **plugin**（已装，`/slidesmith:*` 技能 + MCP）。
- **AI 待办面板**：对整份 deck / 本页改字 / 配图（**矢量 SVG · 图表 · 照片 codex**）/ 导入图 → 统一一键发送；ⓘ 弹出式说明；图片库（`~/.slidesmith/library/`）；视觉自检。
- **AI 图表 v1**（A=Claude 直接画内联 SVG 默认，覆盖柱/折线/饼/雷达/散点；C=matplotlib 预渲染逃生舱给箱线/热力等复杂图；B 内联库搁置）+ **图表数据可导入文件**（CSV/数字/文本→textarea）。
- 握手自动协作环 · 动画库（10 类 + Studio 子窗口选择器 + 快速设置接全库）· 21 套皮 · 嵌入字体 · 撤销重做 · 保存/导出 PDF。
- **真 dogfood**：用户 JBR 论文《Virtual Journeys》→ 22 页 academic 学术 deck（含概念模型 + 5 张真数据图表 + 动画），仓库根 `virtual-journeys.html`，已在 Studio 渲染。

## ⚠️ 已知坑（必读）
- **editorial-slides deck 导入 Studio 会黑屏**：Studio 丢弃 deck 自带 `<script>` 引擎 → JS 排版的 slide（`position:absolute`）塌掉。修复=deck 注入 CSS 兜底（只在引擎缺席时生效）。详见自动记忆 [[studio-drops-deck-engine]]。**更优长期修**：把兜底加进 `editorial-slides/assets/build.py`，或修 Studio 保住导入引擎。
- 提交：UI 精简 `d90d01b` + 图表 v1 `31be79a` 已 push；图表数据导入 `ce95c6f` 本会话 push。`virtual-journeys.html` 未跟踪（生成成品）。

## 🎯 下一阶段（见 NEXT-SESSION.md）
**审视整个项目，找还能接入什么 AI-first 功能。** 用户非技术、按里程碑自主推进、用 demo/截图验证（非读代码）。

## 按需再读
`_memory/history.md`（全部历史 ✅ 块）· `_memory/NEXT-SESSION.md` · `_memory/decisions.md` · `AGENTS.md`（agent 接口）· `GUIDE.md`（人类指南）· `docs/DECK-CONTRACT.md` · `docs/RESEARCH-{ai-charts,reveal-impress,html-ppt-borrow}.md`
