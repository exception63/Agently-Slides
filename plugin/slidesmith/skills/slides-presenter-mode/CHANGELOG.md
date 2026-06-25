# CHANGELOG · slides-presenter-mode

## v0.3.0 · 2026-05-27 · 双向联动 + Keywords 提词 + 拆按钮

**福泉课现场前一日 · 一次性解决 3 个用户反馈**：

1. "键盘和翻页笔在副屏窗口失灵 · 焦点跑到讲稿就尬住"
2. "讲稿挨着念不好 · 想要关键词高亮提词 · 但又不能太突兀"
3. "目录点了 slides 没联动 · 还得用键盘翻回去 · 操作断流"

### 新增能力

| 能力 | UI | 快捷键 | 说明 |
|---|---|---|---|
| 正向跟随（toggle） | → 跟随（绿/红） | L | slides 翻页 → 讲稿滚动 · 默认开 |
| 反向跟随（toggle） | ← 跟随（绿/红） | J | 演讲者按键 → slides 翻页 · 默认开 |
| 正向同步（一次性） | → 同步 | S | 讲稿跳到 slides 当前位置 |
| 反向同步（一次性） | ← 同步 | D | slides 跳到讲稿当前位置 |
| Keywords 提词（toggle） | ✦ Keywords（绿/红） | K | 当前激活板块的 `<strong>` 高亮（不是全文） |
| 反向键盘 / 翻页笔 | — | ←/→/PgUp/PgDn | 反向跟随开 → 联动 slides；关 → 滚讲稿 |
| TOC 点击联动 | — | — | 讲稿目录点击 → slides 自动跳到对应 slide |

### 新增 3 红线（细节见 SKILL.md "v0.3 跟 v0.2 比"）

1. ⭐⭐⭐ 双向通信必须带 `source` 字段（防回声）
2. ⭐⭐⭐ iframe 焦点不能吞键盘（讲稿端转发给 parent）
3. ⭐⭐ Keywords 高亮必须限当前激活板块（不能全文 strong）

### 技术架构

- **三端通信**：slides ↔ presenter（BroadcastChannel）↔ iframe（postMessage）
- **6 类消息**：正向状态 / fuquan-scroll / fuquan-cue / fuquan-query-current / fuquan-current-anchor / jump-to-slide / fuquan-nav-key / fuquan-toc-jump
- **防回声**：每条消息带 `source: 'slides' | 'presenter'`，收方只处理对方源
- **嵌入检测**：讲稿端 `if (window.parent === window) return` 守门 · standalone 浏览不影响
- 详尽契约：`references/reverse-sync-design.md`

### UI 改进

- 去掉锁的 🔓 和弯箭头 ↻ 图标 · 替换为方向箭头 → / ←
- 4 个 toggle 按钮（跟随 ×2 + Keywords）用红绿色态：`--state-on: #6FAA82` 玉绿 / `--state-off: #C76B5B` 赤陶
- 同步类按钮保持中性灰（一次性 · 无状态）
- A− / A＋ 缩小到一个 grid 单元 · 给 Keywords 让出位置
- 旋转按钮占整行（`.ctrl-btn--wide { grid-column: 1 / -1 }`）

### 实现要点

- presenter 端 `handleKey(key)` 抽成统一入口 · 给 keydown + iframe 转发都复用
- presenter 端 `resolveAnchorToSlideIdx(anchor)` 支持 sN-x / seg-N / sN-data 三类
- 讲稿端 `findCurrentAnchor()` 基于 scrollY 找视窗上 1/4 处最近 anchor
- 讲稿端 Keywords CSS：`body.cue-on :is(.presenter-block-current, .presenter-current) strong`
- 底部水彩刷渐变高亮（55%-92% vermilion-tint 半透明）· 不突兀
- localStorage 持久化所有 toggle 状态（forwardFollow / reverseFollow / cueOn）

### 更新文件

**live**：
- `Fuquan_final/02-slides/演讲者模式.html`（23K → 28K）
- `Fuquan_final/02-slides/fuquan0527.html`（+反向接收）
- `Fuquan_final/01-讲稿/打磨版-v2/讲稿合集-备课版.html`（+键盘转发 + TOC 转发 + Keywords CSS）

**skill 模板（本次反哺）**：
- `templates/presenter-view.html.template` · 458 → ~590 行
- `templates/script-listener.js.template` · 157 → ~250 行
- `templates/slides-injection.js.template` · 140 → ~170 行
- `references/reverse-sync-design.md`（新增 · ~200 行三端通信契约）
- `SKILL.md` · 加 v0.3 学习节 + 文件清单更新 + dogfood case 4 轮迭代轨迹

---

## v0.2.3 · 2026-05-26 · 状态栏可隐藏（释放讲稿阅读空间）

**福泉课用户反馈：状态栏占据屏幕较大比例**。

加右上角浮动 `👁 / ☰` 按钮 + H 键快捷键 · 折叠/展开整个 header 区（slide 信息 / 计时器 / 控制按钮 / 状态行）· iframe 撑满屏幕。

实现要点：
- `body.collapsed .phead, body.collapsed .phead__status` → max-height: 0 + opacity: 0 + padding: 0
- 浮动按钮 `.hide-btn` 在 .layout 内 · 跟随旋转 · 始终可见（活跃时金色高亮）
- 平滑过渡 0.32s ease-out
- localStorage 持久化（关闭副屏再开 · 隐藏状态保留）
- 与旋转 + 锁定 + 缩放等其他状态正交（可叠加：旋转 + 隐藏栏 = 竖向纯讲稿全屏阅读）

更新文件：
- live：`02-slides/演讲者模式.html`（20K → 23K）
- skill 模板：`templates/presenter-view.html.template`

---

## v0.2.2 · 2026-05-26 · 副屏可旋转 90°（iPad 竖向 sidecar 用）

**福泉课用户反馈：iPad sidecar 只能横向 · 想用竖向显示更多讲稿内容**。

加 "⟲ 旋转 90°" 按钮 + O 键快捷键 · 用 CSS `transform: rotate(90deg)` + 宽高互换实现。用户切换后 · 把 iPad 物理拧到竖向 · 内容自然成正向。

实现要点：
- `body.rotated .layout { transform: rotate(90deg); transform-origin: 0 0; left: 100vw; width: 100vh; height: 100vw; }`
- `.layout` transition 0.35s 平滑切换
- 旋转后 300ms 自动重跳锚点 · 防止滚动位置错乱
- localStorage 持久化（关闭副屏再开 · 旋转状态保留）
- toast 移入 `.layout` 内 · 跟着旋转

更新文件：
- `templates/presenter-view.html.template`（skill 模板 · 下次新课自带）
- live 文件：`02-slides/演讲者模式.html`

---

## v0.2.1 · 2026-05-26 · 高亮色微调

**福泉课用户反馈："浅棕色不突出"** · 改为正红色 rgba(220, 30, 45)。

仅色值调整 · 几何 / 过渡 / class 名 / JS 逻辑全部不动。同步：
- `01-讲稿/打磨版-v2/讲稿合集-备课版.html`（live 文件）
- `templates/script-listener.js.template`（skill 模板）
- `references/highlight-design.md`（设计说明）

---

## v0.2.0 · 2026-05-26 · 用户反馈驱动迭代

**福泉课 dogfood 同日下午迭代 · 用户反馈两轮** · status: dogfood-validated-v2

### 新增红线（⭐⭐⭐ 优先级）

1. **必须做真正的 1:1 映射** —— 每张 slide 唯一锚点 · 禁止多 slide 共享 1 锚点（v0.1 anti-pattern）
2. **必须做整块高亮** —— 沿 sibling 链高亮当前 slide 对应的所有相邻元素 · 不只标小节标题
3. **改前必备份** —— 命令 `cp file.html file.html.bak-$(date +%Y%m%d-%H%M)`

### 新增产物

- `templates/anchor-insertion-script.py.template` —— Python 批量插锚点脚本（70+ 锚点的工程化工具 · 带 line + tag 双重校验 + 原子写入）
- `references/highlight-design.md` —— 整块高亮的 CSS+JS 设计 + 视觉对比 + 为什么这样做

### 模板更新

- `templates/script-listener.js.template`：CSS 增加 `.presenter-block-current` + h4 / pre.prompt / table 变体 · JS 增加 `highlightBlock` + `clearHighlights` + `currentBlockEls` 跟踪
- `templates/presenter-view.html.template`：`applyState` 改用 anchor 比较代替 slideIdx 比较（鲁棒）
- `templates/slide-anchor-mapping.md`：强化 1:1 红线 · 加 anti-pattern 反例 · 加 Step 3 "插细粒度锚点" + 校验脚本（含禁连续相同检查）
- `SKILL.md`：v0.1 → v0.2 lessons learned 节 · 6 个新红线 · 7 步骤工作流（多 Step 0 备份）

### 实战数据（福泉课）

| 指标 | v0.1 | v0.2 |
|---|---|---|
| 锚点数 | 71 | 145 |
| slide 数 / 锚点 | 2.0（最高 6） | 1.0（全 1） |
| 用户反馈 | "很棒" · 但"分不清对应关系" | "对应效果好" |
| 总建设耗时 | 80 min | 80 + 56 min |

---

## v0.1.0 · 2026-05-26 · Dogfood-validated

**第一次成形 · 福泉商务局 5h 课程 (2026-05-27) 首验**

### 包含
- SKILL.md · 6 步骤工作流 + 入口/出口契约 + 5 红线
- templates/
  - `presenter-view.html.template` · 副屏 HTML 完整模板（深色 header + iframe + 计时器 + 锁定 + 缩放）
  - `slides-injection.js.template` · 主屏注入代码（5 个片段：HTML 按钮 / CSS / SLIDE_MAP / setActive hook / 事件绑定）
  - `script-listener.js.template` · 讲稿监听代码 + 高亮 CSS
  - `slide-anchor-mapping.md` · 怎么建 SLIDE_MAP（3 步流程 + 验证脚本）
- references/
  - `cross-window-sync.md` · BroadcastChannel + localStorage + postMessage 3 通道对比
  - `browser-compat-notes.md` · 浏览器矩阵 + iPad Sidecar 实战 + 调试技巧
- examples/
  - `fuquan-2026-05-27.md` · Dogfood 案例 · 145 张 slide + 71 锚点 + 80 min 建设

### 关键技术决策
- **双通道同步**：BroadcastChannel + localStorage event（健壮）
- **跨域 iframe**：postMessage（file:// 跨目录唯一稳）
- **iframe 引用讲稿**：而非 inline（避免副屏 HTML 膨胀）
- **深色 header + 浅色内容区**：演讲者长凝视人体工学

### 已知限制 → v0.2 全部修复
- ~~SLIDE_MAP 需人工建表~~ → v0.2 强化 1:1 红线 + Python 批量脚本
- ~~只高亮小节标题~~ → v0.2 整块高亮

### Dogfood 反馈
> "这种方法太好了。" —— 周立影教授 · 2026-05-26 上午
