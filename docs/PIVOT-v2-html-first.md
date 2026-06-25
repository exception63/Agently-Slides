# Slidesmith v2 — HTML-first 改造蓝图

> 日期: 2026-06-24 · 状态: 已定向(用户拍板),待 N1 启动
> 配套: [PRD.md](PRD.md)(v1,部分支柱被本次反转) · [ROADMAP.md](ROADMAP.md) · 契约样例 = `docs/style-reference/keynote-target.html`

---

## 0. 一句话定位(v2)

> 从"用数据(IR)**生成** slides 的生成器" → 转为"把 AI 生成的(**遵循契约的**)HTML deck **变成可视化编辑 + AI 回路 + 可导出**的编辑器 / 增强器"。
>
> **AI 负责生成精致 HTML;人类在 Studio 里就地精修;复杂改动走 Submit-to-AI 回路。**

依据(2026-06-24 调研):同目录 6 个兄弟项目**无一**能"生成后再编辑"(全是一次性生成器;仅 huashu 有个调参 Tweaks 面板)。"把 AI 生成的 HTML 变可编辑"是真实空白。用户的 `keynote.html`(36 页、令牌化、工具类、data 钩子、SLIDE_MAP、一键换肤)已是成熟的"契约样例"。

---

## 1. 两个已定决策(本次拍板)

| 决策 | 选择 | 含义 |
|---|---|---|
| 改造幅度 | **彻底转向 HTML-first** | 契约 HTML deck = 真相源;IR 生成管线退役/降级。引擎/视觉自检/导出/Studio 外壳全部保留复用 |
| 编辑契约 | **按契约生成** | AI 照 `keynote.html` 结构生成;编辑器据此能改 文字/字号色重/换肤/动效/版式/顺序,且导入稳定 |

> ⚠️ 这反转了 v1 PRD 的第一支柱(演示即数据 / IR 唯一真相)。是有意识的反转:AI 的强项是"千页千面的精致 HTML",IR 的固定 8 布局/3 主题反而是束缚。

---

## 2. 架构反转

```
v1 (旧):  Markdown / JSON-IR  ──(engine 渲染)──▶  HTML deck (派生物)
v2 (新):  AI 照契约生成 HTML deck  ──(Studio 导入+增强)──▶  就地编辑  ──▶  导出 HTML
                    ▲ 真相源就是这份 HTML                         │
                    └──────────── 复杂改动: Submit-to-AI 回路 ◀────┘
```

- **真相源**: 从 JSON IR → **契约 HTML deck 本身**。
- 我们不再"渲染",而是 **导入 → 增强(注入编辑层 + 引擎/运行时) → 编辑 → 导出**。
- 仅抽取一个**轻量结构视图**(slides[] / tokens / 可编辑节点 / 动效钩子)来驱动编辑器 UI——它是"视图",不是"真相"。

### 复用 / 改变 / 退役

- **保留(≈60% 资产)**: 运行时引擎(翻页/段导航/缩略图/进度/投屏/双屏演讲者/讲稿同步) · **M8 视觉自检**(本就作用于渲染后 HTML,现在更核心) · PDF/PNG 导出 · Studio 单文件浏览器外壳 · keynote 令牌系统 + 中文排版 · design-system 登记册。
- **改变**: Studio 从"由 IR 渲染预览"改为"导入真实 HTML 并增强"。
- **退役/降级**: `parser-md`、严格 IR Zod schema、IR→HTML 渲染器 → 降为"可选生成入口"或归档(代码留存,不在主路径)。现有 IR 样例可一次性转成契约 HTML 作起步模板。

---

## 3. Deck 契约(AI 照此生成 · keynote.html + 编辑附录)

**原则:结构紧、内容松** —— 钩子与令牌严格(保证可编辑/可换肤/可导航),版式与内容自由(保住 AI 的设计发挥)。

契约必备项(取自 keynote.html 实测结构):
1. **单文件 / 离线 / 1920×1080 固定画布**,`--fit-scale` 缩放。
2. **设计令牌全在 `:root`**(`--paper --ink --accent` + 字体栈 + 字号阶 `--t-*` + `--pad-*`)。换肤 = 切 `data-theme`(dark/light/contrast)或换一组 `:root`。
3. **每页** `<section class="slide [变体]" data-id data-seg data-segname data-title>` + 顶层 `SLIDE_MAP` 顺序表。变体类自由(cover/manifesto/insight/...)。
4. **排版走工具类原子**(`.eyebrow .title .lead .body` ...),**禁止内联硬写 color/px**(否则换肤/微调失效)。
5. **动效声明式**: `data-anim`(入场)/`data-motion`(持续),关键帧在引擎,B 键关、尊重 reduced-motion。
6. **讲稿/notes 钩子**: 每页可带讲稿正文 + cue/golden/data,供 transcript/presenter 派生。
7. **引擎注入点**: 约定一个标记,Studio/构建在此注入运行时引擎 + 编辑层。
8. **编辑钩子(v2 新增)**: 可编辑文本节点 / 可调元素能被检查器识别(用工具类 + 必要时 `data-edit`),`data-id` 稳定供 Submit-to-AI 精确定位。

> N1 产出完整 `docs/DECK-CONTRACT.md`;`keynote.html` 作为第一个 golden 样例。

---

## 4. 里程碑(N1–N5,每步可演示)

### N1 — Deck 契约 + 导入器
- 写 `docs/DECK-CONTRACT.md`(令牌/版式类/.slide 钩子/动效/讲稿/编辑钩子/引擎注入点);keynote.html 当 golden 样例。
- Studio 新增"**导入 HTML deck**":认出契约 → 解析出页列表 + 令牌 + 可编辑节点 → 在 Studio 里显示(可翻页/段导航/缩略图)。
- **验收(demo)**: 把 keynote.html 拖进 Studio,正确显示 36 页 + 段导航 + 缩略图,不报错。

### N2 — 就地编辑器 v1(改字 + Tweaks + 导出)
- 文字: 点预览里任意标题/正文/要点直接改(contentEditable)→ 写回 HTML。
- Tweaks/检查器面板: ① 整套令牌(换肤 dark/light/contrast + 改主强调色) ② 选中元素字号/颜色/粗细/对齐(走工具类) ③ 基础入场动效(data-anim)。
- 导出: 编辑后的 HTML 存回单文件(可再导入)。
- **验收(demo)**: 导入 → 改 3 处文字 + 换强调色 + 给一页加逐条浮现 → 导出 → 双击新 HTML,改动都在、可投屏。**全程 0 调 AI**。

### N3 — Submit-to-AI 回路闭环(差异化核心)
- 每页一个"**Submit to AI**"窗格: 人写"这页想怎么改"(可多条)。
- 导出**修改请求文件**(deck 名 + 页 `data-id` + 该页当前 HTML 片段 + 指令 + 可选截图)。
- `AGENTS.md` 加契约/命令: AI 读请求文件 → **只重写那一页的 `<section class=slide>`** → 输出补丁 → 人在 Studio "应用补丁"或重新导入。
- **验收(demo)**: 选一页写"改成两栏对比、右边放图、整体更克制" → 导出请求 → AI 按文件改这一页 → 应用 → **只有那页变,别页和你之前的手改都没动**。

### N4 — 把套件接回导入的 deck
- 双屏演讲者 / 讲稿同步、PDF/PNG 导出、**M8 视觉自检** 接到导入的契约 deck 上(多为复用现有引擎)。
- **验收**: 导入 deck 后能一键出 PDF、能开双屏演讲者、能 `doctor` 自检。

### N5(可选)— 编辑体验升级
- 借鉴 **Open Design** 桌面: 图层/元素树、框选、对齐吸附;更多动效;设计系统生长(新令牌/版式沉淀进契约库)。

---

## 5. 借鉴来源

- **keynote.html** → Deck 契约 / 标准结构(你已成熟的那套)。
- **huashu-design Tweaks** → 调参/检查器面板(改令牌即时换肤,不重生成)。
- **Open Design.app**(`io.open-design.desktop` v0.9.0,Electron 桌面) → 画布 + 选中 + 检查器/图层 的编辑 UX。
- **Claude artifacts** → Submit-to-AI 的标注→文件→AI 应用→重导入回路。

---

## 6. 风险与化解

| 风险 | 化解 |
|---|---|
| 编辑任意 HTML 难 | 已选"按契约";N1 契约是命门——结构紧内容松 |
| 契约太松 AI 不守 / 太紧限制 AI | 钩子+令牌严格,版式+内容自由;几轮 dogfood 调 |
| Submit-to-AI 应用补丁破坏别页 | 只允许替换整页 `<section data-id>`,按 id 定位 |
| keynote.html 由 python build.py 组装 | 它已是单文件成品,我们的引擎/编辑层注入兼容成品即可 |

---

## 7. 立即下一步

**N1**: 写 `DECK-CONTRACT.md` + 用 keynote.html 做导入器第一个验收样例。等"开始"即动手。
