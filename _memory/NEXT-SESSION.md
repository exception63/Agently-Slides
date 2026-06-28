# 下个会话交接 · AI 图表 v1 已成,候选下一步见下

> 更新于 2026-06-28 续会话末。`/clear` 后：先读 `_memory/active.md` 顶部各 ✅ 块 + 本文件。

## ✅ AI 图表功能 v1 已完成（A 默认 + C 逃生舱）
调研 + 实现 + 验证全做完,详见 `_memory/active.md` 顶部 ✅ 块 + `docs/RESEARCH-ai-charts.md`。一句话:
「配图」分段从「矢量/照片」扩到 **「矢量/图表/照片」**;选「图表」→ AI 默认直接画**内联 SVG 图表**(柱/折线/饼/雷达/散点…,令牌着色,零依赖),复杂统计图(箱线/热力/桑基…)走 **matplotlib 预渲染→SVG→内联** 逃生舱。规则在 `AGENTS.md §4c`「图表」指令。verify-ai-pane 22/22 + 全回归绿。

## 🎯 下一阶段候选(下会话先和用户确认选哪个)
1. **真·握手环 dogfood 图表**:连上 Studio,让用户对某页选「图表」+ 贴真数据 → AI 实跑画一张 SVG 图表回灌。**这是图表 v1 唯一没现场跑的链路**(代码全验证过,但没在真握手环里让 AI 真画过图表)。最该先做。
2. **C 逃生舱小工具**:若用户常用箱线/热力等复杂图,补一个「matplotlib 中文字体 + deck 令牌注入」helper,让逃生舱开箱即用(现在靠规则让 AI 临时写 Python)。
3. **呈现态演讲者视图**:闭环三段的最后一段(制作 ✅ / 修改 ✅ / 呈现 缺)。HTML-first 主流程缺双屏/备注/计时,较 fuzzy。
4. **制作→修改交接顺滑**:生成完一键进 Studio。

## ✅ 本会话(2026-06-28)做完
- 已 commit+push（4e18719）：图片暂存盘→AI排版 · 矢量配图 · 照片配图(codex)+图片库 · 统一「AI 待办」面板。
- **本地 commit `d90d01b`(未 push)**：AI 面板视觉精简(分区标题 + ⓘ 弹出式说明 + 精简命名)。
- **未 commit**：AI 图表 v1(上述)。**push 被 auto-mode 分类器拦**(直推 main 需用户授权)——两批改动等用户授权 push 或自己推。
- 「先问我」竖排小瑕疵核实=当前 build 已修(19px 单行,nowrap 生效),无需改。

## 实时协作环（已验证 · 怎么挂）
**正解 = 后台 `curl /api/wait` 自循环脚本**（`for i in seq 1 240; do R=$(curl --max-time 295 .../api/wait?timeout=280000); count>=1 就写 /tmp/sm_wait_bg.json + exit；空响应 sleep 8 退避; done`），用 **run_in_background（别 nohup，否则 harness 跟不住、不唤醒）**。
- **省 token 关键**：自循环把"空闲超时"在后台内部消化，**只在真有请求时才 exit→唤醒我**；空闲≈零 token。
- 别用前台 `slidesmith_wait`（卡死对话）。
- **新会话要重新挂一次**。待办：是否把「一连上 Studio 就自动挂自循环」写进 `/slidesmith` 命令 + AGENTS（消除新会话空窗）——用户尚未拍板，可下个会话先问。

## 开工先读
`_memory/active.md`（顶部 ✅）· 本文件 · `packages/studio/src/main.ts`（aiIllustrate/buildAllRequest 路子）· `AGENTS.md §4c`（统一 AI-tasks 请求）· docs 里 Chart.js 备注 · [[ai-charts-next-phase]]。
