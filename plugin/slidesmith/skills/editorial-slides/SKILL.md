---
name: editorial-slides
description: |
  做"出版物级"的 HTML 演示 slides · 中文 · 多风格可选（每次调用先挑一种皮肤 skin）。
  原生风格：① editorial 杂志风（纸色 + 朱红 + 宋体大字 + 大数字冲击，抓眼）；② academic 学术汇报风（社科/人文 · 深靛青 + 衬线 + 概念模型图 + 规范参考文献，专业克制）；③ keynote-dark 暗场主旨风（近黑底 + 巨大白字 + 琥珀点睛，大场子/发布会感）。
  另有从「风格银行」(beautiful-html-templates) 移植的皮：cartesian 极简 / signal 机构正式 / vellum 暗色文艺学术 / daisy-days 温暖活泼；还可按需现移植更多（见 references/external-templates.md）。
  所有风格共用同一引擎：单文件、可移植、离线可用；固定 1920×1080 画布；自带全屏投屏、左侧段导航 + 实时缩略图、进度条、键盘控制、演讲者双屏钩子。
  还自带「动画库」：A 入场 / B 分步揭示 / C 强调 / D 持续动效 / E 跨页转场 / F 神奇移动(Magic Move) / G 消失 / H 点睛 / I 背景氛围 共九类、带编号、所见即所得预览（gallery/animations.html）；用户可按编号点名要某个动画/转场（"入场用 A8、大数字 F1 神奇移动、转场 E2"），见 references/animations.md。也在用户说"给 slides 加动画 / 加转场 / 加动效 / 神奇移动 / 分步出现 / Magic Move / 让某页动起来"时启用。
  当用户说 "做 slides / 做 PPT / 做演示 / 做讲演幻灯 / 学术 slides / 学术汇报 slides / 会议汇报 PPT / 杂志风 slides / keynote / 漂亮的 slides / 把讲稿做成 slides / 做 HTML slides / 换个风格的 slides" 时启用，即使没点名某个风格也要启用并先让用户挑风格。
  这个 skill 负责"从内容生成成品 slides"；若用户是"slides 已经有了、想加副屏讲稿同步"，那是 slides-presenter-mode skill。
metadata:
  version: 1.5.0
  status: dogfood-validated
  skins: [editorial, academic, keynote-dark, cartesian, signal, vellum, daisy-days, dracula, nord, tokyo-night, catppuccin-mocha, catppuccin-latte, vaporwave, swiss-grid, bauhaus, cyberpunk-neon, glassmorphism, y2k-chrome, neo-brutalism, terminal-green, rose-pine]
  skins_note: 7 原生厚皮 + 14 薄皮（令牌 + 共享 _components.css）· 换皮展厅 gallery/theme-showcase.html
  animations: 10 类编号库（入场/分步/强调/持续/转场/神奇移动/消失/点睛/背景/Canvas特效）· 所见即所得画廊 gallery/animations.html · 见 references/animations.md
  layouts: kpi-grid/vs/timeline/gantt/roadmap/diff/mindmap + cover/secdiv/cards/compare/steps/table/bignum… · 版式展厅 gallery/layout-showcase.html
  engine: 段导航 + 缩略图 + 进度 + 投屏 + 概览网格(O 键) + 演讲者钩子 + 动画引擎(_fx/_fx-canvas)
  dogfood: 7 张皮 gallery 全部浏览器 present 态截图核版（2026-06-04）· 后 4 张移植自 beautiful-html-templates (MIT)
  pairs_with: [transcripts_html, slides-presenter-mode]
---

# editorial-slides · 多风格 HTML 演示

> 一句话：**用纯 HTML 做出"出版物级"的演示**——单文件、投屏即用、演讲者模式就绪，而且**每次可选不同风格（skin）**。
> 架构：一套**共用引擎**（导航/缩略图/投屏/副屏）+ **可换的皮肤**（每个风格 = 一份 CSS）。源是模块化的（联邦、不堆巨型文件），输出是单文件。

---

## 何时用 / 不用

**用**：要做一套中文演示 slides（讲座 / 主旨演讲 / 课程 / **学术汇报** / 答辩 / 路演），希望它**既专业又好看**，并且是可移植、可版本控制的 HTML（不是 PPT 软件）。

**不用**：
- 只是要一张海报 / 单图 → 用 canvas-design / design。
- slides 已存在、只想加副屏讲稿同步 → 用 **slides-presenter-mode**。
- 要的是配套**讲稿 / 备课稿**（不是 slides）→ 用 **transcripts_html**（同套视觉、锚点天然对齐）。
- 网页/落地页（非翻页演示）→ 用 frontend-design。

---

## Step 0 ·〔必做〕先选风格（skin）

**每次都先确认用哪个风格再动手。** 读 `references/styles.md`（风格画廊），把可选风格的"一句话 DNA + 用在哪 + 预览路径"摆给用户挑：

**原生皮（3 · 基建最全，含演讲者双屏）**
| skin | 明/暗 | 一句话 | 适合 |
|---|---|---|---|
| **editorial** 杂志风 | 浅 | 纸色 + 朱红 + 宋体大字 + 大数字冲击，抓眼 | keynote / 课程 / 路演 |
| **academic** 学术汇报 | 浅 | 深靛青 + 衬线 + 概念模型图 + 编号图表 + 规范参考文献（社科/人文） | 学术会议 / 组会 / 答辩 |
| **keynote-dark** 暗场主旨 | 深 | 近黑底 + 巨大白字 + 琥珀点睛 + 少字多势 | 大场子主旨 / 发布会感 |

**移植自风格银行（4 · beautiful-html-templates，MIT）**
| skin | 明/暗 | 一句话 | 适合 |
|---|---|---|---|
| **cartesian** 极简 | 浅 | 暖灰极简 + 衬线 + 发丝线网格，强调靠字重不靠色 | 设计/研究/品牌随笔 |
| **signal** 机构 | 浅 | 浅米 + 藏青 + 古金 · 衬线 · 高密度 + booktabs | 政策/年报/智库/政企汇报 |
| **vellum** 暗色学术 | 深 | 深靛蓝 + 羊皮金 Cormorant 衬线，文艺学术 | 人文/思想史/文学讲座 |
| **daisy-days** 活泼 | 浅 | 奶油 + 粉蜡笔 + 圆角贴纸卡 + coral 点睛 | 课堂/工作坊/亲子科普 |

**移植自 html-ppt-skill（14 · 薄皮 = 令牌块 + 共享组件 `_components.css`，MIT 调色）**
dracula · nord · tokyo-night · catppuccin-mocha/latte · vaporwave · swiss-grid · bauhaus · cyberpunk-neon · glassmorphism · y2k-chrome · neo-brutalism · terminal-green · rose-pine。
暗场流行色（Dracula/Nord/东京夜/Catppuccin/Rosé Pine）、AESTHETIC（蒸汽波/Y2K铬/赛博朋克）、设计流派（瑞士网格/包豪斯/新野兽派/玻璃拟态/终端绿）。这 14 张是**薄皮**：只写一组 `:root` 令牌（+ 签名微调），版式组件来自 `_components.css`（声明 `/* uses-base */`，build.py 自动内联）。

> **眼见为实挑皮 → 打开 `gallery/theme-showcase.html`（21 张皮活封面网格，点击开全屏）。** 单皮样板 `gallery/skins/<skin>.html` 或原生皮 `gallery/<skin>.html`。想要别的气质 → 风格银行 `references/external-templates.md`，或加薄皮（见 `references/design-system.md`）。

- 用户**点名了**（"做学术风 / 用杂志风"）→ 直接用那个。
- 用户**没点名** → 先把上表给他挑；他偏向哪种场合（学术汇报 vs. 主旨抓眼）就选哪个。
- 想先**眼见为实** → 让用户打开对应 `gallery/<skin>.html` 看样板（每个都带成套 demo slides）。
- 选定的 skin 决定字体、配色、版式气质；**组件 class 契约（`.cover/.secdiv/.head/.cards/.table/.figure`…）所有皮通用**，所以写法一样、外观不同。

> 想加一个新风格？见 `references/design-system.md` 的"加一个皮肤"——写一份 `assets/skins/<名>.css` 即可，引擎不用动。

---

## Step 0.5 ·〔可选〕动画 / 动效 / 转场（编号库）

所有皮共用一套**动画库**（集众家所长 · `assets/_fx.css`+`_fx.js`，build.py 自动内联）。9 类：
**A 入场 · B 分步揭示 · C 强调 · D 持续动效 · E 跨页转场 · F 神奇移动 · G 消失 · H 点睛 · I 背景氛围**。

- 用户**眼见为实**挑：让他打开 `gallery/animations.html`（所见即所得画廊，每效果带编号 + 实时预览 + 重播）。
- 用户**按编号点名**（"封面 A8、要点 A6、大数字 F1 神奇移动、转场 E2"）→ 你查 **`references/animations.md`** 落属性：
  入场 `data-anim` · 强调 `data-emph` · 持续 `data-motion` · 消失 `data-anim-out` · 分步 `class="fragment …"` · 转场 `data-transition`（body 或单页）· 神奇移动 两页同元素同 `data-morph`。
- 用户**没点名** → 别堆动画。默认克制：封面一个入场 + deck 级 `data-transition="fade"` 足矣；要点列表 `stagger-list`；想强调某页大数字才上 `F` 神奇移动。
- ⛔ **声明式，别写死**内联 `animation`/keyframes；放映按 `B` 全关、尊重"减少动态"。动画是点睛，不是主角——一页最多一两处。

> 详见 `references/animations.md`（编号→属性映射）。新效果会随使用沉淀进库（`_fx.css` + 重跑 `build-anim-gallery.py`）。

---

## 工作流（选好风格之后）

### Step 1 · 先要一份"内容骨架"
确认：标题/讲者/场合；分几段（segment，从 0 起）；每段几张、每张讲一件什么事。
没有骨架就先列一个 slide 清单（`段号 | 版式 | 一句话内容 | 引用`），再动手。**不要一边想结构一边糊 HTML**。

### Step 2 · 起一个空 deck（选好的 skin）
两条路，任选：
- **装配器（推荐）**：`python3 assets/build.py <skin> <目标>/slides.html --blank --title "讲题" --brand "机构" --channel "唯一频道名"`
  → 生成该皮肤的空白 deck（引擎 + CSS 已内联，单文件）。`{{CHANNEL}}` 取唯一名（接 presenter 要用同一个）。
- **复制样板**：`cp gallery/<skin>.html <目标>/slides.html`，删掉里面的 demo slides，填 topbar 的机构/副标，改 `CONFIG.channel`。

### Step 3 · 写 slides
在 `#deck` 里按骨架一张张写 `<section class="slide …">`。
- 每张带 `data-seg` / `data-segname`（同段相同）；版式 class 照抄 `references/components.md`。
- **段导航、缩略图、页码、副屏标题全自动生成**——不用手写。
- 引用：数据/论断旁挂 `<span class="cite">[作者 年份]</span>`；末尾另起"参考文献"页。
- **学术皮**额外读 `references/skins/academic.md`：概念模型图 `.figure`、booktabs 表格 `.table` + `.table-cap`、论点清单 `.bullets`、参考文献 `.refs`，以及"全宋体期刊感""换主色"开关。
- 量大时用 `references/build-recipe.md` 的 Python 一次性注入（别逐张 Edit）。

### Step 4 · 本地预览校对（红线）
起本地服务（`python3 -m http.server`）在浏览器看；逐页检查：
- [ ] 没有内容溢出 1920×1080 版心（超出会裁 → 拆页或缩字）
- [ ] 每段有 secdiv 开场；强调克制（editorial：朱红 `<em>` ≤2/页；academic：斜体术语 + 深靛青 strong）
- [ ] 引用都挂上了；末页有参考文献
- [ ] 全屏（F）/ 段导航 / 缩略图 / 键盘 ←→ 都正常
> 用 playwright/浏览器截几张图自检版面，值得（见 build-recipe）。

### Step 5 ·（可选）配讲稿 + 接演讲者双屏
- 配套**讲稿 / 备课稿** → 用 **transcripts_html**（抄本 deck 的 `window.SLIDE_MAP` 当锚点，1:1 对齐）。
- 现场副屏同步 → 见 `references/presenter-integration.md` + **slides-presenter-mode**。模板钩子已就绪。
> 三件套流水线：editorial-slides（slides）→ transcripts_html（讲稿）→ slides-presenter-mode（双屏）。

---

## 约定与红线

- ⛔ **一页一件事**。塞满 = 失败。撑不下就拆页（演讲者模式会映射到同一段讲稿）。
- ⛔ **强调克制**：每个风格只有一个主强调色在抢眼（editorial 朱红 / academic 深靛青）。多色 = 没有重点。
- ⛔ **引用必须可溯**：`[作者 年份]` 挂在它支撑的那句旁；末尾给参考文献页。**别编造文献**。
- ⛔ **每段以 secdiv 开场**，让听众有"第几章/Part"的坐标。
- ⛔ **改主题/配色只动皮肤的 `:root` 令牌**，不要去改各版式的字号/配色硬值。
- ⛔ **频道名 `{{CHANNEL}}` 要唯一**（多份 slides 同名会串台）。
- ⛔ **不要混皮**：一份 deck 只内联一个 skin 的 CSS。要换风格 = 重新 build 一份。
- ✅ 离线可用：字体栈自带系统 fallback，断网也不塌。
- ✅ 自配置：段导航/缩略图/计数/副屏标题都由引擎从 `data-seg` 自动来——你只管写 slide 正文。

---

## 文件清单

```
editorial-slides/
├── SKILL.md                          (本文件 · 路由 + 选风格 + 工作流 + 红线)
├── assets/
│   ├── _core.css                     ⭐ 与风格无关的骨架 + 引擎界面（所有皮共用）
│   ├── _engine.js                    ⭐ 引擎（导航/缩略图/投屏 + 概览网格 O 键 + ?bare 模式 + SMFX 动画钩子）
│   ├── _components.css               ⭐ 共享组件层（薄皮用 · token-generic · 含 P4 版式 kpi/vs/timeline/gantt/roadmap/diff/mindmap）
│   ├── _fx.css / _fx.js / _fx-canvas.js  ⭐ 动画库引擎（A–J 十类含 Canvas 特效 · build.py 自动内联）
│   ├── skins/                        21 张皮 · 一皮一文件
│   │   ├── editorial/academic/keynote-dark/cartesian/signal/vellum/daisy-days  原生厚皮（自带全部组件）
│   │   └── dracula/nord/tokyo-night/catppuccin-*/vaporwave/swiss-grid/bauhaus/cyberpunk-neon/glassmorphism/y2k-chrome/neo-brutalism/terminal-green/rose-pine  薄皮（/* uses-base */ → 内联 _components.css）
│   ├── demo/                         各皮 slide 片段 + _showcase.slides.txt / _layouts.slides.txt（展厅原料）
│   ├── build.py                      ⭐ 装配器：core + components(薄皮) + skin + fx + engine + slides → 单文件
│   ├── build-anim-gallery.py         生成动画库画廊 → gallery/animations.html
│   ├── build-showcases.py            生成换皮展厅 + 版式展厅 + gallery/skins/*.html
│   └── deck-template.html            editorial 空白起手式
├── gallery/                          原生皮 <skin>.html · animations.html(动画库) · theme-showcase.html(换皮展厅) · layout-showcase.html(版式) · skins/<skin>.html(21 单皮样板)
├── references/
│   ├── styles.md                     ⭐ 风格画廊 + 选风格指南（Step 0 读这个）
│   ├── animations.md                 ⭐ 动画库编号注册表（Step 0.5 · 编号→属性映射）
│   ├── components.md                 ⭐ 版式组件目录（所有皮通用的 class 契约，最常翻）
│   ├── design-system.md              皮肤架构 / 令牌 / 加一个皮肤
│   ├── external-templates.md         ⭐ 风格银行：从 beautiful-html-templates 移植新皮的配方
│   ├── skins/academic.md             学术皮深度指南（字体/图表/参考文献/换主色/全宋体开关）
│   ├── build-recipe.md               大批量 slides 怎么落地（装配 + 一次性注入）
│   └── presenter-integration.md      怎么接 slides-presenter-mode 做双屏
├── previews/                         各皮样张截图（给人看的）
└── examples/lineage.md               来源 deck 与版式取材说明
```

---

## 来源 / 谱系

- 引擎与杂志风抽象自 **福泉商务局 AI 课程 deck**（`fuquan0527.html` · 145 张 · 现场交付验证）。
- 学术皮的字体/配色取自 **ui-ux-pro-max**（typography #14 News Editorial / #8 Wellness Calm；colors #40 Legal「权威藏青+信任金」暖化），版式遵循社科/人文会议汇报惯例。
- 配套 **slides-presenter-mode**（同源副屏演讲者模式）、**transcripts_html**（同源讲稿）。
- 二者同源：editorial-slides 负责"做出 slides"，slides-presenter-mode 负责"给 slides 加副屏同步"。
