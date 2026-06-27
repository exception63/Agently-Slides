# 借鉴 html-ppt-skill：增强 Slidesmith（调研 + 优先级方案）

> 日期：2026-06-26 · 参考项目：`/Users/zhouliying/同步空间/Claude Projects/SlidesHTML/html-ppt-skill`
> 用户："模板、动画、换皮、showcase 都做得超好，借鉴过来增强我们项目。"
> 方法：3 路并行 read-only 编目（themes / animations+canvas-FX / showcases+runtime+layouts）。
> 约束：单文件 · 离线 · 1920×1080 契约 · AI-first · 已有 9 类 CSS 动画库 + 所见即所得画廊 + Studio 子窗口选择器 + 7 皮。

---

## 0. 一句话结论（优先级）

> **P0 先做「Canvas 特效层」** —— 这是它最牛、我们最缺、且最契合刚建好的动画库的一块：20 个**零依赖、读主题色、生命周期托管**的 canvas 模块（极光团/星座网/知识图谱/神经网络/数字爆炸/粒子/矩阵雨…），内联后仅 ~20KB。把它做成动画库**第 10 类「J · Canvas 特效」**，进画廊 + 注册表 + Studio 选择器。这是"高端炫酷"的真正大招。
> 之后按序：**P1 多换皮**（移植 ~13 个新主题调色板，token 几乎直接兼容）· **P2 showcase 三件套**（主题/版式/动画的所见即所得，借它的 iframe 隔离 + copy-chip + 缩略图）· **P3 概览网格 O 键**（缩出全 deck 缩略图，点击跳页）· **P4 版式库**（~10 个版式：KPI/对比/时间线/甘特/路线图/架构图/思维导图…）。

---

## 1. 它的架构（看懂才能借）

- **token 主题系统**：`base.css`(150 行) = 默认 `:root` token 词表 + 共享组件层（`.slide/.card/.h1/.kicker/.lede/.pill/.divider`…）；每个主题 = 一个 600–1350 字节的 `:root` 覆盖 + 偶尔几行组件微调。换皮 = 换一个 `<link>`。**36 个主题**因此都很小。
- **动画系统两层**：① `animations.css`(8KB) = CSS keyframes（和我们的大量重合）；② **`fx/*.js` = 20 个 canvas 特效模块** + `_util.js`(canvas/loop/palette 助手) + `fx-runtime.js`(自动加载 + `[data-fx]` + MutationObserver 生命周期)。**全零依赖、纯 canvas2D**。
- **runtime.js**(960 行)：导航 + 进度 + **概览网格 O 键**（DOM 克隆缩放，非截图）+ **演讲者弹窗 S 键**（4 张磁吸卡 + `?preview=N` 像素级 iframe 预览 + BroadcastChannel 同步）+ 主题轮换 T 键 + count-up。
- **31 个版式**(`templates/single-page/`)：统一 markup，28 个纯 CSS（4 个图表需 Chart.js CDN、code 需 highlight.js）。
- **showcase 四件套**：主题（每主题一个 iframe srcdoc 隔离渲染**同一份 demo**）/ 版式（浮动 pill 导航 + 单 iframe 切 src）/ 动画（每效果一卡 + `data-fx` chip + Replay 钮）/ 全 deck 索引（`scale(.5)` 实时 iframe 缩略，非 PNG）。

---

## 2. P0 · Canvas 特效层（先做这个）

**为什么**：我们的动画库刻意只做了 CSS（入场/强调/持续/转场/神奇移动/点睛/背景），**没有真正的粒子/canvas 大招**——而那正是"炫酷"的天花板。它的 20 个模块零依赖、读我们的 `--accent` 主题色、生命周期托管（翻到该页才跑、离开就 `stop()`），**完美契合单文件契约**。

**移植清单（按价值，先 12 个）**：
- **氛围背景（满屏铺在文字后）**：`gradient-blob`⭐(加性模糊渐变=Stripe/Linear 高级感) · `constellation`⭐(星座连线) · `starfield`/`galaxy-swirl`(星空/星系，暗底) · `magnetic-field`(磁力流线) · `matrix-rain`/`data-stream`(黑客/数据风)
- **数据感面板（局部，不满屏）**：`knowledge-graph`⭐(力导向带标签，RAG/图谱神器) · `neural-net`⭐(前馈网+脉冲传播) · `orbit-ring`(轨道) · `chain-react`(链式脉冲)
- **一次性爆点**：`counter-explosion`⭐(数字滚动+粒子爆，KPI 揭晓) · `particle-burst` · `shockwave` · `confetti-cannon`/`firework`(仅结尾庆祝)
- **文字特效**：`typewriter-multi`(多行终端打字) · `letter-explode`(标题字爆入)

**移植做法**：① 把 `_util.js`+20 模块拼成一个 `_fx-canvas.js`（去掉动态 `<script>` 注入，全 `window.HPX` 注册）；② 给引擎加 `[data-fx]` 生命周期（翻到该页 init、离开 stop，复用我们 present 态钩子）；③ build.py 内联；④ **修**：写死的紫色 glow / matrix 绿 → 读 `--accent`；假设暗底的 motion-blur → 读主题底色，免得浅皮拖影。
**接进 AI-first**：`[data-fx="gradient-blob"]` 成为新编号（J 类），进 `gallery/animations.html`（满屏 canvas 卡 + Replay）+ `references/animations.md` + Studio 子窗口选择器（picker 落 `data-fx`）。

---

## 3. P1 · 多换皮（token 几乎直接兼容）

它的 token 词表 = 我们的近似超集（`--bg/-soft --surface/-2 --border/-strong --text-1/2/3 --accent/-2/-3 --good/warn/bad --grad/-soft --radius* --shadow* --font-*`）。**~24 个主题是纯 token，可近乎粘贴**。
**最值得移植的 ~13 个新气质**（不与现有 7 皮重复）：dracula · nord · catppuccin-mocha/latte · tokyo-night · vaporwave · swiss-grid(12 栏网格底) · bauhaus · memphis-pop(波点底) · glassmorphism · cyberpunk-neon · y2k-chrome(液态铬标题) · neo-brutalism（+ terminal-green/gruvbox/rose-pine/solarized 近免费）。
**坑**：① 它的主题读它的组件类（`.card/.h1/.slide`），与我们 editorial-slides 契约类（`.cover/.secdiv/.head/.cards`）不同 → 要么映射 token 进我们皮、要么把它的 token+base 组件层作为**新的一套轻量皮家族**引入（决策点）；② 字体要嵌入（Archivo Black/Oswald/Space Grotesk/Playfair…）才离线；③ 5 个 backdrop-filter 主题(glass/aurora/cyberpunk/vaporwave/y2k)导出 PDF 要验证；clip-text 标题(vaporwave/y2k)要给兜底色。

---

## 4. P2 · Showcase 三件套（它最"牛"的呈现）

它"牛"在：**全是活的真东西**（iframe 隔离的主题、缩放的活 deck、运行的 canvas），从不截图；每卡都给**可复制的代码**（`data-fx=` / 主题文件名 / `:root` 片段）；暗色工作室 chrome 显专业。
**借鉴**：① 主题 showcase = 每皮一个 iframe 渲染**同一份 demo 内容**（只比 token，最有说服力）+ 调色板色块行；② 版式 showcase = 浮动 pill 导航 + 单 iframe 切；③ 全 deck 索引 = `scale(.5)` 实时 iframe 缩略。我们的动画画廊已经有 copy-chip + Replay（已对齐它的好做法）——再补**主题 showcase** + **版式 showcase** 即成三件套。

---

## 5. P3 · 概览网格（O 键）· P4 · 版式库

- **P3 概览网格**：克隆每页 → 强制 active → 1920×1080 量好再 `scale` → 16:9 缩略网格，点击 `go(i)` 跳页。这就是我们想要的"缩出全 deck"（impress 风的受控版）。接进 editorial-slides 引擎 + Studio。
- **P4 版式库**：补 ~10 个纯 CSS 版式进组件库：`kpi-grid`(指标卡+count-up) · `comparison`(VS 对比) · `timeline` · `gantt` · `roadmap`(NOW/NEXT/LATER) · `arch-diagram` · `mindmap`(SVG) · `stat-highlight` · `diff` · `terminal`。图表(Chart.js)因离线单文件**暂缓**（要内联库或预渲染）。
- **不取**：演讲者双屏深做（我们已决定交给别的 skill）· Chart.js/highlight.js CDN 依赖（破单文件离线）· sparkle-trail(要鼠标) · word-cascade(噱头)。

---

## 6. 建造顺序建议
P0 Canvas 特效（先，最大 wow，扩动画库）→ P2 主题+版式 showcase（顺手，呈现增值）→ P1 多换皮（批量，要决策皮家族）→ P3 概览网格 → P4 版式库。
每步：声明式属性/类 → build → playwright 验证 + 截图 → 沉淀进 `references/animations.md`/`design-system.md`。

## Sources
参考项目本地路径见上；关键文件：`assets/base.css` · `assets/themes/*.css`(36) · `assets/animations/{animations.css,fx-runtime.js,fx/*.js}` · `assets/runtime.js` · `templates/{*-showcase.html,single-page/*.html}` · `references/{themes,animations,layouts}.md`。
