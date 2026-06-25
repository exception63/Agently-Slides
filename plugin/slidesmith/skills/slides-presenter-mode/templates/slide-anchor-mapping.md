# 怎么建 SLIDE_MAP · slide → 讲稿锚点映射（1:1 红线）

> 这是 slides-presenter-mode 中**唯一需要人工建的产物**。建好了 · 副屏才会跟主屏同步。
> 一次建好 · 用一辈子（slides / 讲稿不大改的话）。

---

## ⛔⛔⛔ v0.2 红线 · **必须 1:1 映射**

每张 slide **必须有唯一锚点**。**禁止**多 slide 共享同一锚点。

理由：

- 副屏的同步逻辑是 "anchor 变了才 scrollIntoView"
- 如果 4-5 张 slide 共享 1 锚点 · 翻页时讲稿不动（同 anchor 不跳） · 但用户已经手动滚到下一段了 · 视觉错位
- 即便加了 "anchor 变了才跳" 检查 · 用户预期是"每翻一页讲稿就跟进一步" · 共享锚点违反预期
- 福泉课 dogfood v0.1（71 锚点 ÷ 145 slide = 2 倍粗映射）实测：用户专门反馈"分不清对应关系"

→ v0.2 加强：每张 slide 一个独立锚点 · 在讲稿同一段内插细粒度锚点。

---

## 它是什么

一个 JS 数组 · 长度 = slide 总数 · 每项是讲稿子节的锚点 id：

```js
const SLIDE_MAP = [
  's0-1',   // slide 0 → 讲稿 #s0-1
  's0-2',   // slide 1 → 讲稿 #s0-2
  's0-2a',  // slide 2 → 讲稿 #s0-2a（同段细粒度）
  's0-2b',  // slide 3 → 讲稿 #s0-2b
  's0-3',   // slide 4 → 讲稿 #s0-3（下一小节）
  // ... 一直到 slide N-1 · 共 N 项 · 每项唯一
];
```

---

## 4 步建表流程

### Step 1 · 抽出所有 slide 标题 + 段编号

用 Python 一把抓（适配你 slides HTML 的结构 · 调正则）：

```python
import re
with open('your-slides.html') as f:
    html = f.read()
opens = list(re.finditer(r'<section [^>]*data-seg="\d"[^>]*>', html))
for i, m in enumerate(opens):
    body = html[m.end() : opens[i+1].start() if i+1 < len(opens) else len(html)]
    seg = re.search(r'data-seg="(\d)"', m.group()).group(1)
    h = re.search(r'<h[1-6][^>]*>(.*?)</h[1-6]>', body, re.DOTALL)
    title = ''
    if h:
        title = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', h.group(1))).strip()[:60]
    print(f'{i:3d}|seg{seg}|{title}')
```

输出：

```
  0|seg0|cover · 数字化与 AI 赋能招商
  1|seg0|你这周——加班几次?
  2|seg0|我先不讲 AI · 先讲你
  ...
```

### Step 2 · 列出讲稿现有锚点 + 识别"多 slide 共享"风险段

```bash
grep -oE 'id="s[0-9]+-[0-9]+"' 讲稿合集.html | sort -u
# 输出：
# id="s0-1"
# id="s0-2"
# id="s0-3"
# ...
```

把 step 1 slide 清单和 step 2 锚点清单并排看 · **每个锚点对应的 slide 数 ≤ 2 是健康** · ≥ 3 是 anti-pattern · 需要在 Step 3 加细粒度锚点。

### Step 3 · 给讲稿 HTML 加细粒度锚点（v0.2 关键步骤）

锚点命名约定：`sN-Mletter`（letter = a/b/c/d/e/...）

- `s2-2` = 第 2.2 节小节标题（h3.sub）
- `s2-2a` = 第 2.2 节内第 1 个细粒度位置
- `s2-2b` = 第 2.2 节内第 2 个细粒度位置
- ...

**锚点 ID 放到已有结构元素上**（推荐）：

```html
<!-- h4 改前 -->
<h4>✅ 特征 1 · 会用工具</h4>
<!-- h4 改后（slide 58 锚到这里） -->
<h4 id="s2-2b">✅ 特征 1 · 会用工具</h4>

<!-- blockquote 改前 -->
<blockquote class="script">
  <p>...</p>
</blockquote>
<!-- blockquote 改后 -->
<blockquote class="script" id="s0-2a">
  <p>...</p>
</blockquote>

<!-- golden 改前 -->
<div class="golden">
  <p>...</p>
</div>
<!-- golden 改后 -->
<div class="golden" id="s0-2b">
  <p>...</p>
</div>
```

候选元素（按"是否好做锚"排序）：
1. `<h4>` —— 最佳 · 自带标题语义
2. `<blockquote class="script">` —— 大段台词的起点
3. `<div class="golden">` —— 金句段落
4. `<pre class="prompt">` —— 代码 / prompt 块
5. `<table>` —— 表格
6. `<div class="interact">` / `<div class="planb">` / `<div class="warning">` —— 互动 / 翻车应对 / 警示
7. `<span id="..."></span>` —— **下策**·仅当上面都不合适时插

⭐ **批量插用 Python 脚本**·见 `templates/anchor-insertion-script.py.template`。70+ 锚点 · 手 Edit 不靠谱。

### Step 4 · 顺序建 SLIDE_MAP · 1:1 对齐 · 校验

把 145 项数组建出来 · 每项唯一：

```js
const SLIDE_MAP = [
  // 段 0
  's0-1','s0-2','s0-2a','s0-2b','s0-3','s0-3a','s0-3b','s0-3c',
  's0-4','s0-4a','s0-4b','s0-4c','s0-4d','s0-5','s0-5a','s0-6','s0-6a','s0-7',
  // 段 1
  's1-1','s1-1a','s1-2','s1-2a','s1-2b','s1-2c','s1-2d',
  // ...
];
```

---

## 校验脚本（必跑）

```python
import re
SLIDE_MAP = [...]  # 你的数组

# 1) 长度 = slide 数？
assert len(SLIDE_MAP) == 145, f'长度不对 · {len(SLIDE_MAP)} ≠ 145'

# 2) 每项唯一？（v0.2 红线）
from collections import Counter
dup = [k for k, v in Counter(SLIDE_MAP).items() if v > 1]
assert not dup, f'⛔ 有重复锚点：{dup} · 违反 1:1 红线'

# 3) 不允许连续相同（即使非紧邻共享也算违规）
for i in range(len(SLIDE_MAP) - 1):
    assert SLIDE_MAP[i] != SLIDE_MAP[i+1], f'slide {i} 和 {i+1} 锚点相同 · 违反 1:1'

# 4) 段分布合理？
seg_dist = Counter(e[:2] for e in SLIDE_MAP)
print(f'段分布：{dict(seg_dist)}')  # 应与各段 slide 数一致

# 5) 所有锚点在讲稿 HTML 都能找到？
with open('讲稿.html') as f:
    script = f.read()
unique = set(SLIDE_MAP)
missing = [a for a in unique if f'id="{a}"' not in script]
assert not missing, f'⛔ 缺锚点：{missing}'

print('✓ 全部校验通过')
```

---

## Pro tips

- **段交界处 slide 别打错** —— 比如 slide 17 (seg 0 末尾) 不要写成 's1-1'
- **每个讲稿锚点至少被 1 个 slide 引用** —— 否则那段讲稿副屏永远到不了 · 写了白写
- **段封面 slide → 段的 0.1 / X.1** —— 章节封面对应章节开场子节
- **SLIDE_TITLES 同步建** —— 副屏 header 显示的简短标题 · 也要 145 项 · 与 SLIDE_MAP 顺序对齐
- **临时不细分？** —— v0.2 红线允许零星情况 1 锚点对 2 slide（极少数情况 · 比如真的就是同一段讲稿连念 2 张高度相关 slide）· **但绝不允许 3+ slide 共享**

---

## 真实 case · 福泉 5-27 · v0.1 → v0.2 迭代

| 指标 | v0.1（粗映射）| v0.2（1:1 细映射）|
|---|---|---|
| slide 数 | 145 | 145 |
| 独立锚点数 | 71 | **145** |
| 平均每锚点 slide 数 | 2.0（最高 6） | **1.0**（统一） |
| 段 0 (18 slide) | 7 锚点（2.6/锚） | 18 锚点（1/锚） |
| 段 2 (51 slide) | 22 锚点（2.3/锚） | 51 锚点（1/锚） |
| 段 4 (20 slide) | 19 锚点（1.1/锚） | 20 锚点（1/锚） |
| 用户体感 | "分不清对应关系" | "对应效果好" |

建表耗时（含 70+ 锚点插入 + 校验）：
- v0.1：30 分钟（粗映射 · 走得快）
- v0.2 升级到 1:1：50 分钟（多写 70 个锚点 · 但用脚本批量插）

**结论**：v0.2 多花 20 分钟换来的体验提升 · 性价比极高。
