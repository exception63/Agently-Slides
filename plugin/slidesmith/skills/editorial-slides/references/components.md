# 版式组件目录 · 复制即用

> 每张 slide = 一个 `<section class="slide ...">`，放在 `#deck` 里，带 `data-seg` / `data-segname`（同段相同）/ 可选 `data-title`。
> 画布固定 **1920×1080**；内容超出会被裁。一页只讲一件事——宁可多开一页，不要塞满。
> 强调用 `<em>…</em>`；引用出处用 `<span class="cite">[作者 年份]</span>`。
>
> **这套 class 契约所有皮肤通用**——同样的写法，外观随选中的 skin 变：
> - **editorial 杂志风**：`<em>` = 朱红衬线斜体；强调抢眼、大数字冲击。
> - **academic 学术风**：`<em>` = 深色斜体术语（不抢色），主色深靛青；图表/参考文献优先。学术专属组件（`.figure / .table-cap / .bullets / .refs`）和规范见 `skins/academic.md`。
> 下面片段以杂志风的色名（朱红/藏青/金）描述，学术皮会自动映射到靛青/赭金；class 不用改。

---

## 0 · 每张 slide 的外壳

```html
<section data-seg="0" data-segname="段 0 · 开场" class="slide">…内容…</section>
```

- `data-seg`：段号，从 0 起。引擎据此自动生成左侧段导航、缩略图、页码。
- `data-segname`：`段 N · 段名`，同一段每张都写一样；引擎取该段第一次出现的值当段名。
- `data-title`（可选）：副屏/演讲者视图显示的短标题；不写则自动取本页最大标题文本。
- 页脚 chrome（段名 + `003 / 145` 页码）由引擎自动注入，**不用自己写**。

---

## 1 · cover 封面（每套第一张）

```html
<section data-seg="0" data-segname="段 0 · 开场" class="slide cover">
  <div class="cover__top">
    <div class="cover__brand">机构 / 系列名</div>
    <div class="cover__seal">印</div>           <!-- 右上角朱红印章，1-2 字 -->
  </div>
  <div class="cover__main">
    <div class="cover__eyebrow">课程封面 · 段 0</div>
    <h1 class="cover__title">主标题<br><em>关键词</em></h1>
    <p class="cover__sub">一句副标题，点明讲什么、为谁讲。</p>
  </div>
  <div class="cover__meta">
    <div class="cover__meta-item"><span class="cover__meta-k">SPEAKER</span><span class="cover__meta-v">讲者</span></div>
    <div class="cover__meta-item"><span class="cover__meta-k">OCCASION</span><span class="cover__meta-v">场合</span></div>
    <div class="cover__meta-item"><span class="cover__meta-k">DATE</span><span class="cover__meta-v">2026</span></div>
  </div>
</section>
```

---

## 2 · secdiv 段分隔（每段开头·巨型幽灵数字）

变体：`secdiv`（纸色）/ `secdiv--dark`（墨夜）/ `secdiv--vermilion`（朱红满版）。

```html
<section data-seg="1" data-segname="段 1 · 论证" class="slide secdiv secdiv--dark">
  <div class="secdiv__num">01</div>                 <!-- 也可放 DEMO / Ⅱ / 章名缩写 -->
  <div class="secdiv__eyebrow">第一章</div>
  <h2 class="secdiv__title">这一章<br>要讲<em>什么</em></h2>
  <p class="secdiv__lead">一两句话给本章定调。</p>
  <!-- 可选：<div class="secdiv__meta">8 分钟 · 4 个证据</div> -->
</section>
```

---

## 3 · manifesto 大字宣言（强钩子 / 反问 / 落点）

变体：`manifesto`（纸）/ `manifesto--dark`（墨夜，最抓眼）。

```html
<section data-seg="0" data-segname="段 0 · 开场" class="slide manifesto manifesto--dark">
  <h2 class="manifesto__title">一句话<br><em>把人钉在椅子上</em></h2>
  <p class="manifesto__sub">副句 · 解释或反问（可省略）。</p>
</section>
```

---

## 4 · insight 洞见金句（你想让全场记住的一句）

```html
<section data-seg="1" data-segname="段 1 · 论证" class="slide insight">
  <div class="insight__eyebrow">本场核心</div>
  <h2 class="insight__statement">一句<em>核心论断</em>。</h2>
  <p class="insight__sub">下面一行小字把它接住。</p>
</section>
```

---

## 5 · 标准内容页：head（标题块）+ 内容容器

几乎所有"讲解型"页都是 `head` + `fill`（占满中部）+ 任意组件：

```html
<section data-seg="1" data-segname="段 1 · 论证" class="slide">
  <div class="head">
    <div class="eyebrow head__eyebrow">小节标签</div>
    <h2 class="title head__title">本页<em>主标题</em></h2>
    <p class="head__sub">一行副标题（可省略）。</p>
  </div>
  <div class="fill">…放下面任一组件…</div>
</section>
```

`.fill` 默认撑满；想垂直居中加 `style="justify-content:center;"`。

---

## 6 · cards 卡片组（2/3/4/5/6 列）

```html
<div class="cards cards--3">            <!-- cards--2 / --4 / --5 / --6 -->
  <div class="card card--v"><div class="card__eyebrow">A</div><div class="card__title">要点一</div><div class="card__desc">解释。<span class="cite">[作者 年份]</span></div></div>
  <div class="card card--n"><div class="card__eyebrow">B</div><div class="card__title">要点二</div><div class="card__desc">解释。</div></div>
  <div class="card card--g"><div class="card__eyebrow">C</div><div class="card__title">要点三</div><div class="card__desc">解释。</div></div>
</div>
```

色：`card--v` 朱红 / `card--n` 藏青 / `card--g` 金 / 默认墨 / `card--plain` 无底。
带等级数字时用 `<div class="card__level">L1</div>`；底部标签用 `<div class="card__meta">标签</div>`。

---

## 7 · bignum 大数字（数据冲击页，最抓眼）

单个或并排放进 `.row`：

```html
<div class="row" style="gap:40px;">
  <div class="bignum" style="flex:1;"><div class="bignum__v">−80%</div><div class="bignum__u">指标变化</div><div class="bignum__k">来源说明 · [作者 年份]</div></div>
  <div class="bignum" style="flex:1;"><div class="bignum__v">68%</div><div class="bignum__u">另一个数</div><div class="bignum__k">[作者 年份]</div></div>
</div>
```

---

## 8 · numlist 编号清单（证据列表 / 步骤 / 要点）

```html
<div class="numlist">
  <div class="numitem"><div class="numitem__n">1</div>
    <div class="numitem__main"><div class="numitem__title">条目标题</div><div class="numitem__desc">一句话说明。</div></div>
    <div class="numitem__tag">[作者 年份]</div></div>
  <div class="numitem numitem--accent"><div class="numitem__n">2</div>
    <div class="numitem__main"><div class="numitem__title">重点条目（朱红）</div><div class="numitem__desc">说明。</div></div>
    <div class="numitem__tag">标签</div></div>
</div>
```

行多时整块加 `numlist--lg` 缩小字号。

---

## 9 · compare 两栏对比（坏 vs 好 / 旧 vs 新）

```html
<div class="compare">
  <div class="compare__col compare__col--bad">
    <div class="compare__label">默认 / 旧</div><div class="compare__title">问题方</div>
    <ul class="compare__list"><li>缺点一</li><li>缺点二</li></ul>
  </div>
  <div class="compare__col compare__col--good">
    <div class="compare__label">主张 / 新</div><div class="compare__title">改进方</div>
    <ul class="compare__list"><li>优点一</li><li>优点二</li></ul>
  </div>
</div>
```

---

## 10 · steps 流程（3/4/5 步横排）

```html
<div class="steps steps--3">              <!-- steps--4 / steps--5 -->
  <div class="step"><div class="step__n">STEP 1</div><div class="step__title">第一步</div><div class="step__desc">说明。</div></div>
  <div class="step"><div class="step__n">STEP 2</div><div class="step__title">第二步</div><div class="step__desc">说明。</div></div>
  <div class="step"><div class="step__n">STEP 3</div><div class="step__title">第三步</div><div class="step__desc">说明。</div></div>
</div>
```

---

## 11 · three-circle 三区（红绿灯 / 三分法）

```html
<div class="three-circle">
  <div class="zone zone--g"><div class="zone__k">绿</div><div class="zone__title">可放心</div><div class="zone__test">判断标准（斜体）</div><div class="zone__eg">例子。</div><div class="zone__action">行动建议</div></div>
  <div class="zone zone--y"><div class="zone__k">黄</div><div class="zone__title">需留意</div><div class="zone__test">…</div><div class="zone__eg">…</div><div class="zone__action">…</div></div>
  <div class="zone zone--r"><div class="zone__k">红</div><div class="zone__title">别碰</div><div class="zone__test">…</div><div class="zone__eg">…</div><div class="zone__action">…</div></div>
</div>
```

---

## 12 · arch 分层堆栈（架构 / 层级，5→1）

```html
<div class="arch">
  <div class="arch__layer arch__layer--5"><div class="arch__n">5</div><div class="arch__name">顶层<small>LAYER 5</small></div><div class="arch__desc">说明。</div><div class="arch__tag">标签</div></div>
  <div class="arch__layer arch__layer--4"><div class="arch__n">4</div><div class="arch__name">第四层<small>LAYER 4</small></div><div class="arch__desc">说明。</div><div class="arch__tag">标签</div></div>
  <!-- --3 金 / --2 绿 / --1 墨 -->
</div>
```

---

## 13 · table 表格

```html
<table class="table">
  <thead><tr><th>列一</th><th>列二</th><th>列三</th></tr></thead>
  <tbody>
    <tr><td>行</td><td class="bad">弱项（灰）</td><td class="good">强项（朱红）</td></tr>
  </tbody>
</table>
```

## 14 · matrix 矩阵（行×列对照）

```html
<div class="matrix">
  <div class="matrix__h"></div><div class="matrix__h">列A</div><div class="matrix__h">列B</div><div class="matrix__h">列C</div>
  <div class="matrix__h row-h">行1</div><div class="matrix__cell">…<strong>重点</strong></div><div class="matrix__cell">…</div><div class="matrix__cell">…</div>
</div>
```
> `grid-template-columns:240px repeat(3,1fr)`；要 4 列改这张 slide 内联 style。

---

## 15 · terminal 终端 / prompt / 代码

```html
<div class="terminal">
  <div class="terminal__tag"><span>PROMPT</span><span>示例</span></div>
  <pre class="terminal__cmd"><span class="terminal__user">你：</span>帮我写一份…
<span class="terminal__system">AI：</span>好的，分三段…
<span class="terminal__hint"># 提示：可继续追问</span></pre>
</div>
```

## 16 · formula5 公式行（编号 + 名 + 释义）

```html
<div class="formula5">
  <div class="formula5__row"><div class="formula5__n">1</div><div class="formula5__k">要素名</div><div class="formula5__v">斜体释义。</div></div>
  <div class="formula5__row"><div class="formula5__n">2</div><div class="formula5__k">要素名</div><div class="formula5__v">…</div></div>
</div>
```

## 17 · bigq 装框大引用

```html
<div class="bigq"><p class="bigq__t">一句<em>金句</em>。</p><div class="bigq__sub">出处 / 注脚</div></div>
```

## 18 · summary 总结三栏（收束页）

```html
<div class="summary">
  <div class="sum-card sum-card--v"><div class="sum-card__k">一</div><div class="sum-card__v">关键词</div><div class="sum-card__hint">一句话。</div></div>
  <div class="sum-card sum-card--n">…</div>
  <div class="sum-card sum-card--g">…</div>
</div>
```

---

## 20 · 参考文献页（学术场景收尾 · v1.0.1 加）

末尾 1–2 张。文献多用两列 small 字号；`*斜体*` = 刊名；`[作者 年份]` 与正文 `.cite` 呼应。

```html
<section data-seg="6" data-segname="段 6 · 落点" data-title="参考文献" class="slide">
  <div class="head"><div class="eyebrow head__eyebrow">References · 全部真实可溯（DOI 见讲稿）</div>
    <h2 class="title head__title" style="font-size:52px;">参考文献</h2></div>
  <div class="fill"><div class="row" style="gap:48px;font-size:18px;line-height:1.5;color:var(--ink-2);">
    <div class="col" style="flex:1;gap:10px;">
      <div>Luo et al. (2019). <em>Marketing Science</em>.</div>
      <div>Longoni, Bonezzi &amp; Morewedge (2019). <em>JCR</em>.</div>
      <!-- … 左列 … -->
    </div>
    <div class="col" style="flex:1;gap:10px;">
      <div>Cheng et al. (2026). <em>Science</em>.</div>
      <div style="color:var(--ink-4);">自有研究 · 进行中，仅讲内容。</div>
      <!-- … 右列 … -->
    </div>
  </div></div>
</section>
```
> 一页放不下就拆两页（标题加"参考文献 ①／②"）。条目多时字号降到 16–18px、`gap` 收到 8–10px。

## 21 · figure 图（学术主力 · 概念模型 / 图表 + 编号图注）

```html
<div class="figure">
  <div class="figure__frame"><!-- <img src> 或内联 <svg>（模型图），自动居中等比缩放 --></div>
  <div class="figure__cap"><b>图 1</b>图注正文。</div>
  <div class="figure__src">来源 / 注：N = 412。</div>
</div>
```
一行两图：外层加 `figure--row`，里面放两个 `figure__frame`。概念模型图（X→M→Y / 调节）可抄 `gallery/academic.html` 第 5 张的现成 SVG。详见 `skins/academic.md`。

## 22 · table-cap 表标题 + bullets 论点清单 + refs 参考文献（学术）

```html
<!-- 表标题放表上方 -->
<div class="table-cap"><b>表 1</b>表标题。</div>
<table class="table">…（数字列加 class="num"；强调行 class="hl"）…</table>

<!-- 论点清单（≤6 条，可带次级）-->
<ul class="bullets">
  <li>一句论点，<b>关键词</b>。<ul><li>次级要点。</li></ul></li>
</ul>

<!-- 参考文献：编号 + 悬挂缩进 + 刊名斜体（两列；一列用 refs--1col）-->
<ol class="refs"><li>Author, A. (2019). Title. <em>Journal</em>, 46(4), 629–650.</li></ol>
```
杂志皮也提供 `.figure / .bullets` 兜底；`.table-cap / .refs` 主要给学术皮。

## 19 · 小零件（穿插用）

```html
<div class="callout">侧重提示（朱红左条）。</div>
<div class="note-box">补充框（朱红淡底）。</div>
<div class="eyebrow">MONO 大写标签</div>
<span class="cite">[作者 年份]</span>      <!-- 引用出处，挂在数据/论断旁 -->
<em>强调词</em>                           <!-- 朱红衬线斜体 -->
<strong>加重词</strong>
<!-- 间距：mt-s / mt-m / mt-l ；布局：row（横）/ col（竖）/ center（居中）-->
```

---

## keyline 关键句（把一句话钉在屏上 · 金句锚点 · keynote-dark v1.3.1）

```html
<div class="keyline">一句你想<em>钉住</em>的话。</div>
<div class="keyline keyline--sm">长一点的关键句用 --sm。</div>
<!-- 放进 insight 页会自动居中（.insight .keyline）。<em> = 琥珀点睛词。 -->
```

浅蓝方框 + 琥珀强调。**静态常显**；逐字打字机 + 呼吸灯属可选动画层（引擎注入，见 KeynoteSpeech `03-references/keynote-stagecraft-pattern.md`），皮肤只给静态方框。目前主要给 **keynote-dark**。

---

## 排版纪律（红线）

- **一页一件事**。撑不下就拆两页（演讲者模式会把它们映射到讲稿同一段，不影响讲）。
- **强调克制**：一页里 `<em>` 一般只点 1-2 处；满屏朱红 = 没有重点。
- **引用上桌但不抢戏**：`[作者 年份]` 用 `.cite` 小灰字挂在数据/论断旁；末尾另起 1-2 张"参考文献"页（用 `numlist--lg` 或 `small`）。
- **secdiv 开每段**：让听众随时知道"在第几章"。
- **数据优先用 bignum/insight**，别埋在正文里——大数字是这套风格最抓眼的武器。

---

## 新版式（P4 · 移植自 html-ppt-skill · 在薄皮 `_components.css` 里，21 皮通用）

> 仅薄皮（dracula/swiss-grid/… 21 张里的 14 薄皮）自带；原生 7 厚皮如需可单独补。预览 `gallery/layout-showcase.html`（按 O 看全部）。

- **kpi-grid 指标卡**：`<div class="kpis">`（`kpis--3/--2`）内 `<div class="kpi"><div class="kpi__k">标签</div><div class="kpi__v num">2.4M</div><div class="kpi__d up">18%</div><div class="kpi__hint">注</div></div>`（`kpi__d up/down` 自动 ▲▼ + 绿/粉色）。
- **vs 对比面板**：`<div class="vs">` = `vs__pane vs__pane--a`（✕ 红）+ `vs__mid`（VS）+ `vs__pane vs__pane--b`（✓ 绿）；内 `vs__title` + `vs__list>li`。
- **timeline 时间线**：`<div class="timeline">` 内若干 `<div class="tl"><div class="tl__date">Q1</div><div class="tl__title">…</div><div class="tl__desc">…</div></div>`（CSS 横线 + 圆点，自动均分）。
- **gantt 甘特**：`<div class="gantt">` 内 `gantt__row` = `gantt__label` + `gantt__track>div.gantt__bar`（条用内联 `style="left:20%;width:30%"` 定位；`b2/b3` 换色）。
- **roadmap 路线图**：`<div class="roadmap">` 四列 `rm` / `rm--next` / `rm--later` / `rm--vision`，内 `rm__k` + `rm__list>li`。
- **diff 增删**：`<div class="diff">` 内 `<span class="diff__add">…</span>` / `diff__del`（删除线）/ `diff__ctx`（上下文）。
- **mindmap 思维导图**：`<div class="mindmap">` 内一张 `<svg viewBox="0 0 100 56" preserveAspectRatio="none">` 画 `<line style="stroke:var(--rule);vector-effect:non-scaling-stroke">` + 若干 `<div class="mm-node root|b2|b3" style="left:%;top:%">` 节点。
