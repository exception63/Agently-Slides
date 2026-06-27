# 调研：reveal.js + impress.js 能给 Slidesmith 加什么

> 日期：2026-06-26 · 状态：调研完成，待用户拍板（A/B/C + 建造顺序）
> 任务来源：`_memory/active.md` 🎯「让 AI 帮做"高端炫酷"的 HTML slides，怎么把这两个项目用上」
> 约束基线：Slidesmith = 单文件 · 离线 · 可移植 · 固定 1920×1080 · 契约 HTML deck · HTML-first · 人改细活 / AI 改重活 · **编辑器 + AI 评论回路是护城河**

---

## 0. 一句话结论

> **选 C（混合），但重心压在 B：把 reveal.js 的三个"技法"移植进 Slidesmith 引擎（声明式属性 + 少量引擎 JS，全单文件、全可编辑、全 AI 可写），而 impress.js 的无限画布运行时不要整合——它和"固定 1920×1080 + 可编辑契约"在架构上互斥。impress 只取它的"缩放镜头"创意（做成受控的 zoom 转场 / 概览页），其真正的 Prezi 式整页只留作一个"另出独立文件、不进编辑器"的逃生舱，按需才做。**

为什么不是 A（直接部署 reveal/impress，让 AI 需要时调用）：**那等于放弃 Slidesmith 的全部差异化**。Studio 的检查器、按 `data-id` 的 harvest、拖拽 gizmo、对比度自检、撤销、桥接打补丁——**全都建在契约结构上**（`<div id="deck"><section class="slide" data-id>` + 固定画布 + `:root` 令牌）。reveal/impress 的 deck 是**另一套 DOM**，Studio 根本认不出来，人没法做细活、AI 没法按 `data-id` 精确打补丁。"让 AI 生成 reveal deck" = 分叉出第二个不可编辑的产品，不是增强本项目。

为什么是 B/C：值得拿的是**技法（CSS/JS 配方），不是运行时**。而且这些技法**正好长在现有的声明式模型上**——引擎本就有 `data-anim`（入场）/ `data-motion`（持续）/ `data-anim-out`（消失），本就按 `.slide.active` 切页、本就按 `data-id` 寻址、FX_JS 本就拦截了翻页键。加 reveal 的能力 = **再加几个声明式属性 + 一点引擎 JS**，单文件不破、契约不破、编辑器不破、AI 仍是第一公民。

---

## 1. 决策框架（用户给的三选一）

| 选项 | 含义 | 判定 |
|---|---|---|
| **A** | 直接部署 reveal/impress，AI 需要时整套调用、产出它们的 deck | ❌ 主路径不可取（丢掉编辑器/评论回路）。仅留作 impress Prezi 的窄逃生舱 |
| **B** | 把它们的能力移植/借鉴进 Slidesmith 引擎 | ✅ 价值 90% 在这。声明式、单文件、可编辑、AI 可写 |
| **C** | 混合 | ✅ **最终选 C**：B 为主体 + A 仅做 impress 逃生舱 |

---

## 2. Slidesmith 今天已有什么（动效/转场盘点）

读 `packages/runtime/src/engine.js` + `packages/studio/src/main.ts`（FX_CSS/FX_JS）+ `docs/design-system.md`：

- **翻页**：`.slide.active` 切换，`display:none` 瞬切；FX_JS 在 capture 阶段拦截键盘 / `[data-act]` 钮，先播退场动画再真翻页。
- **入场 `data-anim`**（翻到该页播一次）：`fade` `rise/fade-up` `pop` `in-left` `in-right` `counter-up` `morph` `stagger-list`。
- **持续 `data-motion`**：`glow` `breathe` `float` `pulse` `neon` `stress` `shimmer`。
- **消失 `data-anim-out`**：`fade-out` `sink` `zoom-out` `out-left` `out-right`。

**缺口（正好是 reveal 的强项）：**
1. ❌ **页内分步揭示（fragments）**——点一下出一条。`stagger-list` 是"翻进来就全自动播完"，不是点击逐步。讲解型 deck 必需。
2. ❌ **跨页元素形变（auto-animate / Magic Move）**——同一元素在相邻两页之间平滑移动/变大/变色。Keynote 的"神奇移动"，**这是"高端炫酷"的命门**，也正是本项目的视觉靶子（`keynote-style-target`）。
3. ❌ **统一的跨页转场**（fade/slide/convex/concave/zoom）——现在是瞬切 + 自定义退场，没有一个"转场风格"旋钮。

---

## 3. reveal.js — 拿什么、怎么落地

reveal.js（MIT，v5.x，成熟稳定）。它整套是多文件 + 插件生态，**整套不要**（与单文件/可移植冲突，且会顶掉编辑器）。值得移植的是三个独立技法：

### 3.1 ⭐ Auto-Animate（"神奇移动"）— 旗舰
- **是什么**：相邻两页之间，匹配上的元素自动用 FLIP 算法在位置/尺寸/颜色/文字之间补间。视觉上 = Keynote Magic Move。
- **reveal 的匹配机制**（已查证）：显式 `data-id` 相同的元素优先配对；否则按 `nodeName + textContent`（h1-h6/p/li）、`nodeName + src`（img/video/iframe）、`nodeName + textContent`（pre/code）自动配；用 `data-auto-animate-id` 把"哪两页算一组"分组。
- **和本项目的契合**：引擎**本就在 `.slide` 上有 `data-id`**；只需在元素上加 `data-auto-id`，引擎在切页时量前后矩形、对配对元素做 transform/opacity 补间（FLIP）。约 80–150 行引擎 JS。**单文件、可编辑、可移植全不破。**
- **创作姿势（AI-first）**：AI 生成时"复制一页 → 微调（移动/放大某元素）→ 给该元素打同 `data-auto-id`"即得形变；人可在检查器开关；人也可经评论让 AI 做（"把这个大数字从第 3 页神奇移动到第 4 页"）。
- **判定**：价值最高、最"高端炫酷"、直击 keynote 靶子。工作量中等。**优先级 P0（旗舰）。**

### 3.2 Fragments（页内分步揭示）
- **是什么**：点击在同一页内逐个揭示元素（vs 现有 stagger-list 的"翻进来全自动"）。
- **reveal 的写法**（已查证）：`class="fragment"` + 可选 `data-fragment-index="2"` 控顺序。
- **契合**：加 `data-fragment`（+ 可选 `data-fragment-index`）；引擎给每页加一个"步进计数器"，**复用 FX_JS 已有的翻页键拦截**：next 先推进本页 fragment，推完了再翻页。约 50–80 行。单文件、可编辑。
- **创作姿势**：AI 写属性；人在检查器勾"逐条点出"；演讲者用 →/空格 逐步。
- **判定**：价值高、工作量低。**优先级 P1。**

### 3.3 跨页转场（transitions）
- **是什么**：none/fade/slide/convex/concave/zoom（已查证）。把瞬切升级成有质感的转场。
- **契合**：deck 级 `data-transition` 令牌 + 单页可覆盖；引擎在进/离场对 `.slide` 套 CSS 3D transform。工作量低。
- **创作姿势**：人在下拉里选一种；AI 设默认。
- **判定**：价值中、工作量低，锦上添花。**优先级 P2。**

### reveal 其余能力 — 不取或已有
- Markdown 创作、speaker notes、PDF 导出、纵向 slides、plugins/themes：本项目**已有等价物**（PDF 导出 ✅、视觉自检 ✅）或**已明确不做**（讲稿/双屏交给别的 skill）或**与单文件冲突**（plugin 生态）。**不取。**

---

## 4. impress.js — 为什么运行时不要、只取创意

impress.js（MIT，Bartek Szopka / Henrik Ingo）。

- **它的模型**（已查证）：**无限画布**，每个 `.step` 用 `data-x/y/z/data-rotate/data-rotate-x/y/z/data-scale` 摆在 2D/3D 空间里，镜头在它们之间平移/旋转/缩放（Prezi 式）。
- **为什么运行时**不能**整合**：这和 Slidesmith 的契约**根本对立**——契约的命门是"一摞固定 1920×1080 的顺序帧"，impress 是"画布上散落、靠相机串起来的节点"。**整套搬进来 = 砸掉契约 + 砸掉整个编辑器**（检查器/harvest/自检全假设固定帧）。
- **只取它的"缩放镜头"创意**（受控、不破契约）：
  1. **概览/缩放页（zoom-overview）**：缩出全 deck 缩略网格、点一张缩进去——类似 reveal 的 overview 模式 / Prezi-lite。做成盖在现有 deck 上的一层 CSS scale 镜头，**不动每页结构**。工作量中。**优先级 P3。**
  2. **zoom 转场**：已被 §3.3 的 zoom 覆盖。
- **真正的 impress 风 Prezi 整页**：那是**另一个产品**（非 1920×1080、不可在契约编辑器里编辑）。**不进引擎。** 留作**逃生舱**：用户哪天明确要"Prezi 式无限画布"时，**另出一个独立 impress.js 文件**（不可在 Studio 编辑，明确是另一种输出模式）。这是选项 A 唯一站得住的窄场景。**现在不做。**

---

## 5. 优先级清单（最终建议）

| # | 能力 | 来源 | 价值 | 工作量 | 契合度 | AI 如何介入 |
|---|---|---|---|---|---|---|
| **P0** | **Auto-Animate / 神奇移动** | reveal | 🔥🔥🔥 | 中 | 高（复用 `data-id`） | AI 复制页+打 `data-auto-id`；人经评论点名要 |
| **P1** | **Fragments / 分步揭示** | reveal | 🔥🔥 | 低 | 高（复用键拦截） | AI 写 `data-fragment`；人勾选 |
| **P2** | **跨页转场** fade/slide/zoom… | reveal | 🔥 | 低 | 高（令牌+CSS） | AI 设默认；人下拉选 |
| **P3** | **概览/缩放页** | impress 创意 | 🔥🔥 | 中 | 中（盖镜头层） | 人按键进概览；AI 不必介入 |
| 逃生舱 | impress 无限画布 Prezi 整页 | impress 运行时 | — | 中 | ❌不进引擎 | 仅按需另出独立文件 |

**贯穿的 AI-first 线**：P0–P3 都做成**声明式属性**——契约新增 3–4 个钩子（`data-auto-id` / `data-fragment` / `data-transition`），检查器"动画效果"tab 新增对应控件，视觉自检 / harvest **完全不受影响**（它们只是契约元素上的属性）。AI 生成时写、人在 Studio 调、AI 经评论回路改——正是分工模型。

---

## 6. 建议建造顺序

两种合理排法，请用户选（详见交接问题）：

- **甲 · 先旗舰**：P0 Auto-Animate 先做（最大"炫酷"回报、直击 keynote 靶子），再 P1+P2 一个引擎 pass 收尾，P3 看反馈。
- **乙 · 先快赢**：P1 Fragments + P2 转场先做（都便宜、一个 pass 出活、立刻可演示），暖身后再啃 P0 Auto-Animate（最费工），P3 最后。

> 我（Claude）的推荐：**乙**。先用两个低成本能力把"分步讲解 + 有质感转场"立起来（一次引擎改动 + 一次 Studio 检查器改动就能演示），同一套引擎/检查器骨架接着加 P0 旗舰时复用，风险更低、用户更早看到东西。但若用户就想最快看到"最炫"的效果，选**甲**直接上神奇移动。

每个能力都按工程纪律：声明式属性进契约 → 引擎 JS/CSS → Studio 检查器控件 → `node scripts/build-studio.mjs` 重建 → 配 playwright 验证脚本 → 截图给非技术用户验收 → 沉淀进 `docs/design-system.md`。

---

## 7. 一句话给用户

reveal.js 有三样东西真值得要——**神奇移动、分步揭示、转场**；我会把它们当"配方"重写进我们自己的引擎（仍是单文件、仍能在 Studio 里点着改、AI 仍能按评论加），而不是把整个 reveal 搬进来。impress.js 的"无限画布转大圈"很炫但和我们"一页一页 1920×1080"的根本设定打架，所以只借它"缩放概览"的点子，真要做 Prezi 那种就另存一个独立文件、不进编辑器。

---

## Sources
- [Auto-Animate | reveal.js](https://revealjs.com/auto-animate/)
- [Auto-Animation | hakimel/reveal.js | DeepWiki](https://deepwiki.com/hakimel/reveal.js/3.6-auto-animation)
- [Fragments | reveal.js](https://revealjs.com/fragments/)
- [The HTML presentation framework | reveal.js](https://revealjs.com/)
- [Config | reveal.js](https://revealjs.com/config/)
- [impress.js/DOCUMENTATION.md](https://github.com/impress/impress.js/blob/master/DOCUMENTATION.md)
- [impress.js homepage](https://impress.js.org/)
- [impress.js LICENSE (MIT)](https://github.com/impress/impress.js/blob/master/LICENSE)
