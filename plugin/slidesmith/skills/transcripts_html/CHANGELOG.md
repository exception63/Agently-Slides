# Changelog · transcripts_html

## v0.1.0 — 2026-06-03 · 首次抽象 + dogfood（国企改革深化课程讲稿）

**case**：为"国企改革深化与现代企业制度建设"2 小时课做中文讲稿 HTML（约 1.65 万字 · 6 段 · 49 锚点），与 `editorial-slides` 的 49 张 slides 1:1 对齐，并经 `slides-presenter-mode` 接成双屏。`CoursesDevelopment/国企改革深化课程/讲稿.html`。

**抽象出 skill**：
- `assets/transcript-template.html`：全套 CSS（与 editorial-slides 同源令牌）+ 讲师三件套块（cue/golden/data）+ 段封面/TOC/原文引述 + 出厂烤进的 slides-presenter-mode v0.3 监听（片段②③）+ 演讲者 CSS（片段①）+ 2 段示例。4 个占位。
- `references/components.md`：8 类块组件速查。
- `references/presenter-integration.md`：三处锚点 1:1 + 频道名对齐 + 验证清单。
- `examples/lineage.md`：来源案例与抽象说明。

**dogfood 验证有效**：
- 浏览器实测：副屏 `applyState` → 讲稿 iframe 滚到锚点 `s2-2`，h3 得 `presenter-current` 红边，其后整块亮起（实测 3 块）；header 同步 slide 号/标题/段名。
- 三处锚点（slides `window.SLIDE_MAP` / 讲稿 `id` / 副屏 `SLIDE_MAP_LOCAL`）= 49/49/49，集合一致、无重复、无错位。
- 讲稿单独打开为干净备课稿，转发脚本守门未生效。

**学到 / 红线**：
1. **每段必包 `<section class="seg">`**：否则一段最后一块的整块高亮会沿 `nextElementSibling` 串进下一段的 `seg-cover`。这是本 skill 相对裸写讲稿最关键的结构约束。
2. **`<strong>` 只标关键词**：Keywords 提词（K 键）只亮当前块的 strong，整段加粗会让提词失效。
3. **postMessage type 名 vs 广播频道名是两回事**：`fuquan-scroll` 等是副屏↔iframe 固定约定（勿改）；`xxx-sync` 是 slides↔副屏广播频道（需对齐）。两者混淆是接线头号坑。
4. **锚点对齐省事法**：先用 editorial-slides 做 slides，直接抄它的 `window.SLIDE_MAP` 当讲稿锚点清单 → 天然一致。

**与孪生 skill 的定位**：editorial-slides（做 slides）/ transcripts_html（做讲稿）/ slides-presenter-mode（接双屏）三件套，共享同一套锚点与视觉语言。
