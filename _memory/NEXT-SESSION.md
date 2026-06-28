# 下个会话交接 · 审视项目 → 找新的 AI-first 功能

> 更新于 2026-06-28 会话末。`/clear` 后先读 `_memory/active.md`（精简版·含启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。

## 🎯 下阶段任务：审视 Slidesmith，看还能接入什么 AI-first 功能
用户想和我一起**审视整个项目**，盘点现状、找下一个值得做的「AI-first」功能。先别写代码——先一起讨论方向、出带优先级的候选清单（像当初 AI 图表那样：调研→A/B/C→拍板→做）。

### 开场建议
1. 读 active.md 的「当前状态」摸清已有能力边界。
2. 给用户一张**能力地图 + 候选清单**（show_widget 画一下更直观），按"价值 × 契合 Slidesmith DNA（单文件/离线/矢量/AI-first）× 成本"排序。
3. 用 AskUserQuestion 让用户拍板先做哪个。

### 候选种子（待和用户一起增删）
- **演讲者视图 / 讲稿同步**：闭环最后一段（制作✅ 修改✅ 呈现缺）。HTML-first 主流程缺双屏/备注/计时，需从契约 deck 抽 notes（较 fuzzy）。
- **AI 图表 dogfood + C 逃生舱工具化**：真握手环里让 AI 实跑画图表（v1 没现场跑过 live）；复杂图常用就补「matplotlib 中文字体 + 令牌注入」helper。
- **editorial→Studio 渲染兜底入 build.py**：让所有学术 deck 自带兜底、不再黑屏（见 [[studio-drops-deck-engine]]）。
- **制作→修改交接顺滑**：editorial-slides 生成完一键进 Studio。
- **AI 审稿/优化建议**：AI 主动检查 deck（逻辑、过载、对比度、一页一事）给修改建议（现在只被动按评论改）。
- **AI 大纲→整套 deck 一键生成**：用户给主题/讲稿 → AI 出结构 + 选皮 + 配图配表 一条龙。
- **数据/表格 → 自动成图表页**：贴 CSV/Excel → AI 选图型批量出图表 slides。

## 📌 本会话（2026-06-28）做完
- AI 图表 v1（A 默认 + C 逃生舱）`31be79a`；图表数据文件导入 `ce95c6f`；UI 视觉精简 `d90d01b`——均 push。
- 真 dogfood：JBR《Virtual Journeys》→ 22 页 academic deck（5 真数据图表 + 动画），仓库根 `virtual-journeys.html`，Studio 渲染成功。
- 挖到并修：editorial deck 导入 Studio 黑屏（Studio 丢弃 deck 引擎 → deck 级 CSS 兜底）。

## 实时协作环怎么挂（复制即用）
后台 `run_in_background`（**别 nohup**）跑：`for i in $(seq 1 240); do R=$(curl -s --max-time 295 "http://localhost:8765/api/wait?timeout=280000"); echo "$R" | grep -q '"timedOut":false' && { echo "$R">/tmp/sm_wait.json; echo HIT; exit 0; }; sleep 8; done` —— 命中即 exit→唤醒我，空闲≈零 token。
