# 反向同步设计 · v0.3 三端通信契约

> 本文档解释 slides ↔ 演讲者模式 ↔ 讲稿 iframe 三端如何用 postMessage / BroadcastChannel / localStorage 实现 **双向联动且不会循环**。
> 阅读对象：将来需要扩展 v0.3 通信能力（增加新的消息类型、新的反向行为）的人。

---

## 三端拓扑

```
┌─────────────────────────┐         ┌────────────────────────┐
│ 主屏 · fuquan0527.html  │ ◄─────► │ 副屏 · 演讲者模式.html  │
│  (slides)               │ BC      │  (presenter)           │
└─────────────────────────┘         └────────┬───────────────┘
                                              │ postMessage
                                              │ (parent ↔ iframe)
                                              ▼
                                    ┌────────────────────────┐
                                    │ iframe · 讲稿.html      │
                                    │  (script)              │
                                    └────────────────────────┘
```

- **slides ↔ presenter**：通过 `BroadcastChannel('fuquan-presenter-sync')` 双向广播；`localStorage` 'fuquan-presenter-state' / 'fuquan-slide-jump' 兜底。
- **presenter ↔ script**：通过 `iframe.contentWindow.postMessage()` / `window.parent.postMessage()` 父子通信。
- **slides 与 script 不直接通信**：所有跨屏消息都经 presenter 中转，避免三方耦合。

---

## 6 类消息（v0.3）

| # | 消息 type | 方向 | 触发 | 收方动作 |
|---|---|---|---|---|
| 1 | （payload 含 `slideIdx` 等）<br/>正向状态推送 | slides → presenter（BC） | `setActive(n)` 后 `broadcastPresenter(idx)` | presenter 更新 header + 若 `forwardFollow` 开 + anchor 变了 → `jumpToAnchor` 推给 iframe |
| 2 | `fuquan-scroll` | presenter → iframe | `jumpToAnchor(anchor)` | iframe `scrollToAnchor` + 整块高亮 |
| 3 | `fuquan-cue` | presenter → iframe | K 键 toggle | iframe `body.classList.toggle('cue-on')` |
| 4 | `fuquan-query-current` | presenter → iframe | D 键反向同步 | iframe `findCurrentAnchor()` 回传 #5 |
| 5 | `fuquan-current-anchor` | iframe → presenter | 收到 #4 后回 | presenter `resolveAnchorToSlideIdx` → 反向广播 #6 |
| 6 | `jump-to-slide` | presenter → slides（BC） | 反向 nav / TOC / 反向同步 | slides `setActive(slideIdx)` 翻页 |
| 7 | `fuquan-nav-key` | iframe → presenter | iframe 焦点时键盘 | presenter `handleKey(key)` 复用所有快捷键逻辑 |
| 8 | `fuquan-toc-jump` | iframe → presenter | iframe 内 TOC 点击 | presenter `resolveAnchorToSlideIdx` → 反向广播 #6 |

---

## 防回声：source 字段

**问题**：BroadcastChannel 是广播，发送方也会收到自己的消息。如果不处理，会循环：

```
slides setActive → broadcast(payload)
  → presenter.onmessage → applyState → jumpToAnchor
  → iframe.scrollToAnchor
（没问题，因为 iframe 不会再触发 slides）

presenter 反向 broadcast(jump-to-slide)
  → presenter.onmessage 自己也收到（坏）→ 如果当 applyState 处理就死循环
  → slides.onmessage 也收到 → setActive → broadcast(正向)
  → presenter 又收到（如果是 forwardFollow 开 · 又会 jump iframe · 但 anchor 已经一致 · 实际无害）
```

**解决方案**：每条消息都带 `source` 字段（`'slides'` 或 `'presenter'`），收方只处理对方源的消息：

```js
// slides → presenter 的正向消息
{ slideIdx, total, segment, anchor, ..., source: 'slides' }

// presenter → slides 的反向消息
{ type: 'jump-to-slide', slideIdx, ts, source: 'presenter' }

// 收方守门
applyState(s)              { if (s.source === 'presenter') return; ... }
handleReverseJump(payload) { if (payload.source !== 'presenter') return; ... }
```

---

## Anchor → slideIdx 反查规则

讲稿可能有的 anchor 类型：

| Anchor 类型 | 示例 | 对应 slide |
|---|---|---|
| 单 slide 锚点 | `s0-1` `s2-15b` | SLIDE_MAP_LOCAL.indexOf(anchor) |
| 段封面 | `seg-0` `seg-3` | 该段第一张：`findIndex(a => a.startsWith('s${N}-'))` |
| 附录（关键数据） | `s0-data` `s4-data` | -1（不对应任何 slide · 反向同步静默忽略） |

实现见 `presenter-view.html.template` 里的 `resolveAnchorToSlideIdx()`。

---

## 键盘转发的"嵌入检测"

讲稿 HTML 既可以 standalone 浏览，也可以被嵌入演讲者模式 iframe。**只有后一种情况**才转发键盘 + TOC 点击给 parent，否则会破坏 standalone 浏览体验。

检测方式：

```js
if (!window.parent || window.parent === window) return;   // 不在 iframe 里 · 跳过
```

`window.parent === window` 是 standalone 浏览的特征。在 iframe 里时 `window.parent` 指向外层窗口，两者不相等。

---

## v0.3 反向联动的 3 种触发路径

### Path A · 演讲者按键

```
用户在演讲者模式按 → / PageDown
  ├─ A1) 焦点在 header / 空白处 → document.keydown 直接 handleKey('ArrowRight')
  └─ A2) 焦点在 iframe（讲稿）
       → iframe 端 window.keydown → postMessage 'fuquan-nav-key'
       → presenter 端 window.onmessage → handleKey(key)
  → handleKey 调 reverseNav(+1) → broadcastSlideJump(target)
  → slides 收 BC 'jump-to-slide' → setActive(target)
  → slides 正向 broadcastPresenter → presenter 收 → jumpToAnchor 滚讲稿
```

### Path B · TOC 点击

```
用户在 iframe 讲稿点目录链接 #s2-5
  → iframe 链接 click listener → postMessage 'fuquan-toc-jump'（不 preventDefault · 让原生 smooth scroll 走）
  → presenter 收 'fuquan-toc-jump' → resolveAnchorToSlideIdx('s2-5') → broadcastSlideJump
  → slides setActive → 正向广播 → iframe 也再次确认位置（一般 anchor 已对齐 · 无副作用）
```

### Path C · 反向同步按钮（D 键）

```
用户按 D（或点 ← 同步）
  → presenter reverseSync() → postMessage 'fuquan-query-current' 给 iframe
  → iframe findCurrentAnchor() → postMessage 'fuquan-current-anchor' 回 presenter
  → presenter resolveAnchorToSlideIdx → broadcastSlideJump
  → slides setActive → 正向广播 → iframe 滚到精确锚点（修正 D 前可能的偏差）
```

---

## Keywords 高亮的"激活板块"范围

```css
body.cue-on :is(.presenter-block-current, .presenter-current) strong { ... }
```

- `.presenter-block-current` 是当前 slide 对应的整块讲稿元素（由 `highlightBlock(startEl)` 沿 sibling 链标定）
- `.presenter-current` 是当前小节标题（h3.sub）
- 两类合起来 = "当前激活板块" · 仅此范围内的 `<strong>` 在 cue 开时高亮

为什么不全文 `<strong>`：讲稿 1000+ 个 `<strong>` 全亮 = 没有重点。仅当前板块亮 = 提词专注。

---

## 启动顺序与生命周期

```
T0  · slides 打开 · BroadcastChannel 就绪 · setActive(0) 正向广播
T1  · 用户点"演讲者模式"按钮 · window.open 副屏
T2  · 副屏加载 · 立即读 localStorage cache · applyState（如果有缓存）
T3  · 副屏 iframe load 完成 · applyCue 把当前 cue 状态下发
T4  · slides 端 400ms / 1200ms 两次重发 broadcastPresenter · 防丢失
T5  · 副屏 forwardFollow 默认开 · iframe 跳到当前 anchor
T6  · 用户操作（翻页 / TOC / 按键 / 同步 / 高亮）任意触发 v0.3 流程
```

---

## 扩展指南

加新的双向消息时务必：

1. 给消息加 `source` 字段（防回声）
2. 收方第一行守门：`if (msg.source === self_source) return`
3. 文档化到上面"6 类消息"表
4. 测试焦点在 iframe 时是否还工作（键盘转发依赖嵌入检测）
5. 测试 standalone 浏览讲稿是否不被影响（`window.parent !== window` 守卫）
