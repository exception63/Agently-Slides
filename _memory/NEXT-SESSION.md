# 下个会话交接 · 候选方向（图片排版已完成）

> 更新于 2026-06-28 会话末。`/clear` 后：先读 `_memory/active.md` 顶部各 ✅ 块 + 🎯，再读本文件。

## ✅ 本会话（2026-06-28）已完成 · 未提交
**图片暂存盘 → 交给 AI 排版**（NEXT-SESSION 上次指定的图片导入功能，已实现）。
- 拖拽/导入图片 → 暂存 tray（每图可加说明）→「交给 AI 排版」→ AI 决定放哪页/怎么排 → Studio 回填真图。
- 方案①（省 token）：请求只带清单+元数据+磁盘路径，**无 base64**；AI 用 `<img data-img-id>` 占位，Studio 按 id 回填。
- 增强：桥接把暂存图写到临时盘，请求带真实路径 → **AI 能用 `Read` 真正看到图片像素**再排版。
- 现有「选中处手动插图」保留不动。验证 `verify-image-tray.mjs` 17/17，回归全绿。
- 详见 `active.md` 顶部 ✅ 块 + `AGENTS.md` §4c。**记得 commit + push。**

## 🎯 闭环三段现状（v2 一站式 AI PPT 制作/修改/呈现）
- **制作** = 已补「选皮流程」（`editorial-slides` 技能 Step 0：推荐→看总览图→真题试皮→定）。
- **修改** = 已打通：握手自动协作环（后台 `curl /api/wait` 唤醒，零手动拉）+ 动画快速设置接全库 + **图片排版**（本次）。
- **呈现（演讲者视图）** = ⚠️ 仍只在旧 IR 模式（`renderPresenterHtml`），**HTML-first 主流程缺**双屏/备注/计时（需从契约 deck 抽 notes，较 fuzzy）。
- **讲稿同步** = 用户说「最后再接」。

## 下个会话候选（用户挑一个）
1. **呈现态演讲者视图接 HTML-first 主流程**：双屏（当前页+下一页+备注+计时器），从契约 deck 的 notes 抽。闭环最后一段最缺。
2. **制作→修改的交接顺滑**：AI 用 `editorial-slides` 生成初版后，一键进 Studio 开始改（现在要手动 `/slidesmith <deck>`）。
3. **图片排版 v2 打磨**（若本次想继续深做）：① 真人 dogfood 跑一遍图片流；② 临时盘 close 时清理；③ tray 支持调整顺序/批量说明；④ 大图自动降采样省 AI vision token；⑤ 离线模式也能用（导出图片包）。
4. **图表**（Chart.js 内联/预渲染，破单文件要权衡）。

## 真跑握手环（怎么和用户协作改 deck）
`/slidesmith <deck>` → `slidesmith_open` 握手 → **后台** Bash `curl "<url>api/wait?timeout=280000"`（`run_in_background`，命中即退→harness 自动唤醒我，对话不卡死）→ 用户在 Studio 发 → 我改 → `slidesmith_apply_patch`（`confirm` 则 `preview`）→ 回 wait。
**注意**：别用前台 `slidesmith_wait`（会阻塞卡死对话，用户痛点）。

## 开工先读
`_memory/active.md`（顶部 ✅ + 🎯）· 本文件 · `packages/studio/src/main.ts` · `packages/bridge/src/bridge.ts` · `AGENTS.md`（§4b 桥接/§4c 图片请求）· `_memory/optimization-roadmap.md`。
