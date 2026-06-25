# Changelog · editorial-slides

## v1.3.1 — 2026-06-13 · keynote-dark 加关键句组件 .keyline（反哺自人机共生 keynote）
**做了什么**：把 KeynoteSpeech「人机共生时代的消费行为研究」keynote 实战打磨出的**关键句组件 `.keyline`**（浅蓝方框 + 琥珀 `<em>` 强调，全场"金句锚点"）并进 `keynote-dark` 皮——**只放静态方框**；逐字打字机 + 呼吸灯属"可选动画层"（靠引擎注入），皮肤不含 `present` 隐藏门控，避免无引擎时被永久隐藏。

- 皮：`skins/keynote-dark.css` 末加 `.keyline / .keyline--sm / .insight .keyline / .keyline em`。
- 文档：`references/components.md` 加 keyline 条目；`references/styles.md` keynote-dark 段注明组件 + 实战范例。
- 该 keynote 之上的「3 主题切换 + 按键 build 舞台动画 + 流程」经验沉淀在 KeynoteSpeech 项目 `03-references/keynote-stagecraft-pattern.md`（动画层不进 skill，皮只管视觉）。

## v1.3.0 — 2026-06-04 · 风格银行：移植 4 张皮（cartesian / signal / vellum / daisy-days）
**做了什么**：把外部模板库 **beautiful-html-templates**（34 个 HTML 模板 · MIT · © 2026 Zara Zhang）当"风格银行"，按"移植成皮"的桥接模型，移植 4 个模板成我们的皮——保留它的配色/字体/装饰，接进我们的引擎（段导航/缩略图/演讲者双屏/单文件/中文化）。皮总数 3 → 7。

- **cartesian**（浅）：暖灰极简 + Playfair 衬线 + 发丝线网格，强调靠字重不靠色。补"极简/swiss"位。
- **signal**（浅）：浅米 + 深藏青 + 古金 · Source Serif 衬线 · 高密度 + booktabs。机构/政策/年报。
- **vellum**（深）：深靛蓝底 + 羊皮金 Cormorant 衬线 + 青墨线。暗色文艺学术（academic 的暗场版）。
- **daisy-days**（浅）：奶油 + 粉蜡笔 + 圆角贴纸卡 + coral 点睛 · Fredoka 圆体。课堂/工作坊/亲子。
- **桥接机制**：新增 `references/external-templates.md`（移植配方 3 步 + 仓库位置 + index.json 怎么读 + 署名红线 + 何时改走"直接用它"）。皮肤文件头标注 `ported from beautiful-html-templates/<slug> (MIT)`。仓库克隆在 `Claude Projects/SlidesHTML/beautiful-html-templates/`。
- **跨皮判断**：直接用它的模板会丢掉我们的段导航/演讲者双屏/中文栈，故采"移植成皮"而非"换用其运行时"。
- **并行移植**：4 个 skin 由 4 个子 agent 并行产出（各只写自己的 skins/<名>.css + demo/<名>.slides.txt），主线统一建图 + present 态截图逐张 QA + 写文档。
- dogfood 自检：7 张皮 gallery 全部浏览器渲染、present 态核版通过；引擎/投屏/段导航/缩略图正常。

## v1.2.0 — 2026-06-04 · 第三个皮肤：keynote-dark 暗场主旨风
**做了什么**：在可换皮架构上加第一个**深色**皮肤——暗场主旨风（大场子/发布会感）。验证了架构对"明 vs 暗"也成立。

- **keynote-dark**：近黑底 `#0C0D11` + 巨大白字（思源黑体 heavy + Space Grotesk）+ 单一暖琥珀 `#F4B73E` 点睛 + 极少字/页 + 大留白；secdiv 巨型幽灵数字、bignum 巨型琥珀数字是招牌。`<em>` = 琥珀点睛词。卡片为抬升暗面板 + 强调顶边。换强调色只改 `--accent` 几个令牌。
- 依据：ui-ux-pro-max typography #3 Tech Startup（Space Grotesk）+ dark-mode 风格族。
- **跨皮修复**：`_core.css` 的缩略图编号徽标改用固定深字（之前用 `var(--ink)`，深色皮的 ink 是浅色 → 白底白字看不清）。这条让任意深色皮都不再踩坑。
- dogfood 自检：浏览器渲染《被重塑的人》主题 9 张（封面/宣言钩子/段分隔/大数字/对比/洞见/引用/收束/收尾），present 态逐页核对；引擎/投屏/段导航/缩略图正常。
- 文档：`styles.md` 升为三风格画廊（标注明/暗）；SKILL.md skins 列表 + Step 0 表 + 文件清单同步；demo 片段统一 `.txt` 后缀（避免被当成可打开页面）。

## v1.1.0 — 2026-06-04 · 多风格架构（可换皮）+ 学术汇报风
**做了什么**：把"单一杂志风"重构成"**一套共用引擎 + 可换皮肤（skin）**"，并交付第一个新风格——学术汇报风（社科/人文）。每次调用先在 `references/styles.md` 选风格再动手（SKILL.md Step 0）。

**架构**：
- 抽出**与风格无关**的 `assets/_engine.js`（引擎）+ `assets/_core.css`（骨架/工具界面）——所有皮共用；工具界面强调色改用 `--accent` 令牌跟随皮肤。
- 风格 = 一份 `assets/skins/<名>.css`（`:root` 令牌 + 全部组件视觉）。现有杂志风原样抽成 `skins/editorial.css`（外观不变）。
- 新增装配器 `assets/build.py`：`core + skin + engine + slides` → 单文件离线 deck。源模块化（联邦、不堆巨型文件），输出仍单文件。
- 画廊预览 `gallery/{editorial,academic}.html`（成套 demo，可直接打开/复制）。`deck-template.html` 改为 `build.py editorial --blank` 产出的空白起手式。

**新风格 academic（社科/人文）**：
- 暖白纸 + 深靛青主色 + 赭金稀用；衬线标题（Newsreader/Lora + 思源宋体）+ 易读无衬线正文（Source Sans + 思源黑体）；字阶更小更密、大留白。
- 学术专属组件：`.figure`（概念模型图/图表 + 编号图注，样板含 X→M→Y 有调节中介 SVG）、booktabs `.table` + `.table-cap`、`.bullets`、`.refs`（编号 + 悬挂缩进 + 刊名斜体）。
- `<em>` = 斜体术语（不抢色）、`strong` = 靛青；提供"全宋体期刊感"和"换主色（墨绿/绛红/青石蓝）"开关。深度指南 `references/skins/academic.md`。
- 依据：ui-ux-pro-max typography #14/#8、colors #40 Legal「权威藏青+信任金」暖化（可溯源）。
- dogfood 自检：浏览器渲染 13 张样板（封面/提纲/段分隔/模型图/假设/表格/关键结果/对比/贡献/论断/参考文献），present 态截图逐页核对版面，引擎/投屏/段导航/缩略图均正常。

**向后兼容**：组件 class 契约（`.cover/.secdiv/.head/.cards/.table`…）不变，已有杂志风 deck 照常用；写法一样、换皮即换风格。

## v1.0.1 — 2026-06-03 · 首次真实 dogfood（《被重塑的人》主旨演讲）
**case**：用本 skill 做周立影 30min 主旨演讲中文 slides（37 张 · 7 段），并与 `slides-presenter-mode` 接成演讲者双屏。`KeynoteSpeech/2026workshop/06-slides/slides.html`。

**验证有效**：
- 自配置引擎按 `data-seg`/`data-segname` 自动生成 7 段导航 + 37 缩略图 + 页码 + 副屏标题 + `s{段}-{序}` 锚点 —— 只写 `<section>` 正文，零手工配段。
- `window.SLIDE_MAP`（在引擎 `<script>` 之前注入）成功覆盖默认锚点，与讲稿 1:1 对齐。
- 浏览器实测：封面/段分隔/大数字/洞见/卡片/对比/编号清单/三区 各版式渲染正确；投屏、段导航、缩略图、键盘均可用。

**学到 / 反哺**：
1. **大批量 slides 用脚本注入，别手 Edit**：37 张用一个临时 Python（正则替换 `#deck` 内容 + 注入 `window.SLIDE_MAP`）一次成型，比逐张 Edit 稳。见 `references/build-recipe.md`。
2. **缩略图克隆仍带 `.slide` 类** → 用全局 `document.querySelectorAll('.slide')` 会同时选中缩略图（0×0）。引擎内部已用 `deck.querySelectorAll(':scope > .slide')` 规避；外部脚本/调试要注意，用 `window.deckAPI`。
3. **与 presenter 联用时频道名要对齐**：deck 的 `CONFIG.channel` 与副屏模板里硬编码的 `fuquan-presenter-*` 必须改成同一个（本案 `beishaped-sync`）。配方见 `references/presenter-integration.md`。
4. 新增**参考文献页**版式（`references/components.md` §20）—— 学术场景刚需，之前靠内联 row/col 拼，现固化。
5. `.cite` 小灰字引用样式好用；"一页一件事 + 主色只用朱红"纪律在密集数据页仍成立（大数字 bignum 是最抓眼的武器）。

## v1.0.0 — 2026-06-03 · 抽象自 fuquan0527.html
- 从福泉商务局 145 张实战 deck 抽象出：全套 `:root` 令牌（4 色 + 4 字体 + 字阶）、19 种版式组件、1920×1080 画布 + 投屏/全屏、topbar + 段导航 + 缩略图 + 进度条 + 键盘、演讲者钩子。
- 关键升级 vs 源 deck：**自配置引擎**（段/缩略图/计数/标题从 `data-seg` 自动来）；去掉课程专用 demo modal；频道/副屏文件名提为 `CONFIG`；新增 `.cite` 引用样式。
