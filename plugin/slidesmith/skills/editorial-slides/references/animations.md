# 动画库 · 编号注册表（AI 照编号落属性）

> 人在 `gallery/animations.html`（所见即所得）里翻着挑，记住编号；对你（AI）说编号，你照本表落属性。
> 引擎：`assets/_fx.css` + `assets/_fx.js`（build.py 自动内联进成品 deck）。来源/取舍见 `docs/ANIMATION-LIBRARY-PLAN.md`。
> **黄金法则**：动画是声明式属性，写在 slide 元素上即可；**别写死内联 animation/keyframes**（破坏换肤与放映关闭）。放映按 `B` 全关，尊重系统"减少动态"。
> **动效令牌**：`_fx.css :root` 有共享的时长/缓动/间隔/模糊刻度（`--smfx-t-quick/base/slow`、`--smfx-stagger`、`--smfx-blur-in`、`--smfx-ease-pop` 等），新效果统一引用、节奏一致。灵感来自 [transitions.dev](https://transitions.dev) 的 motion-token scale（按 slides 放映态重新定标，本库为自有实现）。

## 怎么落（三种属性 + 两个机制）

| 想要 | 在元素上写 | 何时播 |
|---|---|---|
| **入场**（A） | `data-anim="rise"` 等 | 放映态翻到该页，播一次 |
| **强调**（C） | `data-emph="tada"` 等 | 放映态翻到该页，播一次（元素已可见再做手势） |
| **持续**（D） | `data-motion="glow"` 等 | 一直循环 |
| **消失**（G） | `data-anim-out="fade-out"` 等 | 离开该页前播 |
| **分步揭示**（B） | 元素加 `class="fragment ..."`（可加 `data-fragment-index="2"` 定序） | 放映态点一下出一条 |
| **跨页转场**（E） | deck 级 `<body data-transition="fade">`；单页 `<section ... data-transition="zoom">` 覆盖 | 翻页时 |
| **神奇移动**（F） | 相邻两页的"同一元素"各写 `data-morph="hero"`（同名即配对） | 翻这两页之间时自动补间 |

> 入场/强调可叠加：`<h1 data-anim="rise" data-emph="tada">`。逐条浮现给 `<ul data-anim="stagger-list">`。
> 神奇移动机制：浏览器原生 View Transitions（支持时）自动补间位置/字号/颜色/底色；不支持则 FLIP 兜底；都不行则瞬切（不报错）。

## 编号表

### A · 入场 Entrance
| № | 名 | 属性值（`data-anim`）| 适合 |
|---|---|---|---|
| A1 | 淡入 | `fade` | 最稳的默认 |
| A2 | 上升淡入 | `rise`（=`fade-up`）| 正文/要点 |
| A3 | 弹出 | `pop` | 卡片/徽标（带弹簧）|
| A4a/A4b | 从左/右进 | `in-left` / `in-right` | 并列元素 |
| A6 | 逐条浮现 | `stagger-list`（写在 `<ul>/<ol>` 上）| 要点列表 |
| A7 | 字距展开 | `tracking-in` | 高级标题入场 |
| A8 | 聚焦显影 | `focus-in` | 封面大字、冷静开场 |
| A9 | 动感模糊滑入 | `slide-blur` | 比平滑入高级一档 |
| A10 | 翻牌入场 | `flip-in` | 揭晓数字/答案 |
| A11 | 纵深拉入 | `back-in` | 含景深的进场 |
| A5 | 数字弹入 | `num-pop` | KPI/价格/票数（逐字错落+模糊"砸"入；引擎自动拆字，也可手写 `<span class="smfx-ch" style="--i:0">`）|
| A12 | 多行浮现 | `texts-reveal`（写在堆叠多行的容器上）| 标题+副题/要点块（每行依次模糊上浮）|

### B · 分步揭示 Fragments（`class="fragment ..."`）
| № | 名 | class | 行为 |
|---|---|---|---|
| B1 | 逐点点出 | `fragment` | 初始隐藏，点击逐个淡入 |
| B2 | 方向点出 | `fragment up`（/`down`/`left`/`right`）| 点出时带方向滑入 |
| B3 | 只此刻显 | `fragment current-visible` | 点出后下一步又消失 |
| B4 | 点出后变暗 | `fragment semi-out` | 点出后下一步降到半透明 |
| B5 | 放大/缩小点出 | `fragment grow`（/`shrink`）| 点出时缩放强调 |
| B6 | 划掉 | `fragment strike` | 默认可见，点击加删除线 |
| B7 | 高亮 | `fragment highlight` | 默认可见，点击变主强调色 |
> 定序：给多条加 `data-fragment-index`，同序号一起出现。

### C · 强调 Emphasis（`data-emph`）
| № | 名 | 值 | № | 名 | 值 |
|---|---|---|---|---|---|
| C1 | 嗒哒 | `tada` | C5 | 摇头 | `headshake` |
| C2 | 橡皮筋 | `rubber-band` | C6 | 抖动 | `shake` |
| C3 | 果冻 | `jello` | C7 | 抬字 | `text-pop` |
| C4 | 心跳 | `heartbeat` | | | |

### D · 持续动效 Motion（`data-motion`）
`glow` 呼吸发光 · `breathe` 缩放呼吸 · `float` 漂浮 · `pulse` 闪烁 · `neon` 霓虹微闪 · `stress` 强调脉冲 · `shimmer` 流光溢彩（D1–D7）。

### E · 跨页转场 Transition（`data-transition`，deck 级或单页）
`fade` 淡入淡出（E2）· `slide` 滑动（E5）· `push` 推移（E4）· `zoom` 缩放（E8）· `flip` 翻转（E9）· `wipe` 揭幕（E6）· `split` 对开（E7）。
规划中：`none` 瞬切 · `fade-through-color` · `cube` 立方体 · 百叶窗/棋盘。

### F · 神奇移动 Magic Move（`data-morph="同名"`，★旗舰）
F1 飞移+变大 · F3 文字/数字变形 · F4 颜色渐变。**用法**：在第 N 页和第 N+1 页给"逻辑上同一个"元素写**相同的** `data-morph` 值（如两页的大数字都 `data-morph="stat"`），翻页时它会从旧位置/字号/色平滑变到新的。补间属性：位置、字号、颜色、底色、内边距、缩放。

### G · 消失 Exit（`data-anim-out`）
`fade-out` 淡出 · `sink` 下沉 · `zoom-out` 缩小消失 · `out-left`/`out-right` 左/右滑出 · `flip-out` 翻牌离场 · `puff-out` 蒸发 · `back-out` 纵深退场 · `text-blur-out` 文字虚化（G1–G9）。

### H · 点睛 Accent
| № | 名 | 怎么写 |
|---|---|---|
| H1 | 线条自绘 | 给 SVG 容器加 `class="smfx-draw"`，内含 `<path pathLength="1" ...>`（下划线/箭头/图表线会画出来）|
| H5 | 聚光灯压暗 | 容器加 `class="smfx-spot"`，要突出的子元素加 `data-focus`（其余自动压暗）|
| H6 | Ken Burns | 图容器加 `class="smfx-kenburns"`（或 `<img data-motion="ken-burns">`）|
| H7 | 擦幕揭图 | 元素加 `data-anim="clip-wipe"` |
| H8 | 成功对勾 | 容器加 `class="smfx-check"`，内含对勾 `<svg>`：圆环 + `<path class="smfx-check-tick" pathLength="1" d="M15 27 l8 8 15-17">`。翻到该页：圆环弹入 + 对勾描线（"完成/达成/上线"时刻的庆祝拍）|
| H2/H3/H4/H9–H11 | 手绘下划线/连线箭头/手绘批注/解码/滚轮数字/撒花 | （规划中；H4 用 Rough Notation、H11 用 canvas-confetti，零依赖小脚本；打字机见 J13）|

### I · 背景氛围 Ambient
I1 极光渐变：容器加 `class="smfx-aurora"`（可调 `--smfx-aurora-1/2/3` 三团光的色）。
I2 胶片颗粒：容器加 `class="smfx-grain"`（静态覆层，提质感）。
规划中：I3 渐变流动 · I4 锥形光晕。

### J · Canvas 特效（`data-fx="名"` · ★ 移植自 html-ppt-skill, MIT · 零依赖 · 读 `--accent`）
真·粒子/canvas 大招。给容器加 `data-fx`：**满屏背景**就加在该页 `<section class="slide">` 上（canvas 自动垫在内容下层）；**局部面板**就加在一个盒子上。翻到该页才跑、离开即停（自带生命周期）。
| № | 值（`data-fx`）| 看相 | 适合 |
|---|---|---|---|
| J1 | `gradient-blob` | 极光团（加性模糊渐变）| 满屏背景（高级感）|
| J2 | `constellation` | 星座连线 | 满屏背景 |
| J3 | `knowledge-graph` | 力导向带标签节点（可 `data-fx-labels="A,B,C"`）| 数据面板（RAG/图谱）|
| J4 | `neural-net` | 前馈网 + 脉冲 | 数据面板（模型架构）|
| J5 | `counter-explosion` | 数字滚动 + 粒子爆（`data-fx-to="2400"`）| KPI 揭晓 |
| J6 | `particle-burst` | 中心粒子迸发 | 一次性爆点 |
| J7 | `shockwave` | 同心圆冲击波 | 冲击 / 发布 |
| J8 | `starfield` | 3D 飞星 | 封面 / 暗场 |
| J9 | `galaxy-swirl` | 星系漩涡 | 封面 / 暗场 |
| J10 | `matrix-rain` | 矩阵雨（落码）| 黑客 / 科技 |
| J11 | `data-stream` | 滚动二进制/十六进制 | 数据 / 安全 |
| J12 | `confetti-cannon` | 两侧礼花 | 结尾庆祝 |
| J13 | `typewriter-multi` | 多行终端打字（`data-fx-line1/2/3`）| 启动日志 / 终端 |
> canvas 自带暗底，最适合**暗场皮**或**局部面板**；满屏铺浅皮上会把该区域压暗成"暗场面板"（也是一种用法）。规划中：orbit-ring/chain-react/magnetic-field/letter-explode。

## 用户怎么指引你（示例）

> "封面标题用 **A8 聚焦显影**，要点列表 **A6 逐条浮现**，第 4 页的大数字 **F1 神奇移动**到第 5 页，关键句 **H1 自绘线**强调，整份 deck 转场用 **E2 淡入淡出**。"

你照表落：封面 `<h1 ... data-anim="focus-in">`；要点 `<ul data-anim="stagger-list">`；第4、5页大数字各 `data-morph="kpi"`；关键句包 `class="smfx-draw"` + 内嵌下划线 SVG；`<body data-transition="fade">`。
人也能在 Studio「动画效果」tab 点 **🎬 打开动画库** —— 弹出这套画廊当"效果浏览器"子窗口，选中元素后点任意效果的「应用到选中」即可套用，并在右栏看到「当前动画」chips（✕ 可移除）。同一套编号三处通用：生成时（你写属性）/ Studio 里（人点）/ 评论里（你改）。
