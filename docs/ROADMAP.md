# Slidesmith — 开发计划 (Roadmap)

> 版本: 1.0 · 日期: 2026-06-24 · 状态: Draft
> 配套: [PRD.md](PRD.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
> 节奏: 一步一步、每个里程碑可独立验收、每步都有"演示得出来"的产物。
>
> 🔄 **2026-06-24 重大转向 HTML-first** —— 下方 M0–M8 是 v1(IR-first)的历史记录(资产多数保留复用)。新方向(契约 HTML deck = 真相源 + 就地编辑 + Submit-to-AI 回路)见 **[PIVOT-v2-html-first.md](PIVOT-v2-html-first.md)**,里程碑改为 N1–N5。

---

## 总策略

**Pipeline-first（D4）**：先把 `IR → 单文件 deck` 端到端打通，用最小主题/布局/动画验证 IR schema，再逐步加宽（多主题、动画、讲稿同步、编辑器）。每个里程碑结束都能 `slidesmith build` 出真东西。

**垂直切片优先**：宁可"1 主题 + 5 布局 + 3 动画全程跑通"，也不要"30 主题但端到端不通"。

---

## 里程碑总览

| 里程碑 | 主题 | 产物 | 验收信号 |
|---|---|---|---|
| **M0** | 项目骨架 + IR v1 | TS workspace + `packages/ir` + 校验 + 样例 IR | 样例 `deck.json` 通过 Zod 校验 |
| **M1** | 渲染引擎 MVP | `engine` + `runtime`：IR→单文件 deck.html | 双击离线 html，键盘翻页+段导航+缩略图可用 |
| **M2** | Markdown→IR + CLI | `parser-md` + `cli`(new/build/validate) | `slidesmith build deck.md` 产出与 M1 同质 deck |
| **M3** | 讲稿 + 演讲者模式 | transcript + presenter，单一锚点 + postMessage 同步 | `file://` 双屏：翻页副屏跟随高亮，双向联动 |
| **M4** | 多主题 + 动画 + 导出 | 移植 editorial/academic/keynote-dark + 动画运行时 + PDF/PNG | 一条命令换主题；动画播放；导出 PDF |
| **M5** | 实时预览 + 内联快编 | `editor`：预览热重载 + 点选改字 + 面板换肤 | 人类 0 调 AI 完成"换色+改字+删页+调画" |
| **M6** | 独立 Studio | 单文件浏览器工作台(双击即用、离线) | 非技术用户 0 终端导入/编辑/导出 |
| **M7** | 设计系统 v1 | Keynote 式三 tab(格式/动画/文稿) + 会生长的元素库 | 选元素改样式 + 入场/持续动效库 |
| **M8** | AI 视觉自检环 | `audit`+`doctor`：headless 渲染量真实布局 + 缩略图 | AI 自动抓到 lint 看不见的溢出/对比/坏图并修复 |
| **v2+** | WYSIWYG / PPTX / 扩展 | 拖拽编辑、可编辑 PPTX、更多主题动画、PPT 导入、QA 增强 | 见下 |

---

## M0 — 项目骨架 + IR Schema v1
**目标**：立地基。把 IR 定下来（承重墙），其余都依赖它。
**任务**：
- [ ] 初始化 Node/TS monorepo（pnpm/npm workspaces）：`packages/{ir,parser-md,engine,runtime,themes,cli,editor,qa}` 占位。
- [ ] `packages/ir`：TS 类型 + Zod schema（顶层/SlideNode/Block，见 ARCHITECTURE §3）。
- [ ] 校验函数 + 友好错误；可导出 JSON Schema 供外部 agent。
- [ ] 写 2 个样例 IR（一个封面+要点+两栏的小 deck；一个含讲稿 notes）。
- [ ] 单测：合法/非法 IR、锚点唯一性、slot 契约、token 引用。
**验收**：`pnpm test` 通过；样例 `deck.json` 校验通过；非法样例报可读错误。

## M1 — 渲染引擎 MVP（IR → 单文件 deck）
**目标**：证明"数据→可投屏单文件"这条路。
**任务**：
- [ ] `packages/themes/editorial`：先做 1 主题（tokens.json + theme.css + 核心 layouts + class 契约，移植自 editorial-slides 的视觉）。
- [ ] 核心 layout（v1 子集）：`cover/section/bullets/two-col/statement/data-stat/quote/end`。
- [ ] `packages/engine`：IR+theme → slides HTML 片段（块落 slot；继承式样式）。
- [ ] `packages/runtime`(engine.js)：1920×1080 画布 + 投屏缩放、键盘/点击翻页、段导航 + 实时缩略图、进度条（移植/重写自现有引擎）。
- [ ] pack：内联 core.css + theme.css + engine.js + 子集标题字 → 单 `deck.html`。
- [ ] CJK 排版基线（系统正文栈 + `text-autospace`/`text-spacing-trim` + 行高）。
**验收**：无网络双击 `deck.html`，全屏投屏、键盘翻页、左侧段导航 + 缩略图、进度条均可用；中文排版正确。

## M2 — Markdown→IR + CLI
**目标**：给 AI/人类好写的 authoring 入口 + 命令行。
**任务**：
- [ ] `packages/parser-md`：frontmatter + `:::` 容器指令（layout/slot/note/cue/golden/data）+ 标准 MD 元素 → IR。
- [ ] 往返一致性：MD→IR 后渲染 ≈ 直接写 IR 渲染。
- [ ] `packages/cli`：`new`(脚手架 deck.md)、`build`(md|json→产物)、`validate`(IR+lint)。
- [ ] Agent 友好：`--stdin/--json`、机器可读错误、退出码。
- [ ] 写 `examples/` 的 deck.md。
**验收**：`slidesmith new demo && slidesmith build demo.deck.md` 产出与 M1 同质 deck；`validate` 能挑出锚点/slot/缺图问题。

## M3 — 讲稿 + 演讲者模式（核心差异化）✅ 完成 2026-06-24
**目标**：把"同步演示"做成从 IR 自动派生的一等公民，并修正 `file://` 同步坑。
**任务**：
- [x] 锚点单一来源：`deriveAnchors`/`deriveSlideMeta` 派生，注入 deck、生成 transcript `id`、presenter 读取（不再三处硬编码）。
- [x] transcript 生成：从 `notes`+讲稿块(cue/golden/data) → 同视觉 transcript.html（每 slide 一个 `<article id=anchor>`）。
- [x] presenter.html：当前/下一页预览 + 计时器 + iframe(transcript) + 控制（跟随/同步/缩放/提词/全屏）。
- [x] 同步主通道：`window.open()`+窗口引用 `postMessage`+~1s 心跳；`source` 防回声；双向联动（副屏按键/TOC→主屏）。**完全不用 BroadcastChannel**。
- [x] 整块高亮 + `body.cue-on` 关键词提词（仅激活块的 `<strong>`）。
- [x] 第二屏落位：`getScreenDetails`/`requestFullscreen({screen})` 特性检测 + `window.open` features 回退。
**验收**：✅ 双屏主屏翻页副屏跟随并整块高亮；✅ 副屏按键反向翻页；✅ 插入一页重 build 后锚点不错位（同一 build 三处同源派生）。浏览器双窗口实测全过（截图存档）。

## M4 — 多主题 + 动画 + 导出 ✅ 完成 2026-06-24
**目标**：加宽视觉与表现力，补齐交付能力。
**任务**：
- [x] 移植 `academic`、`keynote-dark`(旗舰暗+琥珀) 为内置主题；运行时 `T` 切主题(全主题 media-gated 内联，离线无 FOUC)。(html-ppt 对照风格留作后续扩充)
- [x] 动画运行时：`data-anim*` → **CSS keyframes**(非 GSAP)；内置 `fade/rise/stagger-list/counter-up`；`B` 关动画 + `prefers-reduced-motion`。(`auto-animate`/View Transitions morph 留 v2)
- [x] `export`：playwright-core + chromium-headless-shell → PDF(一页一 slide)/PNG(一图一 slide)。
- [x] 产物 lint(`@slidesmith/qa` lintDeck：空页/溢出/缺图 alt/缺讲稿/重复标题)，接入 `validate` + 独立 `lint --strict`。
**验收**：✅ `--theme keynote-dark` 一键换肤 + 运行时 `T` 循环；✅ 动画离线可播(stagger/counter 实测)；✅ `export --format pdf` 出 5 页正确 PDF。浏览器实测全过(截图存 `docs/screenshots/m4/`)。

## M5 — 实时预览 + 内联快编（v1 编辑面，闭环"人类后期修改"）✅ 完成 2026-06-24
**目标**：兑现 PRD G3——人类不调 AI 也能改。
**任务**：
- [x] 块编辑库选型决策：**v1 不用重型库**（Editor.js/TipTap/Lexical 均否决）——扁平 IR 块用 contentEditable 直接往返够用，留 v2。
- [x] `packages/editor`：起本地 Node http 服务，读 IR→**复用 engine 渲染预览**(`/preview`)→改动重载。
- [x] 点选改文字回写 IR（预览注入 bridge：contentEditable + postMessage）；面板：换主题 / 换当前页 layout / 调选中块动画 / 加删移幻灯片。
- [x] 自动保存回 `<name>.deck.json`（canonical）；一键"重建产物"出 deck/transcript/presenter。
**验收**：✅ 浏览器实测 0 次 AI 调用，完成"换配色(keynote-dark) + 改文字 + 加/删页 + 调动画(stagger-list)"并重建全部产物。截图存 `docs/screenshots/m5/`。

---

## 🎉 v1（M0–M5）全部完成 — 2026-06-24
端到端打通：Markdown/JSON → 校验/lint → IR → 渲染(deck+逐字稿+演讲者三件套) → 3 主题+运行时换肤+动画 → PDF/PNG 导出 → 可视化编辑器。下一步按用户真实使用反馈迭代；扩展见下方 v2+ 储备。

---

## M8 — AI 视觉自检环（迭代主线，2026-06-24 用户拍板）✅ 核心完成
> (M6=独立 Studio、M7=设计系统 v1 已在 v1 完成后陆续落地，见 `_memory/`；本节是新主线。)
**洞察**：产品命脉是 AI↔人的"交接环"，v1 两端都开口。AI 端=闭眼生成：只有结构层 `validate`/`lint`，**看不见自己渲染出来的样子**（溢出裁切/对比度/坏图）。本里程碑给 AI 装上"眼睛 + 自修"。
**任务**：
- [x] `packages/cli/src/audit.ts`：复用 `export` 的 playwright-core 路径，headless 渲染 → present 模式逐页 `__SM_GO__` → **页内量真实布局**。检测：`visual.offcanvas`(块越界，带 data-bid)/`overflow-y·x`(整页裁切)/`contrast`(WCAG，有效背景上溯)/`image-broken`(naturalWidth==0)/`sparse`(layout-aware)。每条带 **slide id + block id** → AI 知道改哪。
- [x] 页内审计器写成原始 JS 字符串绕开 tsx 的 `__name` 注入。
- [x] CLI `audit`(--thumbs/--json) + `doctor`(validate+lint+audit+缩略图 一站式交付前 gate，有 error 退 1)。
- [x] `AGENTS.md`：recommended workflow 加第 3 步"doctor 看+修"，加 finding codes 表。
- [x] demo `examples/broken.deck.json`：过 validate+lint 但渲染翻车(display 巨字溢出 + color=bg 隐形)。
**验收**：✅ 同一 deck `lint` 报 clean，`audit` 抓到 2 个 error 各带 block id；AI 据此改 IR(display→h3、bg→ink)后 `doctor` 全清"ready to deliver"；前后缩略图存档 `docs/screenshots/m8/`(before/after-overflow·contrast)。40/40 测试 + typecheck 0 错不回归。
**后续可选**：缩略图联系表(一眼审)、自动修建议、视觉审计接进 Studio(人也能一键自检)。

---

## v2+ 储备（不排期，按需）
- 全 WYSIWYG：拖拽/缩放、per-element 样式面板、定位回写。
- 可编辑 PPTX 导出（借鉴 huashu `html2pptx`）。
- PPT/Markdown 导入（借鉴 frontend-slides `extract-pptx.py`）。
- 更多主题 + Canvas FX 动画库（借鉴 html-ppt 20 FX）。
- "先预览后选风格"工作流（借鉴 frontend-slides/huashu 方向顾问）。
- QA 自动修复循环（借鉴 humanize 3 轮 QA）。
- 与现有 3 skill 的迁移/承接：把旧皮全部导出为内置主题，逐步以 Slidesmith 统一。

---

## 依赖与顺序
```
M0(IR) ──▶ M1(render) ──▶ M2(md+cli) ──▶ M3(presenter) ──▶ M4(themes/anim/export) ──▶ M5(editor)
            └────────────── 全部依赖 IR；M3 依赖 M1 的 runtime；M5 复用 engine ──────────────┘
```
- **关键路径风险点**：M0 的 IR 设计、M3 的 `file://` 同步 → 这两处尽早验证（M1 期间可先做 M3 同步的技术 spike）。

## 每个里程碑的"完成定义" (DoD)
1. 代码 + 单测/产物测试通过。
2. `examples/` 有可跑样例。
3. 更新 `_memory/`（active/decisions/timeline/episodic）。
4. 该里程碑的验收信号已实测勾掉。

## 下一步（M0 启动）
1. 评审本批文档（PRD/Architecture/Roadmap）。
2. 初始化 Node/TS monorepo 骨架。
3. 落 `packages/ir`：类型 + Zod schema + 样例 + 单测。
