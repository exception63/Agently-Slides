# 下个会话交接 · 迭代：导出 PPT/PPTX（PDF 满版已完成）

> `/clear` 后先读 `_memory/active.md`（精简版·启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。

## 🎯 本迭代：导出 PPT / PPTX
上迭代（2026-06-29）问用户 PDF/PPT 方向，用户选「**先只做 PDF，PPT 以后再说**」→ PPT 搁置到本迭代。

**调研已完成，方案已定（别再重复调研）：**
- **方案 A（推荐 · 复用 PDF 管线）**：bridge headless 截每页 `.slide` 成 1920×1080 PNG → `python-pptx`（系统已装 v1.0.2）满版塞进 16:9 PPTX（slide size 13.333"×7.5"）。像素级保真（21 套皮/图表/SVG 全准），一键。**代价：PPT 里每页是图片、不能改字**（改要回 Studio）。
- 方案 B（结构化重建成原生文本框）可编辑但跨皮肤/图表大量失真、工程量极大且脆弱 → **不做**。
- **动手前先跟用户确认**：「图片版 PPTX 可接受吗？还是你期望能在 PowerPoint 里改字？」（用户当前理念是「在 Studio 里改、PPTX 只是导出格式」，多半接受图片版，但要确认）。

**实现要点（方案 A）**：
- bridge 新增 `POST /api/export-pptx`（仿刚做好的 `/api/export-pdf`，见 `packages/bridge/src/bridge.ts` 的 `renderDeckPdf` + 路由）：headless 打开 deck → 对每个 `.slide` `element.screenshot()` 出 PNG → 调 python（`spawn`）跑 python-pptx 组装 → 存 deck 同目录 `<base>.pptx` → `openFile` 自动打开。
- Studio：`exportPptx()` 仿 `exportPdf()`（main.ts ~2036），bridge-served 时 POST，否则提示需连 Claude。加个「导出 PPT」按钮（仿 `#expPdf`）。

## ✅ 上个会话（2026-06-29）做完 · 未 commit（用户没要求提交）
- **PDF 导出满版修正（已验证）**。根因实测：交互式「另存为 PDF」对话框默认**不 honor** `@page{size:1920px 1080px}`（用 Letter 纸张 → 四周白边），`preferCSSPageSize` 开关只有 headless/CDP 能拨、`window.print()` 摸不到。
  - 修法：「导出 PDF」改走 **bridge**——`packages/bridge/src/bridge.ts` 新增 `renderDeckPdf()`（`playwright-core` headless + `page.pdf({preferCSSPageSize:true, printBackground:true})`）+ `POST /api/export-pdf` 路由 + `openFile()` 自动打开 + 追踪 `deckAbsPath`（存 deck 同目录）。
  - Studio `exportPdf()`（main.ts）：bridge-served（`location.protocol http`）时 POST `pdfPrintHtml()` 到 `/api/export-pdf`，拿回 path 提示；standalone file:// 退回 `exportPdfViaPrint()`（原打印窗口 + 更新引导文案）。
  - 实测 virtual-journeys 22 页：全 20×11.25in（精确 16:9）满版、矢量文字（570 字体对象）、背景/SVG 图表/宋体全保真。详见自动记忆 [[pdf-export-via-bridge]]。
  - **部署提醒**：bridge.ts 改了，**新端点要重启 MCP/bridge 进程才生效**（下个会话 MCP 重启即自动生效）；Studio 前端改动只需刷新浏览器（bridge 每请求重读 `studio/slidesmith-studio.html`）。已 `node scripts/build-studio.mjs` 重建。

## 🔌 Slidesmith 协作环提醒
- `slidesmith_get_requests` 返回的请求**是用户主动提交的，照做**（按要求改对应页 → `slidesmith_apply_patch` 回写），别因 deck 名不符/猜测就判 stale 拒绝。billed 动作（codex 配图）可先一句确认。
- 实时环：后台 `run_in_background` 跑 `curl /api/wait` 自循环（命令见 active.md），命中即唤醒、空闲≈零 token，新会话要重挂一次。
