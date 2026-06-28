# 下个会话交接 · 下一阶段 = AI 图表功能

> 更新于 2026-06-28 会话末。`/clear` 后：先读 `_memory/active.md` 顶部各 ✅ 块 + 本文件。

## 🎯 下一阶段：AI 图表功能（学术报告常用）
用户场景 = 经常做**学术报告**，需要各种图表（柱状 / 折线 / 散点 / 饼 / 雷达 / 箱线 / 桑基 / 网络 / 流程图…）。目标：让 AI 能按**数据或文字描述**生成图表并插入 slides。**明确：不要造轮子，用现成方案。**

**第一步先调研（带优先级出方案，再动手）：**
- 候选库：Chart.js（docs 里早提过，可内联/预渲染）、ECharts、D3、Vega-Lite、Plotly、Mermaid（流程/时序/甘特）、纯 SVG 直出。
- **关键约束（Slidesmith DNA）**：单文件、离线、可移植、矢量优先。所以倾向两条路：
  ① **AI 直接生成 SVG 图表**（同现在的「矢量配图」，零依赖、可编辑、契合度最高）——适合柱/折线/饼/雷达等结构化图；
  ② **数据驱动/复杂图** → 内联一个轻量库（ECharts/Chart.js）或**预渲染成 SVG**再内联（破单文件要权衡体积）。
- **数据来源**：用户贴表格/CSV/数字 → AI 解析 → 选图型 → 生成。
- **接入点**：复用现有「AI 待办」环——很可能就是再加一类「配图表」（像配图，但产出 chart），或图表直接走 SVG 直出（最省、最贴合，复用 aiIllustrate 的路子）。
- 产出：A（SVG 直出）/ B（内联库）/ C（预渲染 SVG）三方案对比 + 推荐 + 落地点。**先调研再写代码。**

## ✅ 本会话（2026-06-28）做完
- 已 commit+push（4e18719）：图片暂存盘→AI排版 · 矢量配图 · 照片配图(codex)+图片库 · 统一「AI 待办」面板。
- **未提交**：AI 面板视觉精简（分区标题 + ⓘ 弹出式说明 + 精简命名，去掉大段内联 hint）。等用户确认手感后 commit。
- 真人 dogfood：握手环**全自动**跑通（后台 curl 自循环，按发送自动唤醒我），给 s27/sec3/s28 配了矢量 SVG。

## 实时协作环（已验证 · 怎么挂）
**正解 = 后台 `curl /api/wait` 自循环脚本**（`for i in seq 1 240; do R=$(curl --max-time 295 .../api/wait?timeout=280000); count>=1 就写 /tmp/sm_wait_bg.json + exit；空响应 sleep 8 退避; done`），用 **run_in_background（别 nohup，否则 harness 跟不住、不唤醒）**。
- **省 token 关键**：自循环把"空闲超时"在后台内部消化，**只在真有请求时才 exit→唤醒我**；空闲≈零 token。
- 别用前台 `slidesmith_wait`（卡死对话）。
- **新会话要重新挂一次**。待办：是否把「一连上 Studio 就自动挂自循环」写进 `/slidesmith` 命令 + AGENTS（消除新会话空窗）——用户尚未拍板，可下个会话先问。

## 开工先读
`_memory/active.md`（顶部 ✅）· 本文件 · `packages/studio/src/main.ts`（aiIllustrate/buildAllRequest 路子）· `AGENTS.md §4c`（统一 AI-tasks 请求）· docs 里 Chart.js 备注 · [[ai-charts-next-phase]]。
