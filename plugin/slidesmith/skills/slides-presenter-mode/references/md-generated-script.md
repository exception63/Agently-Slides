# 当讲稿 HTML 是从 Markdown 生成的（v0.3 实战 · 2026-06-03）

来自《被重塑的人》dogfood：讲稿不是手写 HTML，而是 `build-*.py` 从 `.md` 生成。
这种情况**不要**用 `anchor-insertion-script.py`（行号对 md 生成物没意义、重建即失效）。
正解：**把锚点 + 监听烤进 build 脚本**，改 md 重建就自动带上。

## 配方

### 1) build 脚本里加 ANCHOR_PLAN（按文本片段匹配，不靠行号）
```python
ANCHOR_PLAN = [("s0-1","过去十几年，我们研究"), ("s0-2","我们一直盯着"), ...]  # (锚点id, 该块开头几个字)
_AI=[0]
def _norm(s): return re.sub(r'[\s*#>·「」“”‘’"\']','',s)   # 去 markdown/标点便于匹配
def take_anchor(text):
    if _AI[0]>=len(ANCHOR_PLAN): return ''
    aid,snip = ANCHOR_PLAN[_AI[0]]
    if _norm(text).startswith(_norm(snip)): _AI[0]+=1; return f' id="{aid}"'
    return ''
# 渲染每个块（p/blockquote/h3/h4…）时：out.append(f'<p{take_anchor(payload)}>{...}</p>')
# 末尾断言：print(f'锚点匹配 {_AI[0]}/{len(ANCHOR_PLAN)}')  —— 必须全中
```
- 顺序匹配：只比对"待命"那条，**一条没中就卡住**（后面全失败）→ 断言能立刻发现。片段对不上时去 md 查那块真实开头。
- 锚点 id 用 `s{段}-{序}`（要匹配监听里的 `/^s\d/` 停止条件）。章节大标题 `<h2 id="s0">…` 也以 `s\d` 开头 → 自然成为整块高亮的边界，正合适。

### 2) 把监听 + 整块高亮 CSS/JS 注入生成的 HTML
取 `templates/script-listener.js.template` 的 CSS + JS，注入到 build 的 `</style>` 前和 `</body>` 前。
本案讲稿块都是 `<main>` 直接子元素（flat siblings）→ 整块高亮沿 `nextElementSibling` 走到下一个 `/^s\d/` id 或 `H2` 为止，干净。
v0.3 完整版还应处理：`fuquan-cue`（当前块 strong 提词）、`fuquan-query-current`（回传当前可视锚点）、方向键 `parent.postMessage('fuquan-nav-key')` 转发。

### 3) 副屏频道对齐（头号坑 ⚠️）
presenter-view 模板里**硬编码** `fuquan-presenter-sync` / `fuquan-presenter-state` / `fuquan-slide-jump`。
若主屏 deck 不是福泉那套（如 editorial-slides 的 deck 用 `CONFIG.channel='xxx-sync'`，state key=`xxx-sync-state`，jump key=`xxx-sync-jump`），
**生成副屏时必须把这三个字符串替换成 deck 的频道**，否则翻页毫无反应。
（`fuquan-presenter-fwdfollow/revfollow/cue/rotated/collapsed` 是副屏本地 UI 偏好，无需对齐。）
副屏↔讲稿 iframe 之间的 `fuquan-scroll` 等消息类型是内部约定，**两端一致即可、名字不必改**。

## 一句话
md 生成讲稿 = 锚点靠"文本片段匹配"烤进 build（可重建）；接 deck 时**先对齐频道名**。
