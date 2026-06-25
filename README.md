# Slidesmith — AI-first HTML Slides System

> 仓库 `presentsystems` · 状态: **v2 HTML-first**（导入→可视化精修→AI 回路→交付 已贯通）
> 一个 **AI 主导生成、人类后期可视化精修** 的 HTML 演示系统。

## 一句话

**AI 直接做出一份单文件 HTML slides → 你拖进 Studio 改字/换色/调动效 → 复杂改动用 Submit-to-AI 回灌 → 导出 HTML / PDF。**

v2 的真相源就是那份 **HTML deck 本身**（遵循一套"契约结构"），不再是中间数据格式。

## 怎么用

**人类（零门槛，主路）**：双击 [`studio/slidesmith-studio.html`](studio/slidesmith-studio.html) —— 一个像 Keynote 的离线网页工作台（整个工具就一个 HTML 文件）。

1. 把 AI 生成的 `.html` deck 拖进去（它会原样显示，连自带的段导航 + 缩略图都在）；
2. 点文字直接改；右侧改配色 / 选中元素调字号色重 / 加动效；
3. 「🔍 视觉自检」查溢出/对比度/坏图；复杂改动用 **Submit to AI**（导出请求文件→交给 AI→应用返回，只改那一页）；
4. 「导出 HTML / 导出 PDF」。

详见 [GUIDE.md](GUIDE.md)（人类指南）。

**AI / 终端**：AI 读 [AGENTS.md](AGENTS.md) + [docs/DECK-CONTRACT.md](docs/DECK-CONTRACT.md)，按契约生成 HTML deck。
另有一条**可选的**数据格式(IR)+CLI 老路（强约束 / 批量 / 无头 PDF·PNG / `doctor` 视觉自检）：

```bash
npm install
npm run build:studio                          # 重新打包独立 Studio HTML
npm run sm -- doctor mydeck.deck.md           # 校验 + 质检 + 视觉自检（出问题截图）
npm run sm -- export mydeck.deck.md -o dist -f pdf
```

## 它解决什么

同目录的兄弟 skill（`html-ppt` / `guizang` / `frontend-slides` / `huashu` …）能生成很漂亮的 HTML slides，
但产物几乎都是**一次性的静态 HTML**——想改只能回去重新生成。Slidesmith 补的正是这块空白:
**把 AI 生成的（遵循契约的）HTML deck 变成可视化编辑、可 AI 回改、可导出**的东西。

## 架构一图（v2 HTML-first）

```
AI 按契约生成  ─────────────▶  契约 HTML deck（单文件 · 离线 · 真相源）
   (DECK-CONTRACT.md)                     │
                                          ▼  拖进 Studio（同源 iframe，直接编辑 DOM）
                         改字 / 换色 / 动效 / 视觉自检 / 导出 HTML·PDF
                                          │
              复杂改动 ──▶ Submit-to-AI（导出请求文件 → AI 只重写那页 <section data-id> → 应用）
```

## 里程碑历史

- **v1 (M0–M5)**：IR→渲染(deck+逐字稿+演讲者)→3 主题/动画→PDF/PNG 导出→可视化编辑器。
- **M6 独立 Studio · M7 设计系统 v1 · M8 AI 视觉自检环**（CLI `audit`/`doctor`）。
- **🔄 HTML-first 转向 → N1–N4**：N1 导入契约 deck · N2 就地编辑(改字/换色/动效/导出) ·
  N3 Submit-to-AI 回路 · N4 视觉自检进 Studio + PDF 导出 + 保位。详见 [docs/PIVOT-v2-html-first.md](docs/PIVOT-v2-html-first.md)。

## 文档导航

| 文档 | 内容 |
|---|---|
| [GUIDE.md](GUIDE.md) | **人类指南**：怎么让 AI 做、怎么用 Studio、Submit-to-AI 怎么工作 |
| [AGENTS.md](AGENTS.md) | **AI 接口**：怎么生成契约 deck、怎么处理单页修改请求 |
| [docs/DECK-CONTRACT.md](docs/DECK-CONTRACT.md) | **Deck 契约**：AI 照此生成、导入器照此解析（合规层级 L1/L2/L3） |
| [docs/PIVOT-v2-html-first.md](docs/PIVOT-v2-html-first.md) | HTML-first 改造蓝图（定位 / 架构反转 / N1–N5） |
| [docs/PRD.md](docs/PRD.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/ROADMAP.md](docs/ROADMAP.md) | v1 产品/架构/路线（部分被 v2 反转，见各文件顶部说明） |

## 借鉴来源

- `keynote.html`（用户成熟样例）→ Deck 契约结构 · `huashu` Tweaks → 调参面板 ·
  Open Design（桌面）→ 画布/检查器 UX · Claude artifacts → Submit-to-AI 回路 ·
  `html-ppt`/`guizang` → 主题/布局/动画 · 现有 3 skill → 视觉/同步 DNA。

## 当前状态 & 下一步

✅ v1 + Studio + 设计系统 + M8 视觉自检 · ✅ HTML-first N1–N4 贯通 · ✅ AGENTS/GUIDE/README 对齐 v2
▶ **候选**：① AI 生成侧全链路 dogfood（AI 从零生成契约 deck 跑通全流程）· ② 双屏演讲者 / 讲稿同步 · ③ Open-Design 式画布。

记忆系统：见 [`_memory/active.md`](_memory/active.md)（当前状态与下一步）。
