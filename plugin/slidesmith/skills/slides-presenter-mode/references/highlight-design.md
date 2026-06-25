# 整块高亮设计 · CSS + JS 实战

> v0.2 新增 · 为什么这么设计 · 踩过哪些坑。

---

## 问题陈述

**v0.1 的痛点**：副屏只高亮小节标题（h3.sub）红边脉冲 · 用户看不出"这张 slide 对应的具体是哪几段台词"。

讲稿一个小节通常含：
- h3.sub 小节标题
- 1-3 个 h4 子标题
- 4-8 个 blockquote.script（台词）
- 2-4 个 div.golden（金句）
- 0-2 个 pre.prompt（代码 / prompt）
- 0-2 个 div.interact / div.planb / div.warning（互动 / Plan B / 警示）
- 0-1 个 table（表格）

一张 slide 通常对应**其中相邻的 2-5 个元素**。用户要的是："这一组元素是当前 slide 在讲的"——**整块高亮**是答案。

---

## 设计原则

### 1. **不破坏现有样式**

讲稿 HTML 各元素已有：
- `blockquote.script`：`border-left: 3px solid red`（朱红）
- `div.golden`：`border-left: 5px solid gold`（金）+ 渐变 bg
- `div.interact`：`border-left: 4px solid jade`（墨绿）
- `div.planb`：`border-left: 4px solid vermilion`（朱红）

高亮**不能动这些 border-left**（语义颜色）· 不能动现有 bg。

→ **box-shadow 而非 border** + **bg-color 兜底**。

### 2. **不影响布局**

如果用 padding-left / margin-left 制造左侧偏移 · 不同元素的偏移量不一致会"卡顿感"。

→ **box-shadow 负偏移**（`-8px 0 0 -2px gold`）—— 阴影画在元素外左侧 · **完全不占布局空间**。

### 3. **多个相邻元素视觉连贯**

整块高亮 = N 个元素都加 class。N 个元素各自的 box-shadow 在同一垂直线上排列 · 视觉上形成"红条柱"贯穿整块。

bg-color 在每个元素内部铺浅金 · 元素间天然的 margin gap 处会有"白条" · 但因为 box-shadow 红条贯穿整段 · gap 视觉感不强。

### 4. **不同元素类型微调**

| 元素 | 调整 |
|---|---|
| `blockquote / div.stage / 普通段落` | 浅金 bg + 外左红条（默认） |
| `h4` | 更深一点的 bg（标题级别仍突出） + 圆角 + padding |
| `pre.prompt` | 保留深色底（#2A2A2A）· 红条更亮 + 外发光 |
| `table` | 浅金 bg + 描边 + 红条 |
| `div.golden / div.interact / div.planb` | 自带渐变 bg · 我的 bg-color 看不到 · 但红条仍可见 → 不需要特别处理 |

---

## 关键 CSS

```css
/* 基础 · 应用到所有高亮元素 · v0.2.1 正红色 */
.presenter-block-current {
  background-color: rgba(220, 30, 45, 0.14);
  box-shadow: -8px 0 0 -2px rgba(220, 30, 45, 0.70);
  transition: background-color 0.45s ease-out,
              box-shadow 0.45s ease-out;
}

/* h4 加强 · 标题更突出 */
h4.presenter-block-current {
  background-color: rgba(220, 30, 45, 0.22);
  box-shadow: -8px 0 0 -2px #C8203A;
  border-radius: 3px;
  padding: 4px 8px;
  margin-left: -8px;
}

/* pre.prompt 深色底兼容 */
pre.prompt.presenter-block-current {
  background-color: #2A2A2A;  /* 保留原 dark bg */
  box-shadow: -8px 0 0 -2px #E83048,
              0 0 0 1px rgba(220, 30, 45, 0.30);
}

/* table 整体范围 */
table.presenter-block-current {
  background-color: rgba(220, 30, 45, 0.10);
  box-shadow: -8px 0 0 -2px rgba(220, 30, 45, 0.70),
              0 0 0 1px rgba(220, 30, 45, 0.22);
}
```

**v0.2.1 色调演化**（福泉课用户反馈驱动）：

| 版本 | 高亮色 | 反馈 |
|---|---|---|
| v0.2 | 浅金 + 金条 | "视觉上不是很突出" |
| **v0.2.1** | **浅红 + 正红条**（rgba(220,30,45)）| "更显眼" |

为什么选 `rgba(220, 30, 45)`：
- 比讲稿 h3.sub 现有 vermilion (#B5293A) 略亮 · 在红同色系下更突出
- 不至于刺眼（不是纯红 #F00 · 而是偏正的中国红）
- 与 ink-on-paper 配色协调 · 在浅米底 (#FAF6EE) 上读着不晕

**关键参数解读 box-shadow: -8px 0 0 -2px**：

- `-8px` x 偏移：阴影画在元素**左侧 8px 处**（负值 = 向左）
- `0` y 偏移：垂直方向不偏
- `0` blur：阴影锐利无模糊
- `-2px` spread：阴影缩小 2px · 让红条宽度 = 8-(-2)×2 = 4-6px（视觉感是 4px 左右的细条）

为什么是 `-8px` 偏移 + `-2px` spread 而不是直接 `-4px 0 0 0`？
- `-4px 0 0 0` 会画一个 0×元素高 的阴影在元素左侧 4px 处 · 但实际是 0 像素宽（无 spread 增强）· 看不见
- `-8px 0 0 -2px` 用 spread 把阴影"撑大" · 让它有可见宽度

---

## 关键 JS

```js
function highlightBlock(startEl) {
  // 1) 起点元素本身 · 如果不是 h3.sub 就加 block-current
  //    （h3.sub 有自己的红边脉冲 · 不重复加 bg）
  const startIsSub = startEl.matches('h3.sub');
  if (!startIsSub) {
    startEl.classList.add('presenter-block-current');
    currentBlockEls.push(startEl);
  }

  // 2) 沿 nextElementSibling 链向后 · 直到下一个锚点
  let cur = startEl.nextElementSibling;
  while (cur) {
    // 停止条件 1：下一个 sN 锚点
    if (cur.id && /^s\d/.test(cur.id)) break;
    // 停止条件 2：下一个 h3.sub（子节标题 · 即使没 id 也是边界）
    if (cur.matches && cur.matches('h3.sub')) break;
    // 停止条件 3：appendix 区（关键数据 / 物料清单）
    if (cur.classList && cur.classList.contains('appendix')) break;

    cur.classList.add('presenter-block-current');
    currentBlockEls.push(cur);
    cur = cur.nextElementSibling;
  }
}
```

**为什么用 `nextElementSibling`** 而不是 `nextSibling`？
- `nextSibling` 会取到文本节点（whitespace · #text）· 没有 .matches / .classList 方法
- `nextElementSibling` 只取 Element 节点 · 干净

**为什么沿 sibling 链而不是用 querySelector**？
- 锚点在 article > 直接子级。sibling 链天然界定"块"边界
- querySelector 选不出"相邻直到某条件" 的元素集合
- 沿链遍历 + 显式停止条件 · 直观易调试

**为什么 3 个停止条件**？
- 条件 1：处理 v0.2 细粒度锚点（`s2-2b`, `s2-2c` 等）
- 条件 2：处理 h3.sub 边界（即使没 id 比如某些手写未编号的也能停）
- 条件 3：处理 appendix（关键数据 / 物料清单不应该被算进 slide 的"块"内）

---

## 清除逻辑

```js
let currentSubHighlight = null;
let currentBlockEls = [];

function clearHighlights() {
  if (currentSubHighlight) {
    currentSubHighlight.classList.remove('presenter-current');
    currentSubHighlight.style.animation = '';
  }
  currentBlockEls.forEach(e => e.classList.remove('presenter-block-current'));
  currentBlockEls = [];
}
```

**关键**：用一个数组 `currentBlockEls` 跟踪所有当前高亮的元素 · 切换时一次性清掉。比 `document.querySelectorAll('.presenter-block-current')` 然后清 · 性能更好（不扫描整篇文档）。

---

## 视觉对比 · v0.1 vs v0.2

### v0.1（仅小节标题红边）

```
┃ ▍2.2 心智模型 2 · Agent           ← 红色左边框 + 红渐变
  
  ● 投屏切 心智模型 2 图
  
  [Agent = 助理]                    ← 用户看不出哪段对应当前 slide
  
  这就是 chat 和 agent 的根本区别
  
  ✅ 特征 1 · 会用工具
  ...
```

### v0.2（小节标题红边 + 整块红条）

```
┃ ▍2.2 心智模型 2 · Agent           ← 红色左边框（保留）

  ● 投屏切 心智模型 2 图
  
  [Agent = 助理]
                                   ← 直到这里都是"上一块"
┃ ▍✅ 特征 1 · 会用工具              ← h4 浅金 bg + 亮金左条（当前 slide）
┃ ▍                                ← 跨多个元素的红条柱
┃ ▍ 第 1 个特征——会用工具
┃ ▍ Agent 能调用工具——
┃ ▍ 它能上搜索引擎查资料 ……
                                   ← 直到下一块边界（下一锚点）停止
   ✅ 特征 2 · 会拆任务              ← 不高亮（下一张 slide 才是这里）
```

用户感受：**翻一页 · 红条柱跟着移动 · 一眼就知道讲到哪段了**。
