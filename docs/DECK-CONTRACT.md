# Deck 契约 (Deck Contract) v0.1

> Slidesmith v2 是 **HTML-first**:**契约 HTML deck 本身就是真相源**。
> 这份文档是两类读者的共同标准:
> - **AI(生成方)**:照此生成 deck,产出的 HTML 才能被 Studio 导入、就地编辑、走 AI 回路、导出。
> - **导入器(Studio/工具)**:依赖这些"硬钩子"解析出 页 / 令牌 / 可编辑节点。
>
> 原则:**结构紧、内容松** —— 钩子与令牌严格(保证可编辑/可换肤/可导航),版式与内容自由(保住设计发挥)。
> golden 样例:`docs/style-reference/keynote-target.html`(36 页,实测符合本契约)。

---

## 0. 一眼记住(MUST 清单)

一个合规 deck = **单文件 HTML**,且满足:

1. **每页一个** `<section class="slide ...">`,全部在一个容器 `<div class="deck" id="deck">` 里。
2. 每页带元数据钩子:`data-title`(必填) · `data-seg`/`data-segname`(分段,可选但强烈建议) · `data-id`(稳定唯一 id,**给增量编辑/Submit-to-AI 定位用**)。
3. **固定画布 1920×1080**:`.slide{width:1920px;height:1080px;...}`,整体用 `--fit-scale` 缩放显示。
4. **设计令牌集中在 `:root`**(颜色/字体/字号阶/留白),换肤=切 `data-theme` 或换一组 `:root`。
5. **离线可移植**:不内联编辑器/外部依赖;字体可在线加载但必须有系统回退栈。

> 满足 1–2 即可被**导入显示**(N1);满足 3–4 才能享受**换肤 / 样式微调**(N2)。

---

## 1. 骨架模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>演示标题</title>
<!-- 字体:在线加载 + 系统回退(离线不崩) -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...&display=swap">
<style>
  :root{
    /* —— 设计令牌:换肤只改这里 —— */
    --paper:#0C0D11; --ink:#F5F6F8; --ink-2:#C2C6D0;
    --accent:#F4B73E; --accent-2:#D99828; --accent-soft:rgba(244,183,62,.15);
    --t-display:168px; --t-h1:108px; --t-h2:76px; --t-body:32px;  /* 字号阶 */
    --pad-x:130px; --pad-y:96px; --fit-scale:0.55;
    --font-display:"Space Grotesk","Noto Sans SC",sans-serif;
    --font-sans:"Inter","Noto Sans SC",sans-serif;
  }
  /* (可选)多套配色:换肤切 data-theme */
  :root[data-theme="light"]{ --paper:#F5F0E8; --ink:#1A1A1A; /* … */ }

  *{box-sizing:border-box}
  .deck{display:flex;flex-direction:column;gap:32px;align-items:center;}
  .slide{width:1920px;height:1080px;background:var(--paper);color:var(--ink);
         padding:var(--pad-y) var(--pad-x);overflow:hidden;
         transform:scale(var(--fit-scale));transform-origin:top left;}
  /* —— 排版工具类原子(走令牌,别内联硬值)—— */
  .eyebrow{font-size:20px;letter-spacing:.26em;color:var(--accent);text-transform:uppercase;}
  .title{font-family:var(--font-display);font-size:var(--t-h2);color:var(--ink);}
  .body{font-size:var(--t-body);line-height:1.6;color:var(--ink-2);}
</style>
</head>
<body>
<div class="deck" id="deck">

  <section class="slide cover" data-id="s1" data-seg="0" data-segname="段 0 · 引入" data-title="封面标题">
    <div class="eyebrow">EYEBROW / 副标</div>
    <h1 class="title">主标题</h1>
    <p class="body">一句副标。</p>
  </section>

  <section class="slide" data-id="s2" data-seg="1" data-segname="段 1 · 主体" data-title="某页">
    <!-- 内容自由:任意 HTML/SVG/卡片/图表,但样式尽量走类 + 令牌 -->
  </section>

</div>

<!-- 顺序表(可选,给演讲者副屏锚点用):与 .slide 顺序一一对应 -->
<script>window.SLIDE_MAP=["s1","s2"];</script>

<!-- 引擎注入点:Slidesmith 在此注入运行时(翻页/段导航/缩略图/投屏/演讲者)。
     自带引擎亦可,但注入点存在时由 Slidesmith 统一接管。 -->
<!-- @slidesmith:engine -->
</body>
</html>
```

---

## 2. 逐项规范

### 2.1 页 `<section class="slide">`
- **必须**在 `#deck` 容器内;每页一个 `<section>`,class 含 `slide`。
- 变体类自由:`class="slide cover"`、`class="slide manifesto"` 等——变体只影响视觉,不影响解析。
- 钩子属性:
  | 属性 | 必填 | 用途 |
  |---|---|---|
  | `data-id` | 建议 | 稳定唯一 id;增量编辑 / Submit-to-AI **按此定位整页替换** |
  | `data-title` | **是** | 段导航 / 缩略图 / 演讲者副屏标题 |
  | `data-seg` | 建议 | 段序号(整数);驱动分段导航 |
  | `data-segname` | 建议 | 段名(如「段 1 · 理论脉络」) |
- 缺 `data-id` 时导入器按顺序回退用 `SLIDE_MAP[i]` 或自动 `s{i}`;但**增量编辑要求稳定 id**,务必带上。

### 2.2 设计令牌(`:root`)
- 颜色:`--paper`(底) `--ink`/`--ink-2`(字) `--accent`/`--accent-2`/`--accent-soft`(强调)。
- 字号阶:`--t-display --t-h1 --t-h2 --t-h3 --t-body --t-small` 等。
- 留白/缩放:`--pad-x --pad-y --fit-scale`。
- 字体栈:`--font-display --font-sans`(含系统回退)。
- **换肤** = 提供多组 `:root[data-theme="x"]`,切 `<html data-theme>` 即换;或整组替换 `:root`。
- 🚫 **别在内容里内联硬写 `color:#xxx`/`font-size:NNpx`**——否则换肤/样式微调对它无效。需要时定义一个工具类。

### 2.3 排版工具类原子(SHOULD)
- 用 `.eyebrow / .title / .lead / .body / .cards / .card / .callout / .keyline` 这类语义类承载样式。
- 好处:Studio 检查器能识别可调元素;换肤只改令牌即可整体生效。

### 2.4 动效(声明式)
- 入场:元素加 `data-anim="fade|rise|stagger-list|pop|in-left|in-right|counter-up"`(可选 `data-anim-delay`/`-stagger`)。
- 持续:`data-motion="glow|breathe|float|pulse|neon|stress"`。
- 关键帧由注入的引擎提供;放映按 `B` 关、尊重 `prefers-reduced-motion`。

### 2.5 讲稿 / notes(可选,供 transcript/presenter 派生)
- 每页可带一个隐藏讲稿块:`<script type="application/slidesmith-notes">…</script>` 或 `<template class="sm-notes">…</template>`(择一,导入器两者皆认)。
- 结构:正文(可 `**关键词**` 提词) + 可选 `cue`(讲法)/`golden`(金句)/`data`(数据)条目。

### 2.6 引擎注入点
- 在 `</body>` 前放注释标记 `<!-- @slidesmith:engine -->`。
- Slidesmith 导入/导出时在此注入统一运行时(段导航/缩略图/翻页/进度/投屏/双屏演讲者)。
- deck 自带引擎也可(如 keynote.html),但有注入点时 Slidesmith 接管,保证演讲者/导出/视觉自检一致。

### 2.7 编辑钩子(Studio 自动加,生成方无需操心)
- 导入后 Studio 给文本节点挂 `contenteditable` + 选中态;按 `data-id` 把改动写回对应 `<section>`。
- 生成方只要遵守 2.1–2.3,编辑能力就能开到最大(改字 / 字号色重 / 换肤 / 动效)。

---

## 3. 合规层级(Conformance)

| 层级 | 满足 | 能享受的能力 |
|---|---|---|
| **L1 可显示** | §0 的 1–2(`#deck` + `.slide` + data-title) | 导入 Studio,翻页/段导航/缩略图/导出 HTML 原样 |
| **L2 可换肤+微调** | + 3–4(1920×1080 + `:root` 令牌 + 工具类) | 换肤、选中元素调字号/颜色/对齐、加基础动效 |
| **L3 可全回路** | + `data-id` 稳定 + notes + 引擎注入点 | 增量编辑、Submit-to-AI 按页替换、演讲者/讲稿/PDF/视觉自检 |

> AI 生成时**目标 L3**;导入任意第三方 HTML 至少要 L1 才能用本工具。

---

## 4. 给 AI 的一句话

> 生成 deck 时:**所有颜色/字号走 `:root` 令牌 + 工具类(别内联硬值);每页 `<section class="slide" data-id data-seg data-segname data-title>` 放进 `#deck`;`</body>` 前留 `<!-- @slidesmith:engine -->`。** 内容、版式、配图随你发挥。
