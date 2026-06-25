---
name: slides-presenter-mode
description: |
  给已有 HTML slides 加 "演讲者模式" · 主屏翻页时副屏（iPad / 便携屏）自动同步显示当前 slide 对应的讲稿 · 并把该 slide 对应的讲稿段落整块浅色高亮。
  v0.3 新增：双向联动（演讲者按键 / TOC 点击 → slides 翻页）· 正向跟随 + 反向跟随分离 · Keywords 提词高亮（仅激活板块）· 红绿状态色。
  适用场景：现场授课讲师有第二屏 / iPad · 想要"翻 PPT 时副屏自动跟到当前 slide 的讲稿" · 或者讲师在副屏用键盘控制翻页。
  类似传统 PPT 的"演讲者视图（presenter view）" · 但用纯 HTML + 浏览器原生 API 实现 · 不依赖任何 PPT 软件。
  当用户说 "演讲者模式 / presenter mode / 副屏 / 第二屏 / iPad 第二屏 / 讲稿同步 / 讲师视图 / 备课时翻页同步 / 主副屏 / 反向联动 / 双向同步 / 关键词高亮 / 提词" 时启用。
  也适用于"我的 slides 已经有了 · 讲稿也有了 · 想把它们对接起来" 这种整合性需求。
metadata:
  version: 0.3.0
  status: dogfood-validated-v3
  part_of: auto_courses
  layer: horizontal_sub_skill
  serves_phases: [6, 9]
  dogfood_case: 福泉商务局 5h 课程 · 2026-05-27 · 145 slides + 5 段讲稿 · 4 轮迭代（v0.1 → v0.3）
  dogfood_date: 2026-05-27
---

# slides-presenter-mode v0.3.0

> 把任意 HTML slides 升级为带"演讲者模式"的**双向**演示系统。
> 关键洞察：**用浏览器原生跨窗口通信（BroadcastChannel + postMessage + localStorage event）就能实现媲美 Keynote / PowerPoint Presenter View 的效果 · 但完全是 HTML + JS · 文件可移植 · 不依赖任何专门软件**。
> v0.3 进一步：**不只 slides 推副屏 · 副屏也能推 slides** — 实现真正的双向同步。讲师在主屏 / 副屏哪边都可以"主导"翻页。

---

## 何时使用这个 skill

**触发条件**（满足任一）：

- 课程要现场交付 · 讲师有第二屏 / iPad / 便携屏
- 已有 slides HTML + 讲稿 HTML（或讲稿 markdown）· 想把它们对接成"翻页即同步讲稿"
- 讲师对课程不熟 · 需要副屏 prompt 加持以稳定输出
- 课程 50+ slides · 讲师无法记住每张对应什么——同步是刚需
- 想要 Keynote 那种 "presenter view" 但又坚持用 HTML（可移植 / 可版本控制 / 可团队共享）

**不使用**：

- slides 不足 30 张 · 讲师全记得住——上不上副屏都行
- 录播课（不是现场）——副屏没意义
- 讲稿和 slides 还没做完——先做完再来用本 skill

---

## v0.2 跟 v0.1 比 · 学到了什么

> 福泉课 dogfood 2 轮 · 关键学习：

### 红线 ⭐⭐⭐ · **必须做真正的 1:1 映射**

- **v0.1 anti-pattern**：粗映射（145 slide 共用 71 锚点 · 多 slide 共享 1 锚点）→ 翻页时讲稿跳回小节开头 · 用户被迫手动滚 · 失去同步意义
- **v0.2 红线**：**每张 slide 必须有唯一锚点** · 即使讲稿一段对应多张 slide · 也要在该段内插入细粒度锚点（命名约定 `sN-Ma` / `sN-Mb` / `sN-Mc`）
- 福泉课实测：71 锚点 → 145 锚点 · 用户体感天差地别

### 红线 ⭐⭐ · **副屏必须显示"整块高亮"而非只标题**

- **v0.1 anti-pattern**：只高亮 h3.sub 小节标题（红边）→ 用户不知道一张 slide 对应整块讲稿的"哪一段"
- **v0.2 红线**：当前 slide 对应锚点开始 · 沿 sibling 链向后走到下一锚点为止 · 这一整段都加浅金高亮背景 + 左金条
- 视觉解决方案：用 `box-shadow: -8px 0 0 -2px gold` 画"外左金条"（不占布局空间 · 不和已有 border 打架）

### 工程化 · **70+ 锚点别手插 · 用 Python 批量脚本**

- 145 slide 需要 70+ 个细粒度锚点 · 手 Edit 一个一个加 = 不可靠（出错率高）
- 用 `templates/anchor-insertion-script.py.template` —— 列出 `(line_num, new_id, tag_pattern)` 计划表 · 一次跑完
- 脚本自带"行号 + 期望 tag" 双重校验 · 任何不一致直接报错不写文件

### 红线 · **改前先备份**

- 改 3 个 HTML 文件（slides + 副屏 + 讲稿）前 · 全部带时间戳备份
- 命令：`cp file.html file.html.bak-$(date +%Y%m%d-%H%M)`

---

## v0.3 跟 v0.2 比 · 学到了什么（4 轮 dogfood · 福泉课）

### 红线 ⭐⭐⭐ · **双向通信必须带 source 字段**

- **v0.2 anti-pattern**：只有 slides → 副屏单向广播 · 没有反向通道 · 讲师手持键盘必须在主屏焦点才能翻页 · 焦点跑到副屏就尬住
- **v0.3 红线**：实现 slides ↔ presenter 双向广播 · 每条消息带 `source: 'slides' | 'presenter'` · 收方根据 source 守门防回声
- 详细契约见 `references/reverse-sync-design.md`（6 类消息表 · 3 种反向触发路径 · 启动顺序）

### 红线 ⭐⭐⭐ · **iframe 焦点不能吞键盘**

- **v0.2 anti-pattern**：焦点点到 iframe（讲稿）里 · parent 的 keydown listener 收不到 · 翻页笔失灵
- **v0.3 红线**：讲稿端加 keydown listener · 命中翻页键 / 快捷键时 `postMessage('fuquan-nav-key')` 给 parent · parent 接收 + dispatch
- 守门：`if (!window.parent || window.parent === window) return;`——讲稿 standalone 浏览时不影响原生键盘

### 红线 ⭐⭐ · **Keywords 高亮必须限当前激活板块**

- **anti-pattern**：`body.cue-on strong` 高亮全文所有 `<strong>` · 1500+ 个一齐变红 · 没有重点 · 用户反馈"晃眼"
- **v0.3 红线**：用 `body.cue-on :is(.presenter-block-current, .presenter-current) strong` 把范围收窄到当前板块
- 副作用：必须先有 v0.2 的整块高亮基础设施（`.presenter-block-current` 类）

### 工程化 · **跟随 / 同步 拆分 + 红绿色态**

- v0.2 一个"自动跟随"按钮承担"翻页跟"和"位置同步"两个职能 · 概念混乱
- v0.3 拆成 4 个：→ 跟随 / ← 跟随 / → 同步 / ← 同步 · 各自语义清晰
- 跟随类用 `state-on` 绿 / `state-off` 红 色态 · 一眼看出当前开关状态
- 同步类保持中性灰（一次性按钮 · 无开关状态）

---

## 这个 skill 不是什么

- **不是做 slides** —— 你已有 slides HTML（本 skill 在它上面打补丁）
- **不是写讲稿** —— 讲稿应已存在（理想是 HTML · 也可以是 markdown 在 iframe 显示）
- **不是 PPT 软件复刻** —— 用浏览器原生能力实现 · 比任何 PPT 都轻量 · 但无 ppt 那种内置时间线

---

## 入口 · 必填 3 件套

### 1. 主屏 slides HTML

- 单文件 · 内含全部 slides · 已有翻页逻辑（next/prev/setActive 等）
- 必须有：当前 slide 索引（idx）+ 翻页函数（setActive 或类似）+ 顶部工具栏（topbar）
- 例：`fuquan0527.html` 145 张 slides

### 2. 副屏要显示的"讲稿源"

可选三种：

- **(a) 已做好的讲稿 HTML**（推荐）—— 含锚点 id="s0-1" 等的分节文档。**最佳来源：用 `transcripts_html` skill 生成**——它做出来的讲稿天生就带 1:1 锚点（`h3.sub id="sN-M"`）+ 整块高亮/Keywords/反向同步监听（本 skill 的片段①②③已烤进模板），本 skill 只需做副屏 + 对齐频道名即可，省掉 Step 3/7 的锚点插入与监听注入。
- **(b) Markdown 讲稿（有 build 脚本生成 HTML 的）** —— **别手插锚点**；把锚点+监听烤进 build 脚本（文本片段匹配）。配方见 `references/md-generated-script.md`（2026-06-03 dogfood）。⚠️ 接非福泉 deck 时**先对齐频道名**。
- **(c) inline 内嵌**—— 简短场景下可把讲稿直接写进副屏 HTML

### 3. slide → 讲稿子节 1:1 映射表

⭐⭐⭐ **这是最关键的人工产物——决定副屏的同步精度。必须 1:1**。

格式：长度等于 slide 总数的数组 · 每项是讲稿锚点 id · **每个值必须唯一**：

```js
const SLIDE_MAP = [
  's0-1',   // slide 0: cover
  's0-2',   // slide 1: 痛点共鸣 (小节开头)
  's0-2a',  // slide 2: 我先不讲 AI · 先讲你（同段不同点 · 加细粒度锚点）
  's0-2b',  // slide 3: 这些痛可以变小（再细一格）
  's0-3',   // slide 4: 下一小节
  // ...
];
```

⛔ **反例**：

```js
// 错误！多个 slide 共享同一锚点
const SLIDE_MAP_BAD = ['s0-2','s0-2','s0-2','s0-2', ...];
```

建表流程见 `templates/slide-anchor-mapping.md`。
锚点插入用 `templates/anchor-insertion-script.py.template`。

---

## 出口 · 3 件套

1. **改造后的 slides HTML**——新增 1 个按钮（🖥 演讲者）+ 注入的广播逻辑 + 完整 1:1 SLIDE_MAP / SLIDE_TITLES 数组
2. **新增的副屏 HTML**（如 `演讲者模式.html`）——深色 header + iframe 嵌讲稿 + 计时器 + 锁定 + 缩放 · 用 anchor 比较代替 slideIdx 比较（鲁棒）
3. **改造后的讲稿 HTML**——加 1 段 postMessage 监听 + 整块高亮 JS + CSS

---

## 7 步骤工作流

### Step 0 · 备份（red line）

```bash
TS=$(date +%Y%m%d-%H%M)
cp slides.html slides.html.bak-${TS}
cp 讲稿.html 讲稿.html.bak-${TS}
# 如果副屏文件已存在也备
[ -f 演讲者模式.html ] && cp 演讲者模式.html 演讲者模式.html.bak-${TS}
```

### Step 1 · 摸清主屏 slides API

读主屏 slides HTML · 定位：

| 要找的东西 | 用于 |
|---|---|
| 翻页函数（`setActive(n)` / `goSlide(n)` 等） | 注入广播 hook |
| 当前 idx 状态变量 | 翻页时读它 |
| 顶部工具栏 DOM（`.topbar` 或类似） | 加"演讲者模式"按钮 |
| 总 slide 数（`total` / 145） | 副屏 header 显示 |
| 每张 slide 的标识（`data-seg` / `data-i` 等） | 帮助建 SLIDE_MAP |

### Step 2 · 抽取所有 slide 标题（建 SLIDE_TITLES）

副屏 header 要显示"当前 / 上一张 / 下一张" slide 标题 · 用 Python 抓 `<h1>` `<h2>` `<h3>` 文本（详见 `templates/slide-anchor-mapping.md` 末尾代码）。

### Step 3 · 给讲稿 HTML 加细粒度锚点（key activity）

这是**改造讲稿 HTML 的关键活**。两套做法：

**(a) 锚点放已有元素上**（推荐）—— 给现有 `<h4>` / `<blockquote class="script">` / `<div class="golden">` / `<pre class="prompt">` / `<div class="interact">` / `<table>` 加 `id="sN-Mletter"`：

```html
<!-- 改之前 -->
<h4>✅ 特征 1 · 会用工具</h4>

<!-- 改之后（slide 58 锚到这里）-->
<h4 id="s2-2b">✅ 特征 1 · 会用工具</h4>
```

**(b) 无现成元素时插 `<span>` 锚点** —— 仅当上述结构元素不够用时：

```html
<span id="s0-2a"></span>
<p>普通段落文本……</p>
```

⭐ **批量插用 Python 脚本** · 见 `templates/anchor-insertion-script.py.template`。

### Step 4 · 建 1:1 SLIDE_MAP

长度 = slide 总数 · 每项唯一 · 详见 `templates/slide-anchor-mapping.md`。

### Step 5 · 改造主屏 slides（注入广播）

用 `templates/slides-injection.js.template` · 替换占位 · 5 处 Edit：

1. 顶栏加"🖥 演讲者"按钮
2. 按钮 CSS
3. SLIDE_MAP / SLIDE_TITLES / broadcastPresenter / openPresenter
4. setActive 末尾加 `broadcastPresenter(idx);`
5. 按钮事件 + S 键快捷键

### Step 6 · 复制副屏 HTML（presenter-view）

`templates/presenter-view.html.template` 是完整可用的副屏 HTML——替换 3 个占位：

- `{{SCRIPT_BASE}}` —— 讲稿 HTML 的相对路径
- `{{SLIDE_MAP_LOCAL}}` —— 上一步建的 SLIDE_MAP
- `{{SEG_NAMES}}` —— 段名数组

副屏 HTML 自带：BroadcastChannel + localStorage 双通道接收 · iframe 加载讲稿 · 深色 header（slide #/标题/上下张预览/计时器/锁定/缩放）· **anchor 比较代替 slideIdx 比较**（鲁棒）。

### Step 7 · 改造讲稿 HTML（postMessage 监听 + 整块高亮）

讲稿 HTML 加 2 处：

- 1 段 CSS（`presenter-block-current` 整块高亮 + 各元素变体 h4 / pre.prompt / table）
- 1 段 JS（`window.addEventListener('message', ...)` 监听 + scrollIntoView + 沿 sibling 链整块高亮）

模板：`templates/script-listener.js.template`。

---

## 验证清单

做完一定要本地验证（最低试 5 张 slide · 跨段试）：

- [ ] 主屏 slide 翻页 · 副屏 header 数字 + 标题 + 上下张预览 立即更新
- [ ] 主屏翻到段交界处 · 副屏 iframe 自动滚到对应锚点
- [ ] **每张 slide 都对应一个独立锚点** · 不会出现连续两张 slide 跳到同位置
- [ ] **整块高亮**：当前 slide 对应的 N 个元素（h4 + blockquote + golden 等）都有浅金色背景 + 左金条
- [ ] 翻下一页 · 旧块高亮淡出 · 新块高亮淡入
- [ ] 副屏点 "🔒 锁定" · 主屏翻页副屏不再跳（计时和 header 仍更新 OK）
- [ ] 副屏点 "↻ 同步" · 强制重跳到当前对应锚点
- [ ] 主屏关掉后 · 副屏仍能显示最后状态（不崩）
- [ ] iPad / Sidecar 上副屏字号 / 锁定 / 计时 都好用

---

## 红线 / 不要做的事

⛔ **不要做粗映射**（多 slide 共享 1 锚点）—— 用户翻页时讲稿跳回小节开头 · 失去同步意义。每张 slide 必须有唯一锚点。

⛔ **不要把讲稿直接 inline 内嵌进副屏 HTML**——讲稿是大文档（50K+ 字）· inline 会让副屏 HTML 巨大不可维护。用 iframe 引用是正解。

⛔ **不要假设 file:// 同源**——主屏 / 副屏 / 讲稿很可能在 file:// 不同目录 · 浏览器视为不同 origin · 因此 iframe 滚锚点必须用 postMessage（cross-origin safe）· 别用 contentDocument 直接 DOM 访问（会被拦）。

⛔ **不要只用 BroadcastChannel 一个通道**——Safari / 老 Chrome / 某些 WebView 不一定支持。必须加 localStorage event 作为 fallback。

⛔ **不要 setActive 每次都 `iframe.src = ...#anchor`**——这会重载 iframe · 闪屏 + 丢失 scroll 位置。用 postMessage 让 iframe 自己 scrollIntoView。

⛔ **不要忘记副屏需要"锁定 / 自由滚"模式**——讲师有时想往后翻几页讲稿预读 · 不希望主屏翻页把他拽回去。L 键切换。

⛔ **不要用 slideIdx 比较来判定是否重跳**——用 anchor 比较（`s.anchor !== lastAnchor`）。即使两 slide 偶然同锚点也不会重跳 · 保住用户手动滚动的位置。

⛔ **不要手 Edit 70+ 锚点**——用 Python 批量脚本。手插易错 + 一次校验不通过整批不写文件。

⛔ **不要改 3 个 HTML 文件不备份**——红线 0 操作就是备份。

---

## 关键技术决策（背后的"为什么"）

| 决策 | 替代方案 | 为什么选这个 |
|---|---|---|
| **真正 1:1 SLIDE_MAP** | 多 slide 共享锚点 | 粗映射 = 反复跳回小节开头 = 同步无意义 |
| **整块高亮（sibling 遍历）** | 只高亮锚点元素 | 一张 slide 通常对应讲稿多个相邻元素（h4 + blockquote + golden 等）· 整块亮起来才能看清范围 |
| **box-shadow 画外左金条** | border-left | 不占布局空间 + 不和已有元素的 border-left 打架（blockquote 有红 border / golden 有金 border） |
| **锚点放已有结构元素** | 插 span 锚点 | 减少 HTML 增量 + 滚锚点时元素本身就是视觉锚（更直观） |
| **Python 批量脚本插锚点** | 手 Edit | 70+ 锚点 · 手插 100% 出错 · 脚本带校验 + 原子写入 |
| **anchor 比较代替 slideIdx 比较** | slideIdx 比较 | 鲁棒：偶发同锚点不重跳 · 保住用户手动滚位 |
| **BroadcastChannel + localStorage 双通道** | 只用其一 | BC 性能好但兼容性参差 · localStorage 兼容全但延迟 5-50ms · 双通道 BC 优先 localStorage 兜底 |
| **iframe 嵌讲稿** | 把讲稿内容内联到副屏 HTML | 讲稿 50K+ 字 · 内联让副屏 HTML 巨大；iframe 还允许讲稿独立维护 |
| **postMessage 滚锚点** | `iframe.contentWindow.location.hash` | file:// 跨目录跨域稳定（hash 写有时被拦）· postMessage 是 W3C 跨域通信标准 |
| **深色 header + 浅色 iframe** | 全黑 / 全白 | 演讲者副屏长时间凝视 · header 深色减疲劳；讲稿区浅色还原阅读体验 |
| **lock 模式** | 永远自动跟随 | 讲师有真实需求"现在我想往后翻 3 段预读"——锁定是基本功能 |
| **zoom 不用 transform scale** | transform: scale | scale 会破坏 iframe 布局 / 触发滚动条溢出；CSS zoom 直接放大字号不改尺寸 |

---

## 文件清单

```
slides-presenter-mode/
├── SKILL.md                                    (本文件 · v0.3.0)
├── CHANGELOG.md                                版本变更（含 v0.2 / v0.3 反哺记录）
├── AGENTS.md                                   执行 agent 工作守则
├── templates/
│   ├── presenter-view.html.template            ⭐ 副屏 HTML 完整模板（v0.3 含正反跟随 + Keywords + 反向广播）
│   ├── slides-injection.js.template            ⭐ 主屏注入代码（v0.3 含反向接收 + source 字段）
│   ├── script-listener.js.template             ⭐ 讲稿监听 + 整块高亮 + Keywords CSS+JS（v0.3 含键盘转发 + TOC 转发）
│   ├── anchor-insertion-script.py.template     ⭐ Python 批量插锚点脚本（v0.2 新增）
│   └── slide-anchor-mapping.md                 怎么建 1:1 SLIDE_MAP（v0.2 加强 1:1 红线）
├── references/
│   ├── cross-window-sync.md                    BC / localStorage / postMessage 3 通道对比
│   ├── browser-compat-notes.md                 file:// 跨域 / iPad Safari / Sidecar 实战
│   ├── highlight-design.md                     ⭐ 整块高亮的 CSS+JS 设计（v0.2 新增）
│   └── reverse-sync-design.md                  ⭐ v0.3 三端通信契约 · 6 类消息 · 防回声 · 3 种反向路径
└── examples/
    └── fuquan-2026-05-27.md                    Dogfood 案例（含 v0.1 → v0.3 4 轮迭代复盘）
```

---

## Dogfood case

**福泉商务局 AI 课程 · 2026-05-27 交付 · 4 轮迭代（v0.1 → v0.3）**

- 145 张 slides（5 段 · 段 0/1/2/3/4 = 18/36/51/20/20）
- 5 段讲稿（71 子节锚点 → 145 子节锚点 v0.2 加细 → v0.3 块级 Keywords 高亮）
- 副屏从 v0.1 单向同步 → v0.3 双向联动 + 提词系统
- 讲师反馈轨迹：
  - v0.1："这种方法太好了" + "这种方法很棒"（基础同步）
  - v0.2："整块高亮对应效果就会更加好"（请求高亮升级）
  - v0.2.2/2.3："旋转 iPad 竖向" + "状态栏占太多空间"（移动端体验）
  - v0.3："键盘和翻页笔在副屏失灵" + "现场念讲稿不好" + "目录点了 slides 不联动" → 一次性解决：反向联动 + Keywords 提词 + TOC 转发

详 `examples/fuquan-2026-05-27.md`。

---

## 反哺方向（未来 · v0.4+）

- v0.4：自动生成 SLIDE_MAP 草稿（基于 slide 标题与讲稿 h3/h4 子节标题的语义匹配 · LLM 辅助）
- v0.4：支持讲稿是 Markdown 的情况（自动 md → html · 自动锚点注入）
- v0.4：支持 slide 内有多个"动画步骤"（增量披露）—— 一张 slide 多次广播 step 状态
- v0.4：iPad 横屏扩展屏 + 竖放观看时触摸滚动方向 mapping（v0.3 暂用键盘 + tap 热区绕开）
- v0.4：Keywords 标注 LLM 辅助 — 在讲稿 `<strong>` 之外自动建议关键句（依据：数字 + 对比词 + 金句首字）
- v0.4：录屏 / 回放（讲完后导出"翻页时间线"作为复盘资料）
