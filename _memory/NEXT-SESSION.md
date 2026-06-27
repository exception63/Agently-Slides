# 下个会话交接 · 图片导入功能（AI-first 暂存盘 → 批量交给 AI 排版）

> 写于 2026-06-27 会话末（用户要清空上下文）。`/clear` 后：先读 `_memory/active.md` 顶部各 ✅ 块 + 🎯，再读本文件。

## 🎯 北极星（用户 2026-06-27 定）
AI-first 软件**不逐张手加图**。要做一个**图片暂存 → 批量交给 AI 排版**的流程：
1. **导入**：用户把图片**拖拽到指定区域**，或**手动导入**（选文件）。
2. **暂存**：图片先**记录在工具栏 / 暂存盘（tray）**，**不立即插入某页**。可跨多次、多页攒一批。
3. **批量交付**：图片备齐后，**发一个请求给 AI** → AI 把这些图片**插入到对应 slides 并做好排版**（走握手自动环 `slidesmith_apply_patch` 回写）。
4. **保留手动**：现有的「html 模式插入图片」（选文件/粘贴 → base64 内联到选中处）**保留**——AI 做完后人还要微调（原话："原始的那个增加图片功能还是要保留，因为 AI 做完之后人还是要修改"）。
5. **核心 = 给 AI 一个图片放置接口**：请求里带**暂存图片清单 + 元数据**，让 AI 高效决定每张放哪页、怎么排版。

## 现状（起点）
- **现有图片插入**：roadmap「③ HTML 模式插入图片」已做（`packages/studio/src/main.ts`，选文件/粘贴 → base64 内联，入 undo）。grep `image`/`base64`/粘贴 找入口；保留它，tray 是其上的新层。
- **AI 请求构造**：`buildAllAiRequests`/`aiSlideBlock`/`aiRequestHeader`/`aiOutputSpec`（main.ts ~1488–1560）——新「图片放置请求」可仿此或扩展它带图片清单。
- **桥接/握手环**：已成（`slidesmith_open`/`connect`/`wait`/`apply_patch`，见 active.md ✅ 块）。图片请求走同一条环：用户在 tray 攒图 → 点「交给 AI 排版」→ Studio 构造带图请求 → 后台 `curl /api/wait` 唤醒 AI → AI 回 `<section data-id>` 含 `<img>`。
- **tray 是全新的**：要新建 暂存盘 UI（工具栏一块区 + 缩略图列表 + 拖拽区 + 每图可加说明 + 删除）+ 状态（暂存图片数组：id/base64/文件名/尺寸/说明）+「全部交给 AI 排版」按钮。

## 设计要点（下个会话先想清再做）
- **token 体积（关键权衡）**：base64 图多了请求会很大。两条路——① **AI 只决策**：请求给 AI 的是「图片清单 + 缩略说明 + deck 结构总览」，AI 返回「哪张图（id）放哪页、第几个位置、怎么排版」，**Studio 再把真 base64 填进 `<img>`**；② 直接把 base64 塞给 AI 让它写 `<img src=base64>`。**倾向 ①**（省 token、AI 专注决策、Studio 落图），需要 AI 输出里用图片 id 占位 + Studio 回填。
- **tray UI 放哪**：顶部工具栏 / 左栏底部 / 新面板？拖拽区怎么标（高亮 drop zone）。
- **AI 接口格式**：请求（图片 id/名/尺寸/用户说明 + 每页结构）+ 输出（每页 `<section data-id>` 里用 `<img data-img-id="…">` 占位，Studio 按 id 回填真 src）。
- **保留手动**：tray 之外，选中元素仍能直接插图（不动现有路径）。

## 本会话（2026-06-27）已完成 · 已 commit+push 到 origin/main
- **握手式自动协作环**（B 会话自动轮询，零手动拉）+ 真人 dogfood 跑通。
- **动画快速设置接全库 + 强调 + round-trip** + AI 标签规范（优先标准标签、保留灵活）+ 发送按钮配色修复。
- **关键经验**：后台环正解 = **后台 Bash `curl /api/wait`**（`run_in_background`，命中即退→自动唤醒），**不是前台 `slidesmith_wait`**（会卡死对话，用户痛点）。
详见 `active.md` 顶部两个 ✅ 块。

## 开工先读
`_memory/active.md`（顶部 ✅ + 🎯）· 本文件 · `packages/studio/src/main.ts`（现有插图入口 + `buildAllAiRequests`）· `AGENTS.md` §4b（桥接/请求接口）· `_memory/optimization-roadmap.md`（③ 插图那条）。**真跑环**：`/slidesmith <deck>` → `slidesmith_open` 握手 → 后台 `curl "<url>api/wait?timeout=280000"` → 用户 Studio 发 → 改 → `slidesmith_apply_patch`。
