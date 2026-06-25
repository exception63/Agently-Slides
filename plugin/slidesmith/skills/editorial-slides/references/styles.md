# 风格画廊 · 选风格（Step 0 读这个）

> 每次做 slides **先在这里挑一个风格（skin）**，再进工作流。
> 所有风格**共用同一引擎和同一套组件 class**（`.cover/.secdiv/.head/.cards/.table/.figure`…）——
> 写法一样，外观不同。选定的 skin 决定字体、配色、版式气质。

---

## 怎么选（给用户几句话）

**3 张原生皮**（团队主力，演讲者双屏等基建最完整）：
1. **抓眼、有冲击力、大众/课程/路演** → `editorial` 杂志风（浅 · 纸色）。
2. **专业克制、学术同行（会议/组会/答辩/proposal）** → `academic` 学术汇报风（浅 · 暖白）。
3. **大场子主旨、发布会感、暗场戏剧反转、少字** → `keynote-dark` 暗场主旨风（深 · 近黑）。

**4 张移植自"风格银行"**（从 beautiful-html-templates 移植，补足气质光谱）：
4. **极简/网格/留白/高级感** → `cartesian`（浅）。
5. **机构/政策/年报/可信稳重** → `signal`（浅米 + 藏青 + 金）。
6. **暗色文艺学术/人文讲座** → `vellum`（深靛蓝 + 羊皮金）。
7. **课堂/工作坊/亲子/轻松温暖** → `daisy-days`（奶油 + 粉蜡笔 + 圆角）。

> 用户点名了就用点名的；没点名就按"场合 + 明/暗偏好"对号入座。拿不准 → 让他打开 `gallery/<skin>.html` 各看一眼。
> 还想要别的气质 → 见 `external-templates.md`，从风格银行的 34 个模板里**现移植**一张。

---

## ① editorial · 杂志风（默认）

- **DNA**：暖米白纸色底 `#F2EDE2` + **朱红** `#B8412A`（唯一抢眼色）+ 宋体大标题（Playfair + 思源宋体）+ **大数字冲击**（bignum/insight 单独成页）+ editorial 栏目感三件套（eyebrow 小标签 / secdiv 520px 巨型幽灵数字 / mono 页脚坐标）。
- **气质**：出版物/杂志封面感，抓眼、有人味儿、像 TED/Keynote。
- **适合**：主旨演讲、课程、企业培训、路演、面向非专业听众的"要被记住"的场合。
- **预览/模板**：`gallery/editorial.html` · 空白起手 `assets/deck-template.html`
- **皮肤源**：`assets/skins/editorial.css` · 字体取自 ui-ux-pro-max typography #1 Classic Elegant（Playfair + Inter）。

## ② academic · 学术汇报风（社科 / 人文）

- **DNA**：暖白纸 `#F8F6F1` + **深靛青** `#27406B`（唯一主色）+ 赭金 `#9A6E2E`（稀用）+ **衬线标题**（Newsreader/Lora + 思源宋体）+ **易读无衬线正文**（Source Sans + 思源黑体）+ 标题下发丝线页眉感 + **图表优先**（`.figure` 概念模型图 / booktabs `.table` + 编号图注）+ **规范参考文献**（`.refs` 编号 + 悬挂缩进 + 刊名斜体）。`<em>` = 斜体术语（不抢色），`strong` = 深靛青。无 520px 幽灵数字、字阶更小更密（承载更多文字）、大留白舒展。
- **气质**：会议汇报/working paper 的专业克制，引用密集也不挤，理论模型与表格优先。
- **适合**：学术会议、组会、proposal/开题、答辩、客座讲座、社科/人文实证研究汇报。
- **预览/模板**：`gallery/academic.html`（VR×心理所有权 13 张样板，含 X→M→Y 有调节中介模型图）
- **皮肤源**：`assets/skins/academic.css` · 深度指南 `references/skins/academic.md`（含"全宋体期刊感""换主色"开关）。
- **依据**：ui-ux-pro-max typography #14 News Editorial / #8 Wellness Calm；colors #40 Legal「权威藏青+信任金」暖化。

---

## ③ keynote-dark · 暗场主旨风（大场子 / 发布会感）

- **DNA**：近黑底 `#0C0D11` + **巨大白字**（思源黑体 heavy + Space Grotesk）+ **单一暖琥珀** `#F4B73E` 点睛 + 极少字/页 + 大留白 + secdiv 巨型幽灵数字 + bignum 巨型琥珀数字。`<em>` = 琥珀点睛词（不斜不变体）。卡片是抬升暗面板 + 强调顶边。
- **气质**：舞台聚光灯、戏剧反转、Apple-keynote 感；适合"少字多势"的现场主旨。
- **适合**：主旨演讲、发布会、reveal 多的讲、大礼堂暗场。注意：暗场对投影对比度要求高，强光环境慎用。
- **关键句组件 `.keyline`**（v1.3.1 加）：把一句话钉成浅蓝方框 + 琥珀强调，做全场"金句锚点"；逐字打字机 + 呼吸灯是可选动画层。**实战范例**：人机共生时代的消费行为研究 keynote（动画/流程见 KeynoteSpeech 项目 `03-references/keynote-stagecraft-pattern.md`）。
- **预览/模板**：`gallery/keynote-dark.html`（《被重塑的人》主题 9 张样板）
- **皮肤源**：`assets/skins/keynote-dark.css` · 换强调色（青/品红/翠绿）只改 `--accent` 几个令牌。
- **依据**：ui-ux-pro-max typography #3 Tech Startup（Space Grotesk）+ dark-mode 风格族。

---

## ④–⑦ 移植自风格银行（beautiful-html-templates · MIT · © Zara Zhang）

这四张皮是从外部模板库**移植**的：保留它的配色/字体/装饰，接进我们的引擎 + 中文化。移植配方见 `external-templates.md`。

| skin | 明/暗 | DNA | 适合 | 源模板 |
|---|---|---|---|---|
| **cartesian** | 浅 | 暖灰极简 · Playfair 衬线标题 · 发丝线网格 · 强调靠字重不靠色 | 设计/研究/品牌随笔 · 偏极简、要高级感 | cartesian |
| **signal** | 浅 | 浅米 + 深藏青 + 古金 · Source Serif 衬线 · 高密度承载 + booktabs 表格 | 机构/政策/年报/智库 · 政府企业汇报 | signal |
| **vellum** | 深 | 深靛蓝底 + 羊皮金 Cormorant 衬线 + 青墨线 · 文艺学术 | 人文/思想史/文学讲座 · academic 的暗场版 | vellum |
| **daisy-days** | 浅 | 奶油底 + 粉蜡笔多彩 + 圆角贴纸卡 + coral 点睛 · Fredoka 圆体 | 课堂/工作坊/亲子科普 · 轻松温暖场 | daisy-days |

> 想再加别的气质：`external-templates.md` 里 34 个模板任挑一个现移植；或见 `design-system.md`「加一个皮肤」从零写。引擎都不用动。

---

## 选定之后

回到 `SKILL.md` 的工作流 Step 1。记住：
- 组件写法见 `components.md`（通用）；学术皮的专属组件/规范见 `skins/academic.md`。
- 一份 deck 只用一个 skin，别混皮。换风格 = 用 build.py 重新装配一份。
