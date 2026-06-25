# academic 皮肤 · 学术汇报风深度指南（社科 / 人文）

> 选了 `academic` 皮再读这个。组件通用写法见 `../components.md`；这里只讲**学术专属的规范、组件和开关**。
> 气质目标：**会议汇报 / working paper 的专业克制**——引用密集也不挤，理论模型与表格优先，大留白舒展。

---

## 一句话 DNA

暖白纸 `#F8F6F1` + **深靛青 `#27406B`**（唯一主色）+ 赭金 `#9A6E2E`（稀用）·
**衬线标题**（Newsreader/Lora + 思源宋体）+ **易读无衬线正文**（Source Sans + 思源黑体）·
标题下发丝线 = 页眉感 · 图表优先 + 编号图注 · 规范参考文献 · 字阶更小更密（比杂志风承载更多字）。

---

## 学术规范红线（比通用红线更严）

- **`<em>` = 斜体术语 / 强调，不抢色**（深色斜体）。要点深靛青用 `<strong>` 或 `.key`，且克制。学术里满屏彩字 = 不专业。
- **一页 bullet ≤ 6 条**，每条一句话；多了拆页。用 `.bullets`（不是杂志风的 cards 堆）。
- **图、表必须编号 + 图注**：图用 `.figure` + `<b>图 1</b>…`；表用 `.table-cap`（`<b>表 1</b>…`）放在表**上方**。
- **参考文献规范**：`.refs` 编号 + 悬挂缩进 + **刊名斜体**（`<em>`）；按字母/出现序；自有未发表标注"进行中"。
- **别编造文献**：真实可溯；DOI 可放讲稿。样板里的文献已标"示例 · 仅供版式参照"。
- **每段 secdiv 开场用 "Part I / §" 坐标**，克制——本皮的 secdiv 没有杂志风的 520px 幽灵数字。

---

## 学术专属组件（杂志风没有或长得不一样）

### figure 概念模型图 / 图表（社科主力）
```html
<div class="figure">
  <div class="figure__frame">
    <!-- 放 <img src> 或内联 <svg>（模型图）。frame 是白底带框，自动居中等比缩放 -->
  </div>
  <div class="figure__cap"><b>图 1</b>图注正文。说明变量、路径、显著性。</div>
  <div class="figure__src">数据来源 / 注：N = 412。</div>
</div>
```
- 一行两图：外层 `.figure--row`，里面两个 `.figure__frame`。
- **概念模型图（X→M→Y / 调节）**：样板 `gallery/academic.html` 第 5 张是现成的有调节中介模型（含 a/b/c′ 路径 + 调节虚线），直接抄 SVG 改文字即可。
- 复杂模型图想要交互式编辑器 → 复用 **hypothesis-design** 的 `templates/concept-model-diagram.html.template`（可导 SVG），把导出的 SVG 贴进 `figure__frame`。

### table booktabs 表格（上下粗线、无竖线）
```html
<div class="table-cap"><b>表 1</b>表标题（放表上方）。</div>
<table class="table">
  <thead><tr><th>列</th><th class="num">N</th><th>…</th></tr></thead>
  <tbody>
    <tr><td>行</td><td class="num">196</td><td>…</td></tr>
    <tr class="hl"><td>强调行</td><td class="num">216</td><td>…</td></tr>
  </tbody>
</table>
```
- 数字列加 `class="num"`（tabular 对齐）；要强调某行加 `class="hl"`（淡靛青底）；弱项 `td.bad`、强项 `td.good`。

### bullets 论点清单（≤6 · 舒展）
```html
<ul class="bullets">
  <li>一句论点，<b>关键词</b>深靛青，引用挂旁边 <span class="cite">(作者, 年份)</span>。
    <ul><li>次级要点（小一号、圆点）。</li></ul>
  </li>
</ul>
```
开场提纲想大一号用 `.bullets--lead`。

### refs 参考文献（编号 + 悬挂缩进 + 刊名斜体）
```html
<ol class="refs">                  <!-- 两列；想一列用 .refs--1col -->
  <li>Author, A. (2019). Title. <em>Journal Name</em>, 46(4), 629–650.</li>
  <li style="color:var(--ink-4);">自有研究（进行中）……</li>   <!-- 未发表淡化 -->
</ol>
```
- 想要"无编号 · 作者-年份悬挂"风格：`.refs--plain`（去掉 `[n]`，首行悬挂）。

### 其余组件（restyle 版，写法同 components.md）
secdiv（克制 · `secdiv--dark` / `secdiv--accent` 深靛青满版）· insight/manifesto（稳重衬线论断）·
cards（白底细框 · 研究问题/贡献）· numlist（假设/证据 · 用 H1/H2 当编号）· bignum（克制靛青衬线数字 · 关键统计量）·
compare / steps / arch / three-circle / matrix / formula5 / terminal（HCI/AI 演示）· callout（靛青）/ note-box（赭金）。

---

## 开关 ①：全宋体「期刊感」（更人文 / 更像论文）

默认是"衬线标题 + 无衬线正文"（投屏易读）。想要更浓的人文/期刊味，让正文也走衬线——
在你的 deck `<style>` 里（皮肤 CSS 之后）覆盖一行：
```css
:root{ --font-sans: var(--font-serif); }   /* 正文也用宋体/Lora */
```
代价：投影远看略不如黑体清楚；小场子 / 偏文科评审场合很合适。

## 开关 ②：换主色（不动版式）

只改皮肤 `:root` 的三个变量即可整套变色（深蓝→其它学术色）：
```css
/* 学术墨绿（自然/可持续/地理） */
:root{ --accent:#2F5D50; --accent-2:#214339; --accent-soft:rgba(47,93,80,0.10); }
/* 学术绛红 / oxblood（人文/历史/文学） */
:root{ --accent:#6E2F3A; --accent-2:#4F2029; --accent-soft:rgba(110,47,58,0.10); }
/* 学术青石蓝（HCI/计算社科，更当代） */
:root{ --accent:#1F5673; --accent-2:#163F54; --accent-soft:rgba(31,86,115,0.10); }
```
> 主色一旦改，`em`/`strong`/secdiv 边线/图注编号/进度条会一并跟上。赭金 `--gold` 是第二色，一般不用动。

---

## 自检清单（学术场景专用）

- [ ] 每段 secdiv 用 Part/§ 坐标；标题层级一致（serif title 56px / eyebrow mono）
- [ ] 图、表都有编号 + 图注；图注在图下、表注在表上
- [ ] bullet ≤6/页；`<em>` 是术语斜体不是彩字；`<strong>` 克制
- [ ] 引用 `(作者, 年份)` 挂在支撑句旁；末页 `.refs` 规范（刊名斜体、悬挂缩进）
- [ ] 主色只有深靛青一个在主导；赭金只点缀
- [ ] 投屏远看正文清楚（默认黑体正文；用了全宋体开关就确认场子不大）
