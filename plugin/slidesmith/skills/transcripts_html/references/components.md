# 讲稿块组件速查 · 复制即用

> 讲稿 = 若干 `<section class="seg">`，每段含 1 个段封面 + 若干 `h3.sub` 锚点块。
> 强调用 `<strong>`（关键词 · 提词目标）和 `<em>`（朱红点睛 · 每块 1-2 处）。

---

## 0 · 段的外壳（红线：每段必须包 section.seg）

```html
<section class="seg">
  <div class="seg-cover" id="seg-1"> … 段封面 … </div>
  <h3 class="sub" id="s1-1"> … </h3>  <p> … </p>
  <h3 class="sub" id="s1-2"> … </h3>  <p> … </p>
</section>
```
`<section class="seg">` 把这一段的所有块圈起来——保证"整块高亮"不会沿 sibling 链串进下一段。

---

## 1 · 段封面 seg-cover（讲稿里的"第几章"）

```html
<div class="seg-cover" id="seg-1">
  <div class="seg-n">段 1</div>
  <h2>第一章标题</h2>
  <p class="seg-lead">这一段的定调句——告诉听众在第几章、要解决什么。</p>
</div>
```
- `id="seg-N"`：供 TOC 跳转 + 演讲者模式反向同步（点目录 → slides 跳到该段第一张）。
- 注意 `seg-N` 不是 slide 锚点（不匹配 `^s\d`），不会被当成某张 slide。

---

## 2 · 子节锚点块 h3.sub（= 每张 slide）⭐ 核心

```html
<h3 class="sub" id="s1-2"><span class="slide-tag">SLIDE 04</span>这张 slide 的小标题</h3>
<p>对应这张 slide 的讲稿正文。一张 slide = 这个 h3 + 其后所有兄弟元素（到下一个 h3.sub 为止）= 一整块。</p>
```
- `id="sN-M"`：**必须唯一**，且与 slides 的 `window.SLIDE_MAP[i]` 一一对应。
- `slide-tag`：左侧深色小标签，标 slide 序号；想标红用 `class="slide-tag tag-v"`（金句/转折页常用）。
- 翻到这张 slide 时：h3 得红色脉冲边框（`presenter-current`），其后整块得浅红底+左红条（`presenter-block-current`）。

---

## 3 · cue 讲法提示（讲师备忘 · 宣讲时不念）

```html
<p class="cue">站定，不急着翻页。让封面停留三五秒，重音落在 em 上。</p>
```
自动前缀"讲法 · "，金色左条。用来写节奏 / 停顿 / 互动 / 学习理论备忘（Bandura / Kolb / Gollwitzer 等）。

---

## 4 · golden 金句（想让全场记住的一句）

```html
<div class="golden">
  <span class="gk">金句 · 本段落点</span>
  <p style="margin:0;">把<strong>核心论断</strong>用一句话钉下来。</p>
</div>
```
暖金渐变底 + 朱红左条。一段最多 1-2 个，多了不值钱。

---

## 5 · data 数据（朱红数字冲击）

```html
<div class="data">关键数据：某指标 <b>从 65% 降到 27%</b>（12 年）· 出处说明。</div>
```
`<b>` 内的数字自动 mono + 朱红。把硬数据从正文里拎出来，讲师一眼可见。

---

## 6 · callout 侧重提示

```html
<div class="callout">本章的<strong>主线</strong>是什么，请听众带着这根线往下听。</div>
```

## 7 · q 原文引述（句中 / 块中）

```html
<p>他原话是：<em class="q">"开董事会时他最怕大家不说话，但最后大家确实不说话。"</em></p>
```
朱红深色斜体衬线。引述别人原话、文件原文时用，和"自己的话"区分开。

---

## 8 · TOC 目录条目（每段一条 · 演讲者模式下点它联动 slides）

```html
<li><a href="#seg-1"><span class="n">段 1</span>第一章段名</a></li>
```
放进 `<nav class="toc-nav"><ol> … </ol></nav>`。href 指向 `#seg-N`；副屏会把点击反向广播，让 slides 跳到该段第一张。

---

## 排版纪律（红线）

- **一张 slide = 一块**：要点多就拆成多张 slide、多个 h3.sub，别把一块写成长篇。
- **strong 克制**：只标真正的关键词；它是 Keywords 提词的目标，满屏加粗 = 提词失效。
- **em 克制**：每块 1-2 处朱红点睛即可。
- **cue 不是讲稿**：它是给讲师看的节奏备忘，正式宣讲不念出来。
- **段必包 section.seg**：否则整块高亮越界。
