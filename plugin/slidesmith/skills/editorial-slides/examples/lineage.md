# 谱系 · 风格取材自哪里

## 源 deck

**福泉商务局 AI 课程 · `Fuquan_final/02-slides/fuquan0527.html`**
- 5 段 · 145 张 · 2026-05-27 现场交付验证。
- 段结构：段 0 开场 Hook(18) / 段 1 prompt 深讲(36) / 段 2 agents 深讲(51) / 段 3 案例·电池对比(20) / 段 4 案例·个人 AI 助手(20)。

## 从它抽象出来的东西

| 抽象出的资产 | 来自源 deck 的什么 |
|---|---|
| `:root` 全套令牌（4 色 + 4 字体 + 字阶） | 源 deck 的 `<style>` 头部 |
| 19 种版式组件（cover/secdiv/manifesto/insight/cards/numlist/terminal/compare/steps/table/formula5/arch/three-circle/bigq/matrix/bignum/summary/helpers） | 源 deck 全部 `.slide` 类型 |
| 1920×1080 画布 + transform 缩放 + 投屏/全屏态 | 源 deck 的 deck/slide/present CSS |
| topbar + 折叠段导航 + 缩略图 + 进度条 + 键盘 | 源 deck 的底盘 |
| 演讲者模式钩子（broadcast/openPresenter/反向 jump） | 源 deck 已接 slides-presenter-mode 的部分 |

## 抽象时做的升级（比源 deck 更好用）

- **自配置引擎**：源 deck 把 `segNames/segCounts/SLIDE_TITLES/segnav DOM` 全硬编码；模板改成**从各 slide 的 `data-seg`/`data-segname` 自动推导** → 新 deck 只写 slide 正文，导航/缩略图/计数/标题全自动。
- **去掉课程专用件**：源 deck 的 13 个 demo iframe modal 系统是该课特有，模板不含（需要时再单加）。
- **频道名/副屏文件名提为 `CONFIG`**：避免多份 slides 串台。
- **新增 `.cite` 引用样式**：为"学术 + 可溯源"场景内置文献标注小灰字。

## 后续可反哺

- v1.1：把"参考文献页"做成一个标准版式（`refs` 组件）。
- v1.1：secdiv 幽灵数字支持中文章名缩写自动取。
- v1.2：可选的入场微动效（present 态淡入）。
