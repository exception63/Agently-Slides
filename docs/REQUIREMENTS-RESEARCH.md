# Slidesmith — 需求调研报告 (Requirements Research)

> 版本: 1.0 · 日期: 2026-06-24 · 状态: 已完成，作为 PRD 的依据
> 调研方法: 3 路并行调研 — (A) 本地 6 个收藏项目逆向分析；(B) 现有 3 个 skill 引擎拆解；(C) 外部 2025–2026 最佳实践综述（reveal.js / Slidev / Marp / 动画库 / 演讲者同步 / CJK 排版 / 可视化编辑器）。

---

## 1. 背景与问题陈述

### 1.1 现状
用户已有一套成熟的 HTML slides 制作 skill 体系：
- **`editorial-slides`** — 出版物级 HTML 演示，多风格皮肤（editorial / academic / keynote-dark + 移植皮）。
- **`transcripts_html`** — 杂志级 HTML 逐字稿/备课稿，与 slides 同一视觉语言。
- **`slides-presenter-mode`** — 演讲者模式：主屏翻页，副屏（iPad）自动同步当前 slide 的讲稿，支持双向联动与关键词提词。

### 1.2 核心痛点
现有 skill 只能产出**"烘焙死"的静态 HTML**（baked static HTML）：
1. **内容与表现耦合** — 正文、布局、CSS token、引擎 JS 全部内联进一个 HTML 大文件，无独立数据层。
2. **生成后不可再编辑** — 人类用户想改风格/排版/动画/内容，必须回到 AI 重新沟通，AI 修改 HTML 很慢、易错。
3. **三套锚点手工同步** — slides 的 `SLIDE_MAP`、讲稿的 `id`、演讲者视图的 `SLIDE_MAP_LOCAL` 三处必须人工保持一致，插入/重排一页就容易错位、断同步。

### 1.3 目标（一句话）
打造一个 **AI-first、人类可后期编辑** 的 HTML slides 制作与演示系统：AI agent 通过 CLI/JSON 高效生成（含同步逐字稿 + 双屏演讲者模式），人类用户随后能可视化/源码方式修改并保存，**无需再回到 AI**。

---

## 2. 调研发现 A — 现有 3 个 skill（保留什么 / 重构什么）

### 2.1 值得保留的"DNA"（已被验证、要继承）
| DNA | 说明 |
|---|---|
| 单文件可移植、离线、CDN 可选 | 产出一个 `.html` 即可投屏，无依赖 |
| 固定 1920×1080 画布 + 投屏缩放 | `scale = min(vw/1920, vh/1080)` 全屏适配 |
| 段(segment)结构导航 | `data-seg` → 左侧段导航 + 实时缩略图 + 进度条 |
| 设计 token 系统 | `:root` 定义 `--paper/--ink/--accent/--gold...`，皮肤即一组 token + 统一 class 契约 |
| **三锚点协议** | `SLIDE_MAP[i]` ↔ 讲稿 `id="sN-M"` ↔ 演讲者 `SLIDE_MAP_LOCAL` 一一对齐 |
| 双向演讲者同步 | BroadcastChannel + localStorage + postMessage 三通道；`source` 字段防回声循环 |
| 整块讲稿高亮 + 关键词提词 | `nextElementSibling` 遍历到下一锚点；`box-shadow` 画外侧金条不占布局；`body.cue-on` 时高亮激活块内 `<strong>` |

### 2.2 必须重构的根因（导致"不可再编辑"）
1. 单文件单体，无 build 过程可独立重生成局部。
2. 内容内联在语义 HTML 中，底层没有纯文本/数据层。
3. 三套锚点系统靠人工同步。
4. 没有"演示即数据"的 schema —— 每次产出都是终态产物，而非可编译视图。
5. CSS 变量烘焙进 `:root`，改主题要进 `<style>` 块里改。

### 2.3 关键结论
> **现有 skill 的视觉与引擎是对的，架构是错的。** 解法不是推倒重来，而是**在它们底下补一层"演示即数据"的 IR（中间表示）**，把内容/主题/布局/动画解耦，让 "AI 生成 ↔ 人类可视化编辑" 成为一等公民。

---

## 3. 调研发现 B — 本地 6 个收藏项目（不要重复造轮子）

| 项目 | 渲染模型 | 运行时换主题 | 数据可重渲染 | 演讲者模式 | 可借鉴的核心资产 |
|---|---|---|---|---|---|
| beautiful-html-templates | 烘焙静态 | ❌ | ❌ | ❌ | `runtime/deck-stage.js`（零依赖导航 web component）；34 个视觉样板；`index.json` 选型元数据 |
| frontend-slides | 烘焙静态 | ❌ | ❌ | ❌ | 视觉"先预览后选择"工作流；PPTX 导入；PDF/部署脚本；`viewport-base.css` |
| guizang-ppt-skill | 烘焙静态(布局驱动) | ❌ | ❌ | ❌ | **22 个锁定布局**（layout 语义）；Motion One 入场动画；`validate-swiss-deck.mjs` 产物校验器；主题约束哲学 |
| **html-ppt-skill** | 烘焙静态 | ✅(`T` 键切 36 主题) | ❌ | ✅(讲者卡片 4 件套 + 备注) | **最成熟**：token 主题系统 `base.css`；36 主题纯 token 文件；31 布局样板；27 CSS 动画 + 20 Canvas FX + `fx-runtime.js`；`runtime.js` 键盘体系；presenter-mode 文档 |
| **huashu-design** | **数据驱动可重渲染** | ⚠️(Tweaks 面板) | ✅(组件+token 重生成) | ❌ | **唯一数据驱动范式**；Tweaks 运行时调参面板；`html2pptx.js` 可编辑 PPTX 导出；品牌资产协议；防 AI-slop 风格库；MP4/GIF 动效导出 |
| humanize-ppt | 编排器(非渲染) | N/A | 取决下游 | N/A | **大纲(AST)+ QA 循环** 编排思想；`qa-failure-modes.md` 产物检测规则；与渲染解耦的 brief 中间层 |

### 3.1 借鉴优先级
1. **html-ppt-skill** — token 主题系统、布局样板库、动画库、演讲者模式的**实现细节**全可移植。
2. **huashu-design** — "数据驱动 + 运行时调参 + 可编辑导出"的**范式**正是我们要的方向。
3. **guizang + humanize** — **产物校验器**（保证 AI 输出质量）+ **QA 循环 / 大纲编排**思想。
4. **beautiful-html-templates / frontend-slides** — 视觉多样性样板 + "先预览后选" 的 UX，防止 AI 千篇一律。

---

## 4. 调研发现 C — 外部最佳实践（2025–2026）

### 4.1 框架结论：不直接采用任何一个，做"薄引擎 + 自有 IR"
| 框架 | 源格式 | AI 友好 | 人类可视化再编辑 | 单文件离线 | CJK | 否决理由 |
|---|---|---|---|---|---|---|
| reveal.js | HTML/MD | 中 | 中 | 需手动打包资产 | 中 | HTML 作源对 LLM 与重新换肤都太纠缠 |
| Slidev | MD+Vue | 高 | 中 | ❌ SPA 构建 | **最佳** | JS-SPA 产物 + 静态构建丢失演讲者同步，违背"可移植单文件" |
| Marp | 纯 MD | **最高** | 高 | **最佳** | 中 | 布局仅 CSS class（无 slot 插槽）、动画太弱 |
| Spectacle | JSX | 低 | 低 | 打包 | 中 | slides 即代码，不适合 AI 文本生成 |

> **结论（被三方交叉验证）**：你的五项约束（AI 可生成 + 人类可视化再编辑 + 可移植单文件离线 + CJK 优先 + 双屏讲稿同步）没有任何单一工具同时满足；但每个子问题都有"已解决可复制"的成熟机制。**正解 = 自有 JSON IR + 薄引擎渲染 + 借用成熟机制。** 这也正是你现有 skill 已经走的方向，缺的只是把 IR 正式化。

### 4.2 内容/表现分离范式（IR 设计依据）
所有先例收敛到同一结构：**内容 = 一串带稳定 id 的「类型化块」；表现（主题/布局/动画）= 用符号 token 引用的、可替换的独立产物，绝不内联。**
- reveal.js 的 `data-auto-animate` + `data-id`：把两页当作两个状态 → 自动 FLIP 形变（Keynote 式 magic move）。
- Slidev 的 `SlideInfo` 类型记录 + 具名 layout + `::slot::`：最干净的"内容/布局契约"。
- Google Slides / OOXML：**符号化主题 token**（`accent`/`heading`）+ "不设值即继承"。换肤 = 重映射 token。
- Pandoc AST / nbformat：把"作者写的 source" 与"渲染出的 output"分开存。

### 4.3 动画（2025 重大变化）
- **GSAP 自 v3.13（2025-05）起全部免费**（含 SplitText/MorphSVG/Flip/ScrollTrigger）。最强时间轴 + 形变。
- **View Transitions API 同文档版 2025-10 进入 Baseline**（Chrome/Edge/Safari/FF 144）：**零依赖**的页间形变，最适合 slide-to-slide morph。
- **Motion (motion.dev)** ~2.3KB MIT：若要全 MIT 依赖可替代 GSAP。
- 推荐：**页内 build/reveal 用 GSAP 时间轴；页间 morph 用 View Transitions**。AI 只发声明式 `data-anim/data-anim-delay/data-anim-stagger`（AOS 式约定），~50 行运行时读属性建时间轴。

### 4.4 演讲者模式 / 双屏同步（最重要的技术发现）
> **单文件离线（`file://`）跨两块物理屏，唯一可靠的同步机制是 `window.open()` + 通过 opener/child 窗口引用 `postMessage`** —— 即 reveal.js speaker view 的做法（握手 connect→connected，每次翻页发 state，~1s 心跳保活）。
- **`file://` 是 opaque/null origin → BroadcastChannel 与 localStorage storage 事件通常跨两个独立打开的文件失效**。它们只能作为 http(s) 下的增强/状态恢复，**不能当主通道**。
- ⚠️ 这与现有 skill 主要依赖 BroadcastChannel 的做法**有冲突**，是 v1 必须修正的点：主通道改 `window.open()`+`postMessage`+心跳，BroadcastChannel/localStorage 降级为 http 下增强。
- 第二屏自动落位用 Window Management API（`getScreenDetails()` + `requestFullscreen({screen})`），仅 Chrome/Edge，需特性检测 + 手动回退。
- 讲稿同步：每段讲稿用 `data-slide` 锚定到页（+ 可选 fragment）；收到 state 就滚动到对应段并整块高亮；可选 WPM 自动滚动 / Web Speech API 词级跟读（提词器模式）。

### 4.5 主题 / 设计 token + CJK
- **W3C 设计 token (DTCG) 2025.10 出首个稳定版**：JSON，`$value/$type`，`{group.token}` 别名，`$extends` 做主题变体。配 Style Dictionary v4 → 产 `:root{--…}`。
- **CJK 字体（10MB 问题）**：一套 slides 文本有限 → **子集化 + 内联真正的显示字体**（标题字数少，几十 KB WOFF2 可 base64 内联）；正文用**系统字体栈零下载**。工具：cn-font-split / fontmin / pyftsubset。开源字体（SIL OFL，可嵌入再分发）：思源黑/宋体 = Noto Sans/Serif CJK SC；霞鹜文楷(LXGW WenKai) 文艺感。
- **2025–2026 原生 CSS**：`text-autospace`（中西文/数字自动间距）、`text-spacing-trim`（CJK 标点挤压）；CJK 行高 ~1.6–1.8。
- 杂志/editorial CJK 配色：宋体标题 + 黑体正文 + 巨大数字做图形 + 单一朱红点睛(~`#C8102E`) + 暖纸底(~`#F7F3EC`) + 近黑墨 —— 正是现有 `editorial` 皮，权威可靠的默认。

### 4.6 可视化编辑器（诚实的现实）
- **真·WYSIWYG 且无损回写 Markdown 的开源工具不存在**；可往返的可视化编辑只在源是 **JSON 或 HTML** 时成立 → **这印证了"JSON IR 作 canonical"的决策**。
- 可在其上构建的块编辑库：**Editor.js**（Apache-2.0，扁平 `blocks[]` JSON ≈ 我们的块数组，映射最干净）；**TipTap / Lexical**（MIT，schema 强校验，可校验 AI 生成的源，最稳）。避开 Slate（CJK/IME 脆）与裸 ProseMirror。
- 参考架构（不直接采用）：Parallax(revealjs_gui)、OpenSlides、Oh My PPT。

---

## 5. 由调研推导的需求清单

### 5.1 功能需求 (Functional)
- **FR-1 数据层(IR)**: 存在一个 JSON IR 作为"演示即数据"的 canonical；可校验、可版本化、带稳定块 id。
- **FR-2 双源输入**: AI/人类既可写 Markdown+frontmatter（人体工学）也可直接产 JSON IR；Markdown 编译进 IR。
- **FR-3 渲染**: IR + 主题 → 单文件可移植离线 HTML（内联 CSS + 子集内联 CJK 字体 + 动画运行时）。
- **FR-4 主题解耦**: 主题 = 独立 token + 布局 + 动画默认；可换肤、可运行时切换；继承现有皮 + html-ppt 主题。
- **FR-5 布局系统**: 具名 layout（带 slot 插槽契约），覆盖封面/目录/段封面/要点/两栏/数据/图文/引言/对比等常用页型。
- **FR-6 动画**: 声明式 `data-anim*`；页内 GSAP 时间轴 + 页间 View Transitions。
- **FR-7 讲稿同步**: 从 IR 的 `notes` 字段生成同步逐字稿；锚点**单一来源自动派生**（彻底消除三处手工同步）。
- **FR-8 演讲者模式**: 双屏；主通道 `window.open()`+`postMessage`+心跳；整块高亮 + 关键词提词 + 双向联动。
- **FR-9 CLI / Agent 接口**: `build/new/validate/export`；支持 stdin/stdout JSON 管道，便于 agent 调用。
- **FR-10 人类编辑**: v1 实时预览 + 源码/内联快速编辑（点选改文字、面板换主题/布局/动画）；v2 起做更强可视化。
- **FR-11 导出**: PDF / PNG（Playwright headless）；可选可编辑 PPTX（借鉴 huashu `html2pptx`）。
- **FR-12 产物校验**: lint IR 与渲染产物（缺图/溢出/锚点不齐/对比度），借鉴 guizang/humanize QA。

### 5.2 非功能需求 (Non-Functional)
- **NFR-1 可移植/离线**: 产物默认单 `.html`，`file://` 直接可投屏，无需网络。
- **NFR-2 CJK 优先**: 中文排版正确（字体子集内联、`text-autospace`、行高、标点挤压）。
- **NFR-3 AI 高效**: AI 生成一套 deck 的 token/时延显著低于现状（写结构化短文本 vs 写整页 HTML）。
- **NFR-4 可再编辑**: 任何产物都能从 IR 重新生成；人类编辑回写 IR 无损往返。
- **NFR-5 许可证干净**: 依赖与内嵌字体可商用再分发（GSAP No-Charge / MIT / SIL OFL）。
- **NFR-6 可维护**: 单一 token/锚点来源；引擎、主题、内容三者独立演进。
- **NFR-7 兼容降级**: 高级特性（View Transitions / Window Management）特性检测 + 回退。

### 5.3 硬约束
- 单文件离线场景下**演讲者同步不能依赖 BroadcastChannel/localStorage 作主通道**（见 4.4）。
- **不把 Markdown 作 canonical**（可视化编辑无法无损回写 MD）→ Markdown 仅作 authoring/import/export，**JSON IR 才是源**。
- **不内嵌整套 CJK 字体（5–15MB）/ 不依赖 CDN**（毁掉离线与可移植）。
- AI 只发"内容 + 符号化 style token"，**绝不内联 CSS/hex/框架代码**，否则内容/表现分离崩塌。

---

## 6. 已锁定的关键决策（2026-06-24，与用户确认）
| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 源格式 | **Hybrid：Markdown authoring → JSON IR canonical** | 兼顾 AI/人类书写便利与可视化编辑的无损往返 |
| D2 | 技术栈 | **Node.js + TypeScript**（引擎/CLI/编辑器同语言） | Web 原生、npm 分发、浏览器运行时与编辑器同栈 |
| D3 | v1 人类编辑面 | **实时预览 + 内联快速编辑**（换主题/布局/动画面板 + 点选改文字） | 覆盖 ~80% 后编辑需求，快速可用；全 WYSIWYG 留后续里程碑 |
| D4 | v1 重心 | **AI→产物 流水线优先** | 先把 schema+引擎+主题+CLI 端到端打通，给格式去风险；编辑器快速跟进 |

---

## 7. 借鉴清单（直接复用 / 移植）
- `html-ppt-skill/assets/base.css` 的 token 体系；其布局样板与动画库（27 CSS + 20 Canvas FX）。
- `beautiful-html-templates/runtime/deck-stage.js`（导航缩放参考）；`index.json` 选型元数据。
- `guizang/scripts/validate-swiss-deck.mjs` 产物校验范式；`references/layouts-swiss.md` 布局语义。
- `huashu-design` 的 Tweaks 调参面板范式、`html2pptx.js` 可编辑导出、品牌协议、防 AI-slop 风格库。
- `humanize-ppt/references/qa-failure-modes.md` 产物失败模式检测规则。
- 现有 `editorial-slides` 皮（editorial/academic/keynote-dark）整套 token 与 class 契约，作为首批内置主题。
- reveal.js：`data-auto-animate`/`data-id` 形变模型 + speaker view 的 `postMessage`+心跳同步。

## 8. 要避开的坑
1. Markdown 当 canonical（可视化编辑回写不无损）。
2. 演讲者同步靠 BroadcastChannel/localStorage（`file://` 失效）。
3. 内嵌整套 CJK 字体 / 依赖 CDN（毁离线）。
4. 让 AI 输出内联 CSS/hex/框架代码（破坏分离）。
5. 主题/布局/动画 surface 过大无好默认（html-ppt 的教训：36×31×47 让 agent 难选）→ 必须有强默认 + 渐进暴露。
