# AGENTS · slides-presenter-mode

> 给本 skill 的执行 agent（Claude / 任何 LLM agent）的工作守则。
> v0.2 · 反映福泉课 2 轮迭代经验。

---

## 第 1 件事 · 先读 SKILL.md

任何调用都先把 `SKILL.md` 通读一遍 · 然后再决定要从哪个 template / reference 取材。

---

## 第 2 件事 · 收集 3 件套（必填）

不要跳过这步直接动手：

1. **主屏 slides HTML 的路径** —— 让用户给具体文件
2. **讲稿源** —— 是已做好的 HTML（最爽）/ Markdown（要先转）/ 还没做（让用户先做完讲稿再来）
3. **slide ↔ 讲稿子节的初步对应关系** —— 至少：
   - slide 总数？
   - 讲稿有多少子节？（grep 数 `<h3>` 数）
   - 段编号怎么映射（slide data-seg vs 讲稿 sN-M）

入口不齐就动手 = 后面要返工。

---

## 第 3 件事 · 按 7 步骤工作流逐步推进（v0.2）

SKILL.md 里的 7 个 Step 是顺序的：

- **Step 0 备份**（v0.2 新增 · 红线）—— 改前 3 个文件全部时间戳备份
- Step 1 摸 slides API
- Step 2 抽 SLIDE_TITLES
- Step 3 给讲稿 HTML 加细粒度锚点（v0.2 关键 · 用 Python 脚本）
- Step 4 建 1:1 SLIDE_MAP
- Step 5 主屏注入
- Step 6 副屏 HTML 复制 + 替换占位
- Step 7 讲稿监听（含整块高亮 CSS+JS）

不要跳步。Step 3 没做好 · Step 6 副屏永远跟不上。

---

## 第 4 件事 · 验证

每完成一步快速验证：

- Step 2 后：Python 数 SLIDE_TITLES 长度 = slide 总数？
- Step 3 后：grep 数讲稿锚点 ≥ slide 总数？
- Step 4 后：跑 SKILL.md "校验脚本" —— 长度 + 唯一性 + 无连续相同 + 段分布 + 锚点 in script 文件
- Step 7 后：本地浏览器打开 · 翻 5 张 slide · 副屏跟到对应位置 + **整块金色高亮**生效

跑通完整验证清单（SKILL.md "验证清单"段）再交付。

---

## 第 5 件事 · 不要做的事（v0.2 红线全集）

⛔ **不要做粗映射**（多 slide 共享 1 锚点）—— v0.2 红线 ⭐⭐⭐
⛔ **不要只标小节标题**（要做整块高亮）—— v0.2 红线 ⭐⭐
⛔ **不要改文件不备份** —— v0.2 红线
⛔ **不要手 Edit 70+ 锚点**（用 Python 脚本 · 带校验 + 原子写入）
⛔ 不要让 SLIDE_MAP / SLIDE_TITLES 长度对不上 slide 总数（脚本会崩）
⛔ 不要在 iframe 同步用 `contentDocument.querySelector(...)`（跨域被拦）
⛔ 不要把 BroadcastChannel name 写不同（主屏副屏要一致）
⛔ 不要让副屏 HTML inline 嵌讲稿（迁移性差 · 文件膨胀）
⛔ 不要忘记加锁定按钮（讲师高频需求）
⛔ 不要用 slideIdx 比较来判定是否重跳（用 anchor 比较）

---

## 沟通建议

跟用户的话术：
- "改之前我先把 3 个文件都备份" —— 红线 0 操作 · 透明
- "我先看一下主屏 slides 的 setActive / topbar 结构" —— 开口透明
- "SLIDE_MAP 必须 1:1 · 每张 slide 唯一锚点 · 我会在讲稿同一小节内插细粒度锚点（h4 / blockquote 上加 id）" —— 让用户参与决策
- "我会用 Python 脚本批量加 70+ 个锚点 · 带校验 · 不会出错" —— 工程化承诺
- "副屏会做小节标题红边 + 整块金色高亮 · 你翻一页可以看到金条柱整段亮起来" —— 视觉效果预期
- "建好后在你机器上跑一遍 · 翻几页确认副屏同步 · 我们再交付" —— 验收明确

---

## 与其他 skill 的协作

- 用 `outline-drafting` / `paper-drafting` 产出的讲稿 HTML 作为 SCRIPT_BASE
- 与 `sim-livecase` 协同：sim-livecase 的回放页也可以是副屏目标（不止讲稿）
- 与 `delivery-execution` 协同：演讲者模式属于交付前最后一公里
- 反哺 `course-capitalize`：v0.1 → v0.2 的迭代过程就是典型的"用户反馈驱动 skill 演化" · 应作为 capitalize 案例
