# 谱系 · 风格取材自哪里

## 源讲稿

**国企改革深化与现代企业制度建设 · `CoursesDevelopment/国企改革深化课程/讲稿.html`**
- 约 1.65 万字 · 6 段 · 49 个 `h3.sub` 锚点 · 2026-06-03 与同名 slides + 演讲者模式三件套同时交付。
- 主源邵宁《艰难的变革》；与 `editorial-slides` 做的 `slides.html`（49 张）1:1 对齐；`slides-presenter-mode` 做的副屏实测双向同步通过（频道 `guoqi-sync`）。

## 从它抽象出来的东西

| 抽象出的资产 | 来自源讲稿的什么 |
|---|---|
| `:root` 令牌（纸色 + 朱红 + 4 字体）· 与 editorial-slides 同源 | 源讲稿 `<style>` 头部 |
| 段—节两级结构（`section.seg` + `seg-cover` + `h3.sub` 锚点块） | 源讲稿全部分段 |
| 讲师三件套块：cue（讲法）/ golden（金句）/ data（数据）+ callout + q | 源讲稿正文里反复用的块 |
| 演讲者 CSS + 片段②③监听（整块高亮 / Keywords / 键盘·TOC 转发 / 反向查询） | 源讲稿底部烤进的 slides-presenter-mode v0.3 监听 |
| TOC（每段一条 · href `#seg-N`）+ 反向联动 | 源讲稿 `nav.toc-nav` |

## 抽象时做的处理

- **内容换成占位 + 2 段示例**：模板保留全套 CSS/JS，正文替换为"段 0 + 段 1"两个示例段，演示所有块类型与锚点写法。
- **占位提为 4 个**：`{{DOC_TITLE}} {{KICKER}} {{TITLE_HTML}} {{META_HTML}} {{TOC_ITEMS}}`。
- **监听标"勿删"**：底部两段 script + 演讲者 CSS 是同步命脉，模板里明确注释不要删。
- **强调红线**：每段必包 `section.seg`（防整块高亮越界）、每张 slide 唯一锚点、三处锚点一致。

## 和孪生 skill 的关系

- `editorial-slides`：同一套色与字，做 slides。两者并排双屏不违和。
- `slides-presenter-mode`：消费本 skill 产出的讲稿（锚点 + 监听），生成副屏。

## 后续可反哺

- v0.2：从 editorial-slides 的 `window.SLIDE_MAP` + slide 标题**自动生成讲稿锚点骨架**（h3.sub 空块 + slide-tag），讲师只填正文。
- v0.2：讲稿字数→时长估算器（按 125 字/分钟，标注每段预计分钟，但讲稿正文里不显示时间）。
- v0.2：Markdown 写作 → build 脚本生成本 HTML（锚点 + 监听烤进 build），长稿更好维护。
