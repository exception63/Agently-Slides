# 规划 · Studio 里编辑「讲稿」和「手表提词」

> 2026-08-20 定。skill 侧的 watch mode 已落地（commit `21df9dc`），本文件规划 **Studio 侧**。

---

## 现状（查证过，不是推测）

**Studio 有两套面板，按 deck 类型分：**

| 模式 | 面板 | 有讲稿/提词入口吗 |
|---|---|---|
| Markdown deck | 格式 · 动画 · **讲稿** | ✅ 有「本页讲稿」textarea，提示语已经写着「可用 `**关键词**` 标注提词」，还有 ＋讲法/＋金句/＋数据 |
| **HTML deck（用户实际用的一体版）** | 格式 · 设计 · 动画 · AI 待办 | ❌ **完全没有** |

**Studio 源码里没有任何读取内嵌讲稿的逻辑** —— `packages/studio/src/main.ts` 里
`__TXB64__` 只在一句注释中出现（提醒别把它弄坏）。一体版的讲稿对 Studio 是黑盒。

所以用户说的「Mac app 里只能打开讲稿、不能编辑」，指的是 **Studio 里点「演讲者」
弹出的副屏**（今天刚修好，commit `ce82e1c`）—— 那是放映视图，只读。

---

## 目标形态（用户 2026-08-20 定的）

1. **讲稿要能在 Studio 里小改**。大稿仍由 AI 按要求生成，用户后期微调
   （甚至调用 Studio 桥接的 Claude 来改）。
2. **slides 上加一个「关键词」按钮**，点开是**这一页**的提词；
   只在 presenter-mode 开了 watch mode 时才烘进去。
3. **在 Studio 里打开这个提词页，应该能进编辑模式改**。
4. 提词同步到手表。

---

## 设计

### 存储：`window.__SM_CUES__`（锚点 → 短语数组）

```js
window.__SM_CUES__ = { "s1-boom": ["无缝嵌入"], "s1-paradox": ["虚实悖论","补偿动机"] };
```

**为什么是 JSON 而不是「又一份内嵌 HTML 文档」**：用户要的是**能编辑**。
结构化数据能给出「几个输入框 + 实时体检（条数/字数/是否结构标签）」，
HTML 文档只能给一个源码框。而「点按钮看到的那个页面」照样可以从这份数据**渲染出来**——
`templates/watch-cues.js.template` 已经这么做了，且刻意做成 211×257 表盘比例。

### 三处消费同一份数据，互不重复实现

| 谁 | 怎么拿 |
|---|---|
| deck 的 `✦ 提词` 预览窗 | 直接读 `window.__SM_CUES__` + 跟 `{{CHANNEL}}-presenter-sync` 翻页 |
| Apple Watch | deck 在 `deck-info` 里带上 `cues` → 手机 → WCSession → 手表 |
| Studio 编辑面板 | 解析 deck HTML 里的 `__SM_CUES__` 字面量，改完写回 |

---

## 落地顺序（从收益/成本比最高的开始）

### 第 1 步 · 手表优先读 `__SM_CUES__`（小）
- `pair-client.js` 的 `sendDeckInfo()` 里加一个字段：`cues: window.__SM_CUES__ || null`
- `RelayClient` 的 `deck-info` 分支：有 `cues` 就直接用，没有才回落到现在的
  「运行时解析讲稿 `<strong>`」（兜底已实现，见 `TranscriptNotes.parseCues`）
- ⚠️ 改了 pair-client 意味着**deck 要重新导出**才享受得到

### 第 2 步 · Studio HTML 模式加「提词」面板（中）
先做提词、后做讲稿——提词结构简单、收益直接、校验规则已经定死。
- 新增 `data-hpane="cue"` 面板：选中某页 → 显示该页 1–3 个输入框
- 实时体检（复用 skill 里那套硬约束）：超 3 条 / 超 10 字 / 疑似结构标签 → 当场红字
- 「从讲稿抽一版」按钮：按锚点抽该段 `<strong>` 填进去当草稿（**仍需人过一遍**）
- 保存 = 改写 deck HTML 里的 `__SM_CUES__` 字面量

### 第 3 步 · Studio 里编辑讲稿（大）
- 同一个面板加「本页讲稿」：解 `__TXB64__` → 按 SLIDE_MAP 锚点定位到**该页那一段** → 编辑 → 重新编码写回
- ⭐ **红线：只能改那一段，不许重排整份文档**。讲稿带着锚点、`class="cue"` 讲法块、
  `golden` 金句块、`data` 数据块——整份重写会把这些结构和锚点弄漂，
  副屏同步和提词抽取会一起坏掉
- 先做「该段源码 textarea」，富文本以后再说
- 与桥接 Claude 打通：把该段丢给 Claude 改写，回填 —— 这是用户真正的高频用法

---

## 未定 / 动手前要问

- 第 3 步里，讲稿编辑是**按页分段编辑**（安全）还是**整份文档编辑**（自由但危险）？
  倾向按页分段。
- 一体版之外的三文件联动版要不要一起支持？（讲稿在隔壁文件，Studio 读不到——
  这是 `_memory/NEXT-SESSION.md` 里挂着的老问题）

---

相关：`plugin/slidesmith/skills/slides-presenter-mode/SKILL.md`「Watch mode」章节 ·
`templates/watch-cues.js.template` · `apps/SlidesmithRemote/Shared/TranscriptNotes.swift`
