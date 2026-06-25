# Slidesmith — 技术架构 (Architecture)

> 版本: 1.0 · 日期: 2026-06-24 · 状态: Draft
> 配套: [PRD.md](PRD.md) · [REQUIREMENTS-RESEARCH.md](REQUIREMENTS-RESEARCH.md) · [ROADMAP.md](ROADMAP.md)

---

## 1. 系统总览

```
                    ┌────────────────── AUTHORING ──────────────────┐
   AI agent ───────▶│  deck.md (Markdown + frontmatter)             │
   人类 ───────────▶│         或直接 deck.json (IR)                  │
                    └───────────────────┬───────────────────────────┘
                                        │  md→ir 解析
                                        ▼
                    ┌────────── CANONICAL: JSON IR (单一真相源) ──────────┐
                    │  { ir_version, theme, defaults, metadata, slides[] } │
                    │  ▲ 可校验(Zod/JSON Schema) · 稳定块 id · 版本化        │
                    └───────────────────┬─────────────────────┬──────────┘
        编辑器(回写 IR) ◀───────────────┘                     │  compile
        (实时预览+内联快编, v1.5/v2)                            ▼
                                        ┌──────────── RENDER ENGINE ──────────────┐
                                        │ IR + Theme(tokens/layouts/anim) → HTML   │
                                        │ + 锚点单一来源派生 + 字体子集内联         │
                                        └──┬───────────┬───────────────┬──────────┘
                                           ▼           ▼               ▼
                                     deck.html   transcript.html   presenter.html
                                   (单文件离线)   (同步逐字稿)      (演讲者视图)
                                           │                          ▲
                                           └── window.open()+postMessage+心跳 (双屏同步)
```

**三层心智模型**：
1. **Authoring**（人/AI 写的）= Markdown 或 JSON。
2. **Canonical**（系统的真相）= JSON IR。
3. **Artifacts**（产物）= 单文件 HTML（deck/transcript/presenter）+ 导出(PDF/PNG/PPTX)。

> 所有产物都是 IR 的"编译视图"，可随时从 IR 重生；编辑器只改 IR，不改产物。

---

## 2. 编译流水线 (Pipeline)

```
parse        validate      resolve            render            pack            emit
deck.md ──▶ IR ──▶ (Zod) ──▶ theme+layout ──▶ HTML 片段 ──▶ 内联CSS/字体/JS ──▶ *.html
deck.json ─┘                 锚点派生           动画属性          + 校验 lint
```
- **parse**: Markdown → IR（或直接读 IR）。
- **validate**: Zod 校验 IR；锚点唯一性、slot 契约、token 引用合法性。
- **resolve**: 解析主题 tokens → CSS 变量；layout → slot 容器；继承默认。
- **render**: IR 每页 → HTML 片段（块按 layout 落 slot；动画 → `data-anim*`）。
- **pack**: 内联 core.css + theme.css + engine.js + 子集字体(base64)；产单文件。
- **emit**: 写 deck/transcript/presenter；跑产物 lint。

---

## 3. IR Schema v1（核心产物）

> IR 是整个系统的"承重墙"。原则：内容块带稳定 id；样式只用**符号 token 引用**（绝不内联 hex/CSS）；主题是独立产物。

### 3.1 顶层结构
```jsonc
{
  "ir_version": "1.0",
  "theme": "editorial",                 // 具名主题，解析 tokens+layouts+fonts+anim默认
  "defaults": {                          // deck 级默认，页/块可覆盖(继承式)
    "transition": "fade",
    "layout": "bullets",
    "lang": "zh"
  },
  "metadata": {
    "title": "标题", "author": "", "date": "2026-06-24",
    "channel": "deck-xxx"                // 演讲者同步频道名(自动生成)
  },
  "slides": [ /* SlideNode[] */ ]
}
```

### 3.2 SlideNode
```jsonc
{
  "id": "s1",                            // 稳定 id：AI 与编辑器寻址同一实体的依据
  "seg": "1",                            // 段分组(驱动段导航/缩略图)，可选
  "segName": "段1 · 论证",               // 段名，可选
  "layout": "two-col",                  // 具名 layout（决定 slot 契约）
  "transition": "auto-animate",         // 页间过渡，可覆盖 deck 默认
  "classRefs": ["lead"],                // 符号化布局变体(à la Marp _class)，可选
  "notes": "这页对应的逐字稿正文…",       // → 生成 transcript + 演讲者提词
  "slots": {                             // key=slot名(由 layout 定义)
    "left":  [ /* Block[] */ ],
    "right": [ /* Block[] */ ]
  }
}
```
> **锚点派生**：引擎从 `slides[].id`（及细分块）派生唯一锚点数组（如 `['s1','s2',…]`），slides/transcript/presenter 三处全部引用此**同一派生结果** → 彻底消除手工三处同步。

### 3.3 Block（封闭词汇表）
```jsonc
{
  "id": "b1",
  "type": "heading",                    // heading|text|list|image|code|chart|table|quote|embed|group
  "text": "Q4 业绩",                     // 各 type 的 payload 字段不同(见下)
  "level": 1,
  "style": { "color": "accent", "size": "display" },  // 只用 token 名，不写 #hex/px
  "build": { "mode": "by-item", "anim": "rise", "delay": 0, "stagger": 80 }, // 动画/分步
  "dataId": "rev"                       // 跨页 auto-animate/morph 的配对键，可选
}
```
**各 type 的 payload（v1）**：
| type | 关键字段 |
|---|---|
| `heading` | `text`, `level(1-3)` |
| `text` | `text`(支持行内 `**强调**`→`<strong>` 用于提词) |
| `list` | `items[]`, `ordered?` |
| `image` | `src`, `alt`, `fit?` |
| `code` | `code`, `lang` |
| `chart` | `chartType`, `data`, (轻量内置或留扩展点) |
| `table` | `headers[]`, `rows[][]` |
| `quote` | `text`, `cite?` |
| `embed` | `html`(白名单)/`iframe` |
| `group` | `children[]`(嵌套块，做卡片/网格) |

**讲稿块**（transcript 专属，存于 `notes` 的结构化扩展或独立 `noteBlocks`）：`cue`(讲法提示)/`golden`(金句)/`data`(数据)，继承 transcripts_html 语义。

### 3.4 校验规则（Zod）
- `ir_version` 必填且受支持。
- 每个 `slide.id`、`block.id` 全局唯一。
- `slide.layout` 必须是已注册 layout；`slots` 的 key 必须 ⊆ 该 layout 的 slot 契约。
- `style` 的 token 名必须存在于主题；`build.anim` 必须是已注册动画。
- `dataId` 配对：跨页同 `dataId` 的块用于 morph。

---

## 4. Markdown Authoring 格式 → IR

> 人体工学优先；编译进 IR。设计目标：AI 写起来短、人读起来顺、可无歧义映射 IR。

```markdown
---
theme: editorial
title: 标题
defaults:
  layout: bullets
  transition: fade
---

# 封面标题            <!-- layout 由 frontmatter/页内指令决定 -->
::: layout cover
::: note 封面对应的讲稿。这里可以用 **关键词** 提词。

---                  <!-- 分页 -->

::: layout two-col
::: slot left
## 左栏标题
- 要点一
- 要点二
::: slot right
![图](img.png)
::: note 这页讲稿…
:::cue 讲法提示(不念)
:::golden 想让全场记住的一句
```
- `---` (frontmatter) → deck 级。
- `---` (空行分隔) → 分页。
- `::: layout X` / `::: slot Y` → layout 与 slot 归属。
- `::: note / :::cue / :::golden / :::data` → 讲稿与讲稿块。
- 标准 Markdown 元素 → 对应 Block（`#`→heading、`-`→list、`![]`→image、代码块→code、`>`→quote、表格→table）。
- 行内 `**x**` → `<strong>`（同时是提词高亮目标）。

> Markdown 仅作 authoring/import/export；**JSON IR 才是 canonical**。可视化编辑回写 IR（必要时由 IR 反向生成 MD 供 git diff）。

---

## 5. 主题系统 (Theme)

一个主题 = 一个目录：
```
themes/editorial/
  tokens.json        # DTCG 设计 token（颜色/字体/字号阶/间距/行高）
  theme.css          # tokens→:root{--…} + 组件 class 契约(.cover/.head/.title/...)
  layouts/           # 该主题下具名 layout 的 slot 容器 + 布局 CSS
  anim.json          # 动画默认
  fonts/             # 可子集化字体(SIL OFL)；标题字内联，正文走系统栈
```
- **token 两层**：primitives(原色/原尺寸) → semantic(`bg/surface/ink/muted/accent/accent-fg/link/border`、`font-display/body/mono/cjk`、字号阶、间距)。
- **继承式**：块不设的 style 走主题 semantic 默认（à la OOXML 不设值即继承）。
- **运行时切换**：换主题 = 换一组 CSS 变量 + layout CSS（继承 html-ppt `T` 键体验，但语义化、可锁定）。
- **class 契约**：所有主题共享同一组组件 class（`.cover/.cover__title/.secdiv/.head/.title/.lead/.body/...`，继承 editorial-slides），保证换肤不改结构。
- **首批主题**：`editorial`(默认)、`academic`、`keynote-dark`（移植现有 skin），+ 1–2 个 html-ppt 对照风格。

### CJK 排版要点（写入 core.css / theme.css）
- 正文系统字体栈零下载：`system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`。
- 标题：子集化内联思源宋/黑 或 霞鹜文楷（OFL）。
- `text-autospace`(中西文间距) + `text-spacing-trim`(标点挤压) + CJK 行高 ~1.6–1.8 + `word-break: normal`。

---

## 6. 动画模型 (Animation)

- **声明式**：块的 `build` → 渲染成 `data-anim`/`data-anim-delay`/`data-anim-stagger` 属性（AOS 式约定，AI 易发）。
- **页内运行时**（~50 行）：进入页时扫描属性 → 建 `gsap.timeline()`（GSAP v3.13+ 免费许可，UMD 内联）。
- **页间**：`transition: auto-animate` → 优先 View Transitions API（同 `dataId` 的块做 FLIP morph）；不支持则回退 CSS 淡入。
- **v1 内置动画(克制)**：`fade / rise / stagger-list / counter-up / auto-animate(morph)`。Canvas FX(粒子等) 留 v3。
- **低性能回退**：`B` 键关动画（继承 guizang）。
- 备选：若坚持全 MIT 依赖，GSAP→Motion(motion.dev, 2.3KB)。

---

## 7. 锚点协议（单一来源，修正现有痛点）

```
IR.slides[].id  ──(引擎派生)──▶  ANCHORS = ['s1','s2','s2a',...]
                                   │
        ┌──────────────┬──────────┴───────────┐
        ▼              ▼                        ▼
  deck: window.       transcript:           presenter:
  __ANCHORS__         <h3 id="s1">…         读取 deck.__ANCHORS__
  (注入)              (渲染时按同序生成)     (不再本地硬编码)
```
- 引擎在渲染时把派生锚点数组**一次性注入** deck，transcript 按同序生成 `id`，presenter **从 deck 读取**而非本地再维护一份。
- 插入/重排页面 → 重新 `build` → 三处自动一致。**消灭手工同步**。

---

## 8. 演讲者模式 / 双屏同步

> 关键约束：单文件 `file://` 跨两屏，BroadcastChannel/localStorage 失效。主通道必须用窗口引用 `postMessage`。

```
主屏 deck.html ──按键 S──▶ window.open(presenter.html)  (保留子窗口引用)
   │  每次翻页:  child.postMessage({type:'state', idx, anchor, source:'deck'})
   │  ~1s 心跳:  child.postMessage({type:'ping'})  ← 断线/重载自恢复
   ▼
副屏 presenter.html
   │  握手: connect → connected
   │  收 state → iframe(transcript) postMessage{type:'scroll', anchor} → 滚动+整块高亮
   │  body.cue-on → 关键词(<strong>)提词
   │  反向: 副屏按键/TOC点击 → opener.postMessage({type:'jump', idx, source:'presenter'})
   └  source 字段防回声：只处理 source≠自己的消息
```
- **transcript 高亮**：从锚点元素 `nextElementSibling` 遍历到下一锚点，整块加 `.presenter-block-current`；`box-shadow` 画外侧金条不占布局（继承现有实现）。
- **第二屏落位**：`getScreenDetails()`+`requestFullscreen({screen})`（Chrome/Edge，特性检测 + 手动回退）。
- **http(s) 增强**：此时可加 BroadcastChannel/localStorage 作多设备/状态恢复，非主通道。

---

## 9. 单文件打包 (Packaging)

`deck.html` 内联：`<style>`(core.css + theme.css) + `<script>`(engine.js + gsap UMD + 动画运行时) + base64 子集字体 + `window.__IR__`(可选，便于编辑器/重渲染) + slides HTML。
- 默认完全离线自足。
- 可选 `--mode online` 用 CDN/大字体 + unicode-range 切片（大 deck）。
- 体积预算：标题字子集 + 系统正文 → 单文件目标 < 400KB（不含用户大图）。

---

## 10. CLI 设计

```
slidesmith new <name>                         # 脚手架 deck.md 模板
slidesmith build <deck.md|deck.json> \         # 产 deck/transcript/presenter
          [--theme editorial] [--out dist/] [--mode offline|online]
slidesmith validate <deck>                     # 校验 IR + 产物 lint
slidesmith export <deck> --format pdf|png      # Playwright headless
slidesmith edit <deck.json>                    # 起实时预览编辑器 (v1.5/v2)
# Agent 友好: 支持 --json stdin/stdout；机器可读错误 + 退出码
echo '<IR json>' | slidesmith build --stdin --out dist/
```

---

## 11. 编辑器架构（v1.5/v2）

- **栈**：Node/TS + 轻量前端（Vite + 原生/轻框架）。
- **canonical = JSON IR**：编辑器读 IR → 渲染预览（复用同一 render engine）→ 改动回写 IR。
- **块编辑**：Editor.js（扁平 blocks ≈ 我们的块数组，映射最干净）或 TipTap/Lexical（schema 强校验）。决策见 ROADMAP M5。
- **能力(v1 面)**：实时预览热重载、点选改文字、面板换主题/当前页 layout/动画、改 token。
- **能力(v2)**：拖拽/缩放、per-element 样式面板、`v-drag` 式定位回写。

---

## 12. 仓库 / 模块布局（建议）

```
presentsystems/
  package.json                # Node/TS workspace
  docs/                       # 本批文档
  _memory/                    # 项目记忆系统
  packages/
    ir/                       # IR 类型 + Zod schema + 校验
    parser-md/                # Markdown → IR
    engine/                   # IR + theme → HTML 片段(渲染核心)
    runtime/                  # 浏览器内: 导航/缩放/动画/演讲者同步(engine.js)
    themes/                   # 内置主题(editorial/academic/keynote-dark/...)
    cli/                      # slidesmith CLI
    editor/                   # 实时预览 + 内联快编 (v1.5/v2)
    qa/                       # 产物校验 lint
  examples/                   # 样例 deck.md / deck.json + 产物
  tests/
```

---

## 13. 技术选型与依赖
| 关注点 | 选择 | 备注 |
|---|---|---|
| 语言/栈 | Node.js + TypeScript | D2 已定 |
| 校验 | Zod (+ 可导出 JSON Schema) | IR 校验 + AI 输出校验 |
| Markdown | remark/markdown-it + 自定义指令 | `:::` 容器语法 |
| 动画 | GSAP v3.13+ (免费) + View Transitions | 备选 Motion(MIT) |
| 导出 | Playwright | PDF/PNG headless |
| 字体子集 | cn-font-split / fontmin / pyftsubset | 标题内联 |
| 编辑器块 | Editor.js 或 TipTap/Lexical | M5 决策 |
| 主题 token | DTCG JSON + 自写解析(或 Style Dictionary v4) | → :root 变量 |
| 测试 | vitest + Playwright | 单元 + 产物 |

许可证基线：GSAP No-Charge / 其余 MIT / 字体 SIL OFL —— 可商用再分发。
