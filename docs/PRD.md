# Slidesmith — 产品需求文档 (PRD)

> 版本: 1.0 · 日期: 2026-06-24 · 状态: Draft，等待评审
> 产品代号: **Slidesmith**（暂定，可改）· 仓库: `presentsystems` · CLI: `slidesmith`（别名 `sm`）
> 依据: [REQUIREMENTS-RESEARCH.md](REQUIREMENTS-RESEARCH.md) · 技术细节: [ARCHITECTURE.md](ARCHITECTURE.md) · 排期: [ROADMAP.md](ROADMAP.md)

---

## 1. 愿景 (Vision)

> 让 AI agent 用结构化数据**几秒钟生成**出版物级的 HTML 演示（含同步逐字稿 + 双屏演讲者模式），让人类用户随后用**可视化或源码方式自由修改并保存**——无需再回到 AI 反复沟通。

一句话定位：**AI-first 的演示制作与演示系统；AI 主导生成，人类主导后期精修。**

核心机制：把"演示"从**一坨烘焙死的 HTML** 变成 **"内容数据(IR) + 可替换的主题/布局/动画"**，引擎把两者编译成你今天已经在用的那种单文件可移植 HTML。

---

## 2. 目标与非目标

### 2.1 目标 (Goals)
- **G1** AI agent 通过 CLI/JSON/Markdown 高效生成 deck，单位内容的 token/时延远低于"直接写整页 HTML"。
- **G2** 产出**单文件、离线、可移植**的 HTML deck + 同步逐字稿 + 演讲者视图，质量不低于现有 `editorial-slides`。
- **G3** 人类用户能在**不调用 AI** 的情况下修改内容/风格/排版/动画，并保存。
- **G4** 锚点/主题**单一来源**，插入/重排页面不再断同步、不再手工对齐三处。
- **G5** 不重复造轮子：复用本地 6 项目与现有 3 skill 的成熟资产。

### 2.2 非目标 (Non-Goals, v1)
- ❌ 不做云端协作/多人实时编辑（未来可选）。
- ❌ 不做完整 mini-Keynote 级自由拖拽 WYSIWYG（v2+ 再做；v1 只做实时预览 + 内联快编）。
- ❌ 不做账号/权限/SaaS 后端。
- ❌ 不取代视频动效导出（huashu 那条线）；可后续桥接，不在核心。
- ❌ 不追求支持任意第三方框架的 deck 导入（PPTX 导入可后续）。

---

## 3. 用户与场景 (Personas & Journeys)

### P1 — AI Agent（主要用户，"first"）
> 如 Claude Code / 其它 agent。要"快、可控、可校验"。

**旅程**：收到用户主题/素材 → 产出 `deck.md`（Markdown+frontmatter）或直接 `deck.json`(IR) → 调 `slidesmith build deck.md` → 得到 `deck.html` + `transcript.html` + `presenter.html` → 跑 `slidesmith validate` 自检 → 交付。
**关键需求**：结构化短文本输入、强默认主题、声明式动画、产物自检、稳定块 id 便于后续增量修改。

### P2 — 人类编辑者（后期精修，"second"）
> 拿到 AI 产物想改：换个配色、调字号、换布局、改一句话、调动画、删一页。

**旅程**：打开 `slidesmith edit deck.json`（或本地编辑器）→ 实时预览 → 点选文字直接改 / 面板换主题/布局/动画 → 保存回 IR → 一键重新生成全部产物。
**关键需求**：所见即所得的预览、低门槛改动、改动**无损回写 IR**、不破坏讲稿同步。

### P3 — 演讲者（现场使用）
> 主屏投 slides，副屏(iPad/笔记本)看讲稿。

**旅程**：打开 `deck.html` → 按键开演讲者模式 → 副屏自动跟随当前页讲稿、整块高亮、关键词提词；副屏按键可反向翻页。
**关键需求**：双屏稳定同步（含 `file://` 离线）、提词清晰、低延迟、断线自恢复。

---

## 4. 产品支柱 (Pillars)

1. **演示即数据 (Presentation-as-Data)** — JSON IR 是唯一真相源；一切产物可从它重生。
2. **内容/表现解耦** — AI 写内容 + 符号 token；主题/布局/动画是可替换产物；两者独立演进。
3. **单文件可移植** — 产物离线自足，`file://` 即可投屏。
4. **同步演示一等公民** — 讲稿与演讲者模式不是事后补丁，而是从 IR 自动派生。
5. **质量护栏** — 强默认 + 渐进暴露 + 产物校验，防 AI-slop 与排版翻车。

---

## 5. 功能需求 (Functional Requirements)

### 5.1 内容数据层 (IR)
- IR 为带 `ir_version` 的 JSON：deck 级（theme/defaults/metadata）+ `slides[]`，每页含稳定 `id`、`layout`、`slots{}`、`notes`、`transition`。
- 每个内容块 `{id, type, ...payload, style?(token refs), build?(animation), dataId?}`；封闭块词汇表：`heading/text/list/image/code/chart/table/quote/embed/group`。
- IR 必须可被 JSON Schema/Zod 校验；非法输入给出可读错误。
- 详见 [ARCHITECTURE.md §3](ARCHITECTURE.md)。

### 5.2 输入 / authoring
- **Markdown + YAML frontmatter** 作主 authoring 格式：`---` 全局配置；`---` 分页；具名 layout via frontmatter；讲稿 via `<!-- note: ... -->` 或 `Notes:` 区块。
- 解析器 Markdown → IR；亦接受直接的 `deck.json`(IR)。
- 允许"内容覆盖 + 主题继承"：未设的 style 走主题默认（继承式）。

### 5.3 主题系统
- 主题 = `tokens`(DTCG JSON：颜色/字体/字号阶/间距) + `layouts`(具名 slot 容器 + CSS) + `animation defaults`。
- 渲染时 tokens → `:root{--…}`；支持运行时切主题（继承 html-ppt 的 `T` 键体验，但语义化）。
- **首批内置主题**：移植 `editorial`、`academic`、`keynote-dark`（来自现有 skill），加 1–2 个来自 html-ppt 的对照风格。
- 提供"强默认主题"，AI 不指定时自动用，避免选择困难。

### 5.4 布局系统
- 具名 layout 带 slot 契约（如 `two-cols` 有 `left/right`）。
- v1 覆盖页型：`cover / toc / section / statement / bullets / two-col / data-stat / image-text / quote / compare / end`（参考 html-ppt 31 布局与 guizang 22 锁定布局裁剪出常用子集）。
- layout 与主题正交：换主题不改 layout 选择。

### 5.5 动画
- 声明式属性：`data-anim`(名)、`data-anim-delay`、`data-anim-stagger`；块级 `build` 字段映射到这些属性。
- **页内**：~50 行运行时读属性 → 建 `gsap.timeline()`（GSAP，免费许可）。
- **页间**：View Transitions API（特性检测，回退 CSS 淡入）。
- v1 提供一组克制的内置动画（fade/rise/stagger-list/counter-up/auto-animate morph），避免 47 个动画的选择过载。

### 5.6 讲稿与同步（核心差异化）
- 逐字稿从 IR 的 `slides[].notes` 自动生成为同语言视觉的 transcript HTML。
- **锚点单一来源**：引擎从 IR 的 slide `id` 派生唯一锚点，slides / transcript / presenter 三处全部引用同一派生结果——**消除手工三处同步**。
- 讲稿块支持 `cue`(讲法提示)/`golden`(金句)/`data`(数据) 语义（继承 transcripts_html）。

### 5.7 演讲者模式
- 主通道：`window.open()` + 通过窗口引用 `postMessage` + ~1s 心跳保活（reveal 模型，`file://` 可用）。
- 增强通道（http 下）：BroadcastChannel/localStorage 作状态恢复，非主通道。
- 功能：当前/下一页预览、计时器、整块讲稿高亮、`body.cue-on` 关键词提词、**双向联动**（副屏按键/TOC 点击 → 主屏翻页），`source` 字段防回声。
- 第二屏自动落位：Window Management API（特性检测 + 手动回退）。

### 5.8 CLI / Agent 接口
- `slidesmith new <name>` — 脚手架一个 deck.md 模板。
- `slidesmith build <deck.md|deck.json> [--theme] [--out]` — 产 deck/transcript/presenter。
- `slidesmith validate <deck>` — 校验 IR + 产物 lint（缺图/溢出/对比度/锚点）。
- `slidesmith export <deck> --format pdf|png` — Playwright headless。
- `slidesmith edit <deck.json>` — 起本地实时预览编辑器（v1.5/v2）。
- 支持 `--json` stdin/stdout，便于 agent 管道；退出码与机器可读错误。

### 5.9 人类编辑（v1：实时预览 + 内联快编）
- 本地起预览服务，文件改动热重载。
- 点选页面文字 → 原地编辑 → 回写 IR。
- 面板：换主题 / 换当前页 layout / 调动画 / 改 token（配色/字号）。
- 所有改动**回写 JSON IR**（canonical），可随时重新 `build` 全产物。

### 5.10 导出
- PDF / PNG（Playwright）。
- 可选可编辑 PPTX（借鉴 huashu `html2pptx`，标注为 lossy，后续里程碑）。

### 5.11 质量护栏
- 产物校验器：缺图、文本溢出、对比度不足、锚点数不齐、layout 违规。
- 借鉴 guizang `validate-*.mjs` 与 humanize `qa-failure-modes.md`。

---

## 6. 非功能需求 (见研究文档 §5.2)
可移植/离线、CJK 优先、AI 高效、可再编辑无损往返、许可证干净、单一来源可维护、特性检测降级。

---

## 7. 成功指标 (Success Metrics)
| 指标 | 目标 |
|---|---|
| AI 生成效率 | 同等 10 页 deck，AI 输出 token 较"直接写 HTML"降低 ≥60% |
| 可再编辑 | 人类完成"换配色 + 改 3 处文字 + 删 1 页 + 调 1 处动画"全程 0 次调用 AI |
| 同步可靠 | `file://` 双屏演讲者同步成功率 100%（含断线 1s 内恢复） |
| 锚点正确 | 插入/重排页面后三处锚点 0 错位（自动派生） |
| 移植性 | 产物在无网络环境双击 `.html` 正常投屏与播放动画 |
| 视觉质量 | 默认主题盲评不低于现有 editorial-slides |

---

## 8. 风险与缓解 (Risks)
| 风险 | 影响 | 缓解 |
|---|---|---|
| IR schema 设计不当导致后期大改 | 高 | v1 重心即"打通端到端验证 IR"；先窄后宽；版本化 `ir_version` |
| `file://` 双屏同步坑（已知 BroadcastChannel 失效） | 高 | 主通道用 `window.open()`+`postMessage`+心跳；早期专项验证 |
| CJK 字体体积/离线 | 中 | 子集内联显示字 + 系统字体正文；保留在线大字体模式 |
| 选择过载（主题/布局/动画太多） | 中 | 强默认 + 渐进暴露；v1 只放克制子集 |
| 可视化编辑无损往返难 | 中 | canonical=JSON IR；编辑库选 Editor.js/TipTap（schema 校验） |
| 与现有 3 skill 的关系/迁移 | 中 | v1 不破坏现有 skill；新系统并行，逐步以"导出现有皮为内置主题"承接 |

---

## 9. 与现有 skill 的关系
- v1 **不删除/不破坏** `editorial-slides`/`transcripts_html`/`slides-presenter-mode`。
- 新系统把它们的**视觉与同步 DNA 下沉为引擎 + 内置主题**；现有皮以"内置主题"形式被 Slidesmith 承接。
- 长期：Slidesmith 成为统一引擎，旧 skill 可作为"主题/风格供给方"或逐步退役。

## 10. 范围与里程碑（详见 ROADMAP）
- **M0** 项目骨架 + IR schema v1（本阶段产出文档后启动）
- **M1** 渲染引擎 MVP：IR → 单文件 deck HTML（1 主题 + 核心布局 + 导航）
- **M2** Markdown→IR 解析 + CLI(`new/build/validate`)
- **M3** 讲稿生成 + 演讲者模式（单一锚点 + `postMessage` 同步）
- **M4** 多主题（移植 editorial/academic/keynote-dark）+ 动画运行时 + 导出 PDF/PNG
- **M5** 实时预览 + 内联快编（v1 编辑面）
- **v2+** 全 WYSIWYG、PPTX 导出、更多主题/动画、PPT 导入、QA 增强
