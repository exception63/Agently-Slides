# Slidesmith 动画库 · 集众家所长（调研 + 编号方案）

> 日期：2026-06-26 · 状态：广泛调研完成，待用户确认范围后建造
> 任务：给 `editorial-slides` 加"风格库式"的**动画/动效/转场库**——每个**编号**、**所见即所得**预览、skill 里建好**映射**，让非专业用户能按编号指引 AI。
> 方法：4 路并行调研真实生态（不是凭空想），逐一判定"能不能塞进单文件离线 1920×1080 deck"。来源见文末。
> 约束基线：单文件 · 离线（双击即开）· 固定 1920×1080 · 声明式属性 · **CSS 优先 / 顶多一点原生 JS / 不塞重运行时（GSAP/Lottie/three 全弃）**。

---

## 0. 调研结论（先看这几条最重要的）

1. **🌟 最大发现：浏览器原生「View Transitions API」**——做"神奇移动 + 顺滑转场"几乎不用写 JS。同文档版（in-page DOM 切换，正是我们 `.slide.active` 的模型）已于 **2025-10 成为 Baseline**（Chrome 111+ / Safari 18+ / Firefox 144+），离线 `file://` 双击就能跑。把元素的 `view-transition-name` 由我们已有的 `data-id` 生成，浏览器自动把两页间同名元素**配对补间**。不支持的老浏览器自动降级为瞬切。→ 这让"神奇移动"从"难"变"中等偏易"。
2. **FLIP 兜底引擎**（~30 行自写 JS）：给不支持 View Transitions 的浏览器做同样的"神奇移动"。GSAP Flip / Framer layout 底层都是它——First/Last/Invert/Play，`getBoundingClientRect` + `element.animate()` 就够，不用引库。
3. **命名取"用户已熟悉的词"**：转场用 `fade/push/slide/wipe/reveal/split/zoom/flip/cube`；神奇移动主名 `morph`（PowerPoint 叫法最广）别名 `magic-move`；分步揭示直接沿用 reveal.js 的 fragment 词表（HTML slides 事实标准）。
4. **我们缺一整类"一次性强调"**——现有持续动效(glow/breathe…)全是**循环氛围**，没有"看这里！"的**单次**强调拍子（tada/rubberBand/jello…）。这是性价比最高的补缺。
5. **点睛微效果**几乎全是纯 CSS 零依赖：SVG 线条自绘（`pathLength="1"` 妙招免 JS）、聚光灯压暗、Ken Burns、clip-path 揭幕。只有 2 个值得引的**零依赖小脚本**：Rough Notation（手绘批注 ~9KB）和 canvas-confetti（结尾撒花 ~9KB）。
6. **弃**：particles.js/tsParticles（过时+重）、scroll-driven（点击翻页用不上滚动）、vanilla-tilt（悬停在放映时不触发）、Vivus（`pathLength` 已替代）、Lottie（重运行时）。

---

## 1. 编号动画库（9 类 · 集众家所长 · 标注出处与实现）

> 实现图例：**[CSS]** 纯 CSS · **[原生]** 浏览器原生 API · **[小JS]** 自写几十行 vanilla · **[小依赖]** 可选零依赖小脚本(~9KB)
> "已有" = Slidesmith 现在就有（不重做，只是编进库）。

### A · 入场 Entrance（翻到这页时元素怎么出现，播一次）
| № | 名字 | 效果 | 来源 | 实现 |
|---|---|---|---|---|
| A1 | 淡入 | opacity 0→1 | — | 已有 |
| A2 | 上升淡入 | 上移+淡入 | — | 已有 |
| A3 | 弹出 | scale .9→1 | — | 已有 |
| A4 | 从左/右进 | translateX±+淡入 | — | 已有 |
| A5 | 数字滚动 | 0→目标值 | — | 已有 |
| A6 | 逐条浮现 | 列表项依次 rise | — | 已有 |
| **A7** | **字距展开** tracking-in | 字母从重叠模糊→展开清晰（最"高级"的标题入场） | Animista | [CSS] |
| **A8** | **聚焦显影** focus-in | 整段从 blur→清晰，电影感冷静开场 | Animista | [CSS] |
| **A9** | **动感模糊滑入** slide-in-blurred | 带运动模糊滑入，比平滑入高级一档 | Animista | [CSS] |
| **A10** | **翻牌入场** flip-in | 卡片沿轴 3D 翻入（揭晓数字/答案） | Animate.css | [CSS] |
| **A11** | **纵深拉入** back-in | 从远处缩小+位移，落定（含景深） | Animate.css | [CSS] |
| **A12** | **逐字/逐词浮现** split-reveal | 文字按字/词错峰出现（动态排版） | SplitType 概念 | [小JS] |

### B · 分步揭示 Build / Fragments（点一下出一条，控制讲解节奏）🆕 来自 reveal.js
| № | 名字 | 效果 | 实现 |
|---|---|---|---|
| **B1** | 逐点点出 | 元素初始隐藏，点击逐个淡入（可加 `data-fragment-index` 定序，多元素可同序号） | [小JS]+[CSS] |
| **B2** | 方向点出 | 点出时从上/下/左/右滑入 fade-up/down/left/right | [CSS] |
| **B3** | 只此刻显 current-visible | 点出后下一步又消失（一次只亮一个） | [小JS] |
| **B4** | 点出后变暗 semi-out | 点出后下一步降到半透明（旧点退居背景） | [小JS] |
| **B5** | 放大/缩小 grow/shrink | 点出时 scale 变化强调 | [CSS] |
| **B6** | 划掉 strike | 点击给文字加删除线（"这条不要了"） | [CSS] |
| **B7** | 高亮 highlight | 点击把文字变红/绿/蓝（highlight-current=只在该步亮） | [CSS] |

### C · 强调 Emphasis（一次性"看这里！"的拍子）🆕 补缺
| № | 名字 | 效果 | 来源 | 实现 |
|---|---|---|---|---|
| **C1** | 嗒哒 tada | 缩一下再放大+微转，庆祝式登场 | Animate.css | [CSS] |
| **C2** | 橡皮筋 rubber-band | X/Y 挤压拉伸再回弹（强调词/数字） | Animate.css | [CSS] |
| **C3** | 果冻 jello | 果冻式抖动（logo/标注） | Animate.css | [CSS] |
| **C4** | 心跳 heartbeat | 两下快速脉冲（单次，比循环 pulse 干净） | Animate.css | [CSS] |
| **C5** | 摇头 headshake | 轻微左右"不"摆（专业、克制的强调） | Animate.css | [CSS] |
| **C6** | 抖动 shake | 横向急抖（"错误/警示"语境） | Animate.css | [CSS] |
| **C7** | 抬字 text-shadow-pop | 文字获方向投影"浮起"（假 3D 抬升） | Animista | [CSS] |

### D · 持续动效 Motion（一直循环的氛围）
| № | 名字 | 来源 | 实现 |
|---|---|---|---|
| D1–D7 | 呼吸发光 glow / 缩放呼吸 breathe / 漂浮 float / 闪烁 pulse / 霓虹 neon / 强调脉冲 stress / 流光 shimmer | keynote+huashu | 已有 |
| **D8** | 渐变文字流光 gradient-shimmer | `background-clip:text` 光带扫过（克制时高级，花哨时像广告页） | CSS-Tricks 范式 | [CSS] |

### E · 跨页转场 Transition（从这页切到下页的方式）🆕 来自 reveal/Keynote/PPT
| № | 名字 | 效果 | 实现 |
|---|---|---|---|
| **E1** | 瞬切 none/cut | 直接切（默认快） | [CSS] |
| **E2** | 淡入淡出 fade | 交叉淡变（最通用） | [CSS] |
| **E3** | 过色淡变 fade-through-color | 经一层底色再现（Keynote 同款） | [CSS] |
| **E4** | 推移 push | 新页把旧页推走（有方向） | [CSS]/[原生] |
| **E5** | 滑动 slide | 横向滑入滑出 | [CSS]/[原生] |
| **E6** | 揭幕 wipe/reveal | 边缘擦出 | [CSS] |
| **E7** | 对开 split | 从中缝分开/合拢 | [CSS] |
| **E8** | 缩放 zoom | 整页放大/缩小进出（含 impress 的"缩放镜头"味道） | [CSS]/[原生] |
| **E9** | 翻转 flip | 3D 翻面 | [CSS] |
| **E10** | 立方体 cube | 3D 立方体转面 | [CSS] |
| E11* | （进阶 CSS 拼块）百叶窗 blinds / 棋盘 checkerboard / 翻页 page-flip | 标记进阶，markup 略重，可选 | [CSS] |

### F · 神奇移动 Magic Move / Morph（元素在两页间平滑飞过去）🆕 ★旗舰 · Keynote/PPT 同款
| № | 名字 | 效果 | 实现 |
|---|---|---|---|
| **F1** | 飞移 | 同一元素位置平移 | [原生]+[小JS兜底] |
| **F2** | 缩放变形 | 同一元素变大/变小 | [原生]+[小JS兜底] |
| **F3** | 文字/数字变形 | 大数字/标题在两页间渐变成另一个 | [原生]+[小JS兜底] |
| **F4** | 颜色渐变 | 同一元素色/底色过渡 | [原生]+[小JS兜底] |
> 机制：两页同元素打同 `data-morph`（落到 `view-transition-name`，由 `data-id` 派生）→ 浏览器原生补间；不支持则 FLIP 兜底。补间属性限 position/font-size/color/background/padding/scale（对齐 reveal auto-animate，保性能）。

### G · 消失 Exit（离开这页的方式，播完再翻页）
| № | 名字 | 来源 | 实现 |
|---|---|---|---|
| G1–G5 | 淡出 / 下沉 / 缩小消失 / 左滑出 / 右滑出 | — | 已有 |
| **G6** | 翻牌离场 flip-out | 配 A10 翻牌（"翻回去"） | Animate.css | [CSS] |
| **G7** | 蒸发 puff-out/vanish | 模糊+放大成虚影消失（优雅） | Magic | [CSS] |
| **G8** | 纵深退场 back-out | 略放大再缩远离去（配 A11） | Animate.css | [CSS] |
| **G9** | 文字虚化 text-blur-out | 标题模糊淡出（电影感） | Animista | [CSS] |

### H · 点睛 Accent（让 slide 高级的特殊触感）🆕
| № | 名字 | 效果 | 来源 | 实现 |
|---|---|---|---|---|
| **H1** | 线条自绘 line-draw | 下划线/箭头/图表线"画出来"（`pathLength="1"` 免 JS） | SVG 范式 | [CSS] |
| **H2** | 手绘下划线 | 一笔手写马克笔线扫过关键词（编辑感，非剪贴画） | 同上 | [CSS] |
| **H3** | 渐进连线箭头 | 线 A→B 生长、箭头落位（点击搭论证） | 同上 | [CSS] |
| **H4** | 手绘批注 annotate | 给词加圈/框/下划线/高亮/删除（现场圈点） | Rough Notation | [小依赖]~9KB |
| **H5** | 聚光灯压暗 spotlight | 除目标元素外全体压暗（最强"看这个"） | CSS 范式 | [CSS] |
| **H6** | Ken Burns | 大图缓慢平移+轻微放大（电影质感全幅图） | CSS 经典 | [CSS] |
| **H7** | 擦幕揭图 clip-wipe | 图/标语被一道边缘擦出（点击揭晓） | clip-path | [CSS] |
| **H8** | 打字机 typewriter | 逐字打出+光标（"终端/dev"语境用） | CSS steps()/TypeIt | [CSS]/[小依赖] |
| **H9** | 文字解码 scramble | 乱码翻滚后定格成词（科技/AI 名词单次用） | soulwire 范式 | [小JS]~80行 |
| **H10** | 滚轮数字 odometer | 数字像机械计数器逐位滚（一个高光数据用） | Odometer 概念 | [小JS] |
| **H11** | 结尾撒花 confetti | 终页庆祝喷彩（仅结尾，零依赖） | canvas-confetti | [小依赖]~9KB |

### I · 背景氛围 Ambient Background（整页的高级底子）🆕
| № | 名字 | 效果 | 来源 | 实现 |
|---|---|---|---|---|
| **I1** | 极光/网格渐变 aurora | 几团柔光缓慢漂移（Stripe/Linear 感，最值的"高级"底） | CSS 范式 | [CSS] |
| **I2** | 胶片颗粒 film-grain | 极淡颗粒覆层（"设计过"与"默认"的分水岭，静态不动） | SVG feTurbulence | [CSS] |
| **I3** | 渐变流动 gradient-wash | 多色慢移（仅段落分隔页，慢且去饱和才不俗） | CSS | [CSS] |
| **I4** | 锥形光晕 conic-glow | 慢转角向光晕（仅做 hero 数字/logo 背后小光晕） | CSS @property | [CSS] |

---

## 2. 分层（避免非专业用户挑花眼）

- **核心层（默认推荐，一定做）**：A1–A12 · B1–B7 · C1–C7 · D1–D8 · E1–E10 · F1–F4 · G1–G9 · H1/H5/H6/H7。全纯 CSS 或原生/小 JS。
- **点睛层（可选，做几个明星）**：H2/H3/H4/H8/H10/H11 · I1/I2。其中 H4/H11 是仅有的两个零依赖小脚本。
- **进阶/慎用层**：E11 拼块转场、H9 解码、I3/I4。markup 较重或易俗，按需。

## 3. 引擎落地策略（给建造时的自己）

1. **转场/神奇移动的脊梁 = View Transitions API + FLIP 兜底**。翻页函数包一层 `document.startViewTransition(swap)`，feature-detect 不支持就走 FLIP（或瞬切）。`data-id → view-transition-name`。
2. **入场/强调/消失 = 纯 CSS @keyframes + 类**，全 top-pick 合计 <5KB。`flip-*` 需父级 `perspective`。
3. **分步揭示 = ~30 行步进计数器**，复用 deck 已有的翻页键拦截（FX_JS 已在拦），next 先推进 fragment 再翻页。
4. **缓动加 3–4 个烘焙好的 `linear()` 弹簧预设**（CSS 变量，离线零运行时；Josh Comeau 范式），让 pop/bounce 有物理感。
5. **点睛**：line-draw 用 `pathLength="1"`（免 `getTotalLength` JS）；H4/H11 两个小脚本按需内联；spotlight = 一行 class 开关。
6. 全部 `prefers-reduced-motion` 降级；放映按 B 一键关（沿用现状）。

## 4. 三处通用（AI-first 闭环）

同一套编号，三处认：
- **生成时**：用户说"风格②学术 + 入场 A8 + 第3→4页大数字 F3 + 关键词 H4 圈出" → AI 查 `references/animations.md` → 写对应 `data-anim/data-fragment/data-morph/...` 属性。
- **Studio 里**：人在"动画效果"tab 按编号点开关/换（细活，零 token）。
- **评论里**：人留"这页加分步揭示" → AI 改（重活）。

## 5. 交付物（建造清单）

1. **引擎 FX 模块**进 `editorial-slides/assets/`（`_fx.css`+`_fx.js`，build.py 内联）+ 同步回 Studio/runtime（统一属性契约）。
2. **`gallery/animations.html`**：所见即所得画廊——每效果一卡 + 编号 + 实时预览 + ▶重播/下一步/播放，按 9 类分区，像剪映效果面板。
3. **`references/animations.md`**：编号注册表（编号 → 名 → AI 该写的属性 → 适合场景 → 画廊锚点），SKILL.md 加「Step 0.5 选动画」。
4. 每步配 playwright 验证 + 截图验收（非技术用户看 demo）。

---

## Sources（4 路调研）
**纯 CSS 动画包**：[Animate.css](https://animate.style/) · [Magic/miniMAC](https://github.com/miniMAC/magic) · [Animista](https://animista.net/) · [Hover.css](https://ianlunn.github.io/Hover/) · [AOS](https://github.com/michalsnik/aos)
**JS 引擎/原生 API 的可借鉴机制**：[View Transitions 2025(Chrome)](https://developer.chrome.com/blog/view-transitions-in-2025) · [same-doc VT Baseline(web.dev)](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available) · [MDN startViewTransition](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) · [FLIP(Aerotwist)](https://aerotwist.com/blog/flip-your-animations/) · [GSAP Flip](https://gsap.com/docs/v3/Plugins/Flip/) · [Framer Magic Motion](https://www.nan.fyi/magic-motion) · [GSAP SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) · [MDN WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API) · [Josh Comeau linear() springs](https://www.joshwcomeau.com/animation/linear-timing-function/)
**演示框架效果体系**：[reveal fragments](https://revealjs.com/fragments/) · [reveal transitions](https://revealjs.com/transitions/) · [reveal auto-animate](https://revealjs.com/auto-animate/) · [Slidev animations](https://sli.dev/guide/animations) · [Spectacle](https://github.com/FormidableLabs/spectacle) · [impress.js](https://github.com/impress/impress.js/blob/master/DOCUMENTATION.md) · [Keynote transitions](https://iworkautomation.com/keynote/slide-transition.html) · [PowerPoint transitions](https://www.enchanted.media/powerpoint-transitions-every-effect-explained/)
**点睛微效果**：[Rough Notation](https://roughnotation.com/) · [canvas-confetti](https://github.com/catdad/canvas-confetti) · [SplitType](https://github.com/lukePeavey/SplitType) · [SVG line-draw(CSS-Tricks)](https://css-tricks.com/svg-line-animation-works/) · [grainy gradients(CSS-Tricks)](https://css-tricks.com/grainy-gradients/) · [spotlight(Frontend Masters)](https://frontendmasters.com/blog/css-spotlight-effect/) · [Ken Burns(kirupa)](https://www.kirupa.com/html5/ken_burns_effect_css.htm) · [clip-path(CSS-Tricks)](https://css-tricks.com/animating-with-clip-path/)
