---
name: transcripts_html
description: |
  做"杂志级（editorial）"风格的 HTML 讲稿 / 备课稿 · 中文 · 纸色底 + 朱红强调 + 宋体大标题 · 与 editorial-slides 同一套视觉语言。
  单文件、可移植、离线可用；自带"演讲者模式"钩子——每张 slide 对应讲稿一个唯一锚点，副屏翻页时整块高亮、Keywords 提词。
  内置三种讲师专用块：cue（讲法提示）/ golden（金句）/ data（数据）；以及段封面、TOC、原文引述。
  当用户说 "写讲稿 / 做讲稿 / 把讲稿做成 HTML / 备课稿 / 讲师稿 / transcript / 讲演稿 html / 给这套 slides 配讲稿" 时启用。
  这个 skill 负责"从内容生成成品讲稿 HTML"；要做 slides 是 editorial-slides；要把 slides 和讲稿接成双屏同步是 slides-presenter-mode。
metadata:
  version: 0.1.0
  status: dogfood-validated
  dogfood: 国企改革深化与现代企业制度建设 · 讲稿约 1.65 万字 · 49 锚点（2026-06-03）· 见 CHANGELOG
  pairs_with: [editorial-slides, slides-presenter-mode]
---

# transcripts_html · 杂志级 HTML 讲稿

> 从 `CoursesDevelopment/国企改革深化课程/讲稿.html`（49 锚点 · 约 1.65 万字 · dogfood 验证）抽象出来的可复用讲稿风格系统。
> 一句话：**用纯 HTML 做出"出版物级"的讲稿——纸色版面、宋体标题、朱红点睛、讲师专用块（讲法/金句/数据），并且出厂即带演讲者模式锚点与监听**。
> 它是 `editorial-slides` 的孪生兄弟：editorial-slides 做 slides，transcripts_html 做讲稿，两者用同一套色与字；`slides-presenter-mode` 把它俩接成翻页即同步的双屏。

---

## 何时用 / 不用

**用**：要为一场讲座 / 课程 / 主旨演讲写一份**讲师讲稿（备课稿）**，希望它既好读、又显专业，并且**天然能接演讲者模式**（翻 slide → 副屏讲稿自动跟随高亮）。

**不用**：
- 要做的是 slides（翻页演示）→ 用 **editorial-slides**。
- slides 和讲稿都已存在，只想把它们接成双屏同步 → 用 **slides-presenter-mode**。
- 要的是论文 / 正式公文 / Word 文档 → 用 doc / minimax-docx 等。

---

## 风格 DNA（与 editorial-slides 同源）

1. **纸色版面 + 朱红点睛**：暖米白底 `#F6F1E6`，强调色朱红 `#B5293A`，正文墨色。和 slides 同一套令牌，双屏并看不违和。
2. **宋体标题 + 衬线正文**：标题用 Playfair + 思源宋体，正文思源宋体 19px、行高 1.85 → 长稿耐读、出版物气质。
3. **讲师三件套块**：`cue`（讲法提示·"讲法 · …"，宣讲时不念）/ `golden`（金句·想让全场记住的一句）/ `data`（数据·朱红数字）。
4. **`<strong>` = 关键词，`<em>` = 朱红点睛**：strong 是 Keywords 提词高亮的目标（副屏按 K 只亮当前块的 strong）；em 句中点 1-2 处。
5. **段—节两级结构**：每段一个 `seg-cover`（第几章），每张 slide 一个 `h3.sub` 锚点块。
6. **出厂即演讲者就绪**：模板底部已烤进 v0.3 监听（整块高亮 + Keywords + 键盘/TOC 转发 + 反向同步查询）——你只管写正文。

---

## 工作流（5 步）

### Step 0 · 先要"锚点骨架"
确认：标题/讲者/场合；分几段（从 0 起）；**每段几张 slide、每张讲一件什么事**。
列一张表：`段号 | 锚点 id（sN-M）| 这张讲什么 | 引用`。
锚点 id 必须和 slides 的 `window.SLIDE_MAP`、副屏的 `SLIDE_MAP_LOCAL` **三处 1:1 一致、每个唯一**。
> 若 slides 已用 editorial-slides 做好，直接抄它的 `window.SLIDE_MAP` 当锚点清单——天然对齐。

### Step 1 · 复制模板
把 `assets/transcript-template.html` 复制到目标目录（如 `01-讲稿/讲稿.html`）。替换 4 个占位：
- `{{DOC_TITLE}}` 浏览器标题 · `{{KICKER}}` 抬头小字（如"备课讲稿 · 副屏同步版 · 约 N 字"）· `{{TITLE_HTML}}` 大标题（可含 `<em>`）· `{{META_HTML}}` 讲者/场合/依据 · `{{TOC_ITEMS}}` 目录条目。

### Step 2 · 写正文
在 `▼▼▼ … ▲▲▲` 之间，按骨架一段段写：
- 每段一个 `<section class="seg">`，内含 1 个 `.seg-cover`(id="seg-N") + 若干 `<h3 class="sub" id="sN-M">` 锚点块。
- 每张 slide = 一个 `h3.sub` + 其后正文（一整块）。块组件（cue/golden/data/callout/q）速查见 `references/components.md`。
- 字数节奏：口语稿约 **120–135 字/分钟**；2 小时课≈1.5 万字。slide 多则每块短一点。

### Step 3 · 本地校对（红线）
浏览器直接打开看：
- [ ] 每张 slide 都有**唯一**锚点 id，且与 SLIDE_MAP 完全一致（数量、顺序、拼写）
- [ ] 每段被 `<section class="seg">` 包住（否则整块高亮会越界串到下一段）
- [ ] `<strong>` 标在真正的关键词上（提词才有意义）；`<em>` 每块 1-2 处即可
- [ ] cue 是"讲法提示"、不是讲稿内容（宣讲时不念）；TOC 每段一条、href 指向 `#seg-N`

### Step 4 ·（接双屏）跑 slides-presenter-mode
若要现场副屏同步 → 见 `references/presenter-integration.md`：模板的监听已就绪，关键是**三处锚点对齐 + 频道名对齐**，再用 `slides-presenter-mode` 生成副屏 `演讲者模式.html`。

---

## 约定与红线

- ⛔ **每张 slide 一个唯一锚点 id**（`sN-M`）。多张共享 = 翻页跳回小节开头、同步失效。这是和 slides-presenter-mode 共享的头号红线。
- ⛔ **每段用 `<section class="seg">` 包住**。否则一段最后一块的"整块高亮"会沿 sibling 链串进下一段的段封面。
- ⛔ **三处锚点必须一致**：slides `window.SLIDE_MAP` ＝ 讲稿 `id="sN-M"` ＝ 副屏 `SLIDE_MAP_LOCAL`。改张数 = 三处同步改。
- ⛔ **`<strong>` 只标关键词**，别整段加粗——Keywords 提词靠它，满屏 strong = 提词失效。
- ⛔ **不删模板底部两段 `<script>`**（演讲者监听 + 键盘/TOC 转发）和那段演讲者 CSS。
- ⛔ **postMessage 的 type 名（`fuquan-scroll` 等）不要改**——它是副屏↔讲稿 iframe 的固定约定，和广播频道名是两回事。
- ✅ 离线可用：字体栈自带系统宋体/苹方 fallback。
- ✅ 单独阅读也正常：没被副屏嵌入时，转发脚本自动不生效，就是一份干净的备课稿。

---

## 文件清单

```
transcripts_html/
├── SKILL.md                          (本文件 · 路由 + 工作流 + 红线)
├── assets/
│   └── transcript-template.html      ⭐ 复制即用的讲稿骨架（全 CSS + 讲师块 + 演讲者监听 + 2 段示例）
├── references/
│   ├── components.md                 ⭐ 讲稿块组件速查（seg-cover / h3.sub 锚点 / cue / golden / data / callout / q / TOC）
│   └── presenter-integration.md      怎么和 editorial-slides + slides-presenter-mode 三方对齐（锚点 1:1 + 频道名）
├── examples/
│   └── lineage.md                    来源案例（国企改革深化课程讲稿 · 49 锚点）与抽象说明
└── CHANGELOG.md
```

---

## 三个 skill 怎么配合（课程交付流水线）

| skill | 产出 | 角色 |
|---|---|---|
| **editorial-slides** | `slides.html` | 做主屏 slides（杂志风 · 自带 `window.SLIDE_MAP` 锚点） |
| **transcripts_html** | `讲稿.html` | 做讲稿（同套视觉 · 锚点与 slides 1:1 · 监听就绪） |
| **slides-presenter-mode** | `演讲者模式.html` | 把上面两个接成翻页即同步的双屏 |

典型顺序：**editorial-slides → transcripts_html（抄 slides 的 SLIDE_MAP 当锚点）→ slides-presenter-mode（填副屏的 SLIDE_MAP_LOCAL + SCRIPT_BASE + SEG_NAMES + 对齐频道名）**。三处锚点同源，一气呵成。
