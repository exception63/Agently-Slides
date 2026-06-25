# 设计系统 · 皮肤架构 / 令牌 / 加一个皮肤

本 skill = **一套共用引擎 + 可换的皮肤（skin）**。理解这三层，就知道改什么、不改什么。

```
_engine.js   引擎逻辑（导航/缩略图/投屏/副屏）         —— 与风格无关，永远不动
_core.css    骨架 + 工具界面（topbar/段导航/进度条/投屏态）—— 与风格无关，只用令牌
skins/*.css  某个风格：:root 令牌 + 全部组件视觉            —— 风格的"灵魂"在这里
```
`build.py` 把「_core + 某个 skin + _engine + 你的 slides」缝成一个单文件 HTML（皮肤 CSS 内联，离线可用）。
**源是模块化的（联邦、各管一摊），输出是单文件（投屏即用）。**

---

## 皮肤必须定义的令牌（`_core.css` 会读这些）

每个 `skins/<名>.css` 的 `:root` 必须给出：

| 令牌 | 作用 |
|---|---|
| `--paper` / `--ink`（及 `--ink-2/3/4`） | slide 底色 / 文字四级 |
| `--accent` / `--accent-2` / `--accent-soft` | **主强调色** + 深一档 + 淡底；引擎界面（进度条/当前段/缩略框/主按钮）跟着它变 |
| `--accent-ui` | 段导航里"段 N"小标签在深色侧栏上的颜色（取个浅色） |
| `--rule`（及 `--rule-soft`） | 分隔线 |
| `--pad-x` / `--pad-y` | 版心内边距 |
| `--font-display` / `--font-sans` / `--font-mono`（按需 `--font-serif`） | 字体栈（都要含系统 fallback，离线不塌） |
| `--t-display … --t-eyebrow` | 字号阶梯（基于 1920×1080 画布） |

> 工具界面（顶栏/侧栏）固定深色、所有皮一致；只有强调色随 `--accent` 变——工具稳定、内容随皮变化。

---

## 改主题 vs. 换皮肤

- **同一风格里换个颜色** → 只改该皮 `:root` 的 `--accent` / 主色几个变量，版式不动（例：学术皮换墨绿/绛红，见 `skins/academic.md`）。
- **要的是另一种版式语言**（杂志 vs. 学术 vs. 极简）→ 那是**换皮肤**，不是改令牌。别想靠改 `:root` 把杂志风改成学术风——DNA 在组件 CSS 里，不在令牌里。

---

## 每个皮都要实现的"组件 class 契约"

引擎和 `components.md` 假设这些 class 存在，所以每个皮都要给它们样式（外观可不同）：
`.slide .head .title .eyebrow .lead .body .small .cite em strong` ·
`.cover .secdiv .manifesto .insight .cards .card .numlist .compare .steps .table .formula5 .arch .three-circle .bigq .matrix .bignum .summary .callout .note-box .row .col` ·
`.chrome`（引擎注入的页脚，必须有样式）。
学术皮额外有 `.figure .table-cap .bullets .refs`（杂志皮也提供了 `.figure/.bullets` 兜底）。

> 某个皮要省略个别组件没问题（如学术皮不用大字宣言的喊口号气质），但别让它"没样式裸奔"。

---

## 加一个皮肤（3 步，引擎不用动）

1. **写 `assets/skins/<名>.css`**：首行 `/* FONTS <google-fonts-url> */`（build.py 据此生成 `<link>`），然后 `:root{…}` 给齐上面的必需令牌，再把组件契约逐个上样式。最快的起手式：复制 `skins/editorial.css` 或 `skins/academic.css` 改。
2. **（可选）写 `assets/demo/<名>.slides.txt`**：一串 `<section>` demo 片段（用 `.txt` 后缀，提醒它不是成品页面），给画廊预览用。没有就用空白起手式。
3. **装配预览**：`python3 assets/build.py <名>` → 生成 `gallery/<名>.html`，浏览器打开自检。
4. 在 `references/styles.md` 的画廊表里加一行（DNA / 适合 / 预览路径），并在 SKILL.md 的 skins 列表登记。

> 想给某个皮配 deep 指南（像学术皮那样讲专属规范），放 `references/skins/<名>.md`。

---

## 画布与缩放（机制，了解即可）

- 每张 slide 原生 **1920×1080**，绝对定位，`transform:scale(--fit-scale)` 缩小预览；`--fit-scale` 由 JS 按视口算（编辑态上限 0.7）。
- 投屏/全屏态（`body.present`）：黑底、单张居中、按视口等比放大（`--sc`）。
- **含义**：写内容时就当成在 1920×1080 版心里排；超出会裁，所以"一页一件事"。
