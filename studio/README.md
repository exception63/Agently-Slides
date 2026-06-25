# Slidesmith Studio — 可视化工作台

**就是这个文件夹里的 `slidesmith-studio.html`。直接双击打开即可（不用装任何东西、不用联网、不用开终端）。**

## 它能做什么
一个像 Keynote 那样的网页编辑器，整个工具就打包在那一个 HTML 文件里：

- **导入**：把 AI / 命令行生成的 `deck.json`（或 `deck.md`）拖进窗口，或点右上角「导入」。
- **编辑**：
  - 在中间预览里**直接点文字就能改**（标题、正文、要点、引用）。
  - 右侧换**主题配色**、改**本页布局**、给选中的块加**入场动画**。
  - 左侧 `＋ 🗑 ↑ ↓` **加 / 删 / 移动**幻灯片。
- **保存 / 导出**：
  - **存 .json**：回写 canonical 源文件（下次还能再导入接着改）。
  - **存 .md**：导出便于手写 / git diff 的 Markdown。
  - **导出投屏 HTML**：生成可直接放映的单文件 `deck.html` + 配套 `transcript.html`（讲稿）+ `presenter.html`（演讲者视图）。

> 导出的文件会下载到浏览器的「下载」文件夹。三个 HTML 放在同一文件夹里，双击 `deck.html` 即可全屏放映（按 `T` 换肤、`P` 开演讲者视图）。

## 和 AI / 命令行怎么配合
- **AI 路线**：你和 AI 聊需求 → AI 产出 `deck.json` / `deck.md` → 你把它拖进 Studio 精修。
- **命令行路线**（给会用终端的人）：`npm run sm -- build deck.md -o out` 一键出全部 HTML。
- 两条路线共用同一份 **canonical `deck.json`**，随时互转、互不丢失。

## 重新生成这个文件（改了源码后）
```
npm run build:studio          # 重新打包出 studio/slidesmith-studio.html
```
