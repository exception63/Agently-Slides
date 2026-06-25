# Procedure: 里程碑推进循环 (Milestone Loop)

Slidesmith 按 M0→M5 一步步推进，每个里程碑用同一循环。

## 开工前
1. 读 `_memory/active.md`（当前状态 + 下一步）。
2. 若涉及"为什么"，读 `_memory/decisions.md`；若涉及技术细节，读对应 `docs/`。
3. 确认本里程碑的任务清单与验收信号（见 `docs/ROADMAP.md`）。

## 进行中
- 垂直切片优先：宁可窄而通，不要宽而断。
- 每个里程碑结束都要能 `slidesmith build` 出真东西（M2 起）。
- 两个高风险点尽早 spike：IR schema(M0)、`file://` 双屏同步(M1 期间预研)。

## 完成定义 (DoD)
1. 代码 + 测试通过（vitest 单元 + Playwright 产物）。
2. `examples/` 有可跑样例。
3. 该里程碑验收信号实测勾掉。
4. **记忆 flush**（见下）。

## 记忆 Flush（每个里程碑结束执行）
- `active.md`: 更新 Current State + Next Likely Action（保持 <900 中文字）。
- `decisions.md`: 新增/变更/废止的决策（含为什么）。
- `timeline.md`: 追加当日完成事项。
- `episodic_index.md`: 每个有意义事件一行（带 keywords + 文件）。
- 长细节/旧草稿 → `archive/`，不要塞进 active。
- 预算检查: `python3 ~/.claude/skills/project-memory-system/scripts/check_memory_budget.py "<project>"`

## 不要做
- 不把整篇文档抄进记忆（链引用即可）。
- 不让记忆变日记。
- 不在 active 堆历史。
