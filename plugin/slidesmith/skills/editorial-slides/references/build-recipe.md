# 构建配方 · 多风格 slides 怎么落地（v1.1.0）

两件事：① 用 `build.py` 按选定 skin 起一个 deck；② 大批量 slides 别逐张 Edit，用一个临时 Python 一次注入。

## A · 起一个 deck（选好 skin 之后）

```bash
# 空白起手式（推荐）：core + 该皮 CSS + 引擎 已内联，单文件
python3 assets/build.py academic 06-slides/slides.html --blank \
    --title "我的讲题" --brand "贵州财经大学" --sub "2026 研讨会" --channel "mytalk-sync"

# 或：复制带 demo 的画廊模板，再删 demo 改内容
cp gallery/academic.html 06-slides/slides.html
```
`<skin>` = `academic` / `editorial` / 你新加的皮。`{{CHANNEL}}` 取唯一名（接 presenter 用同一个）。

> 改了皮肤源（`skins/*.css` / `_core.css` / `_engine.js`）后，重生成画廊：
> `python3 assets/build.py academic && python3 assets/build.py editorial`。

## B · 大批量 slides 一次注入（来自《被重塑的人》dogfood：37 张）

1. 先 `build.py <skin> slides.html --blank` 起好空 deck。
2. 把全部 `<section>` 写在一个 Python 字符串 `SLIDES` 里（每张带 `data-seg`/`data-segname`，可选 `data-title`；版式见 `components.md`）。
3. 正则把 `#deck` 内容替换掉，并在引擎 `<script>` 之前注入 `window.SLIDE_MAP`：

```python
import re
t = open('slides.html', encoding='utf-8').read()
SLIDES = r'''<section ...>...</section> ... '''         # 你的所有 slide
SLIDE_MAP = ['s0-1','s0-2', ...]                          # 长度=张数，每项唯一（接讲稿锚点）

# 替换 deck 内容
t = re.sub(r'(<div class="deck" id="deck">).*?(\n</div>\n\n<script>)',
           lambda m: m.group(1) + '\n' + SLIDES + m.group(2), t, count=1, flags=re.S)
# 在引擎 <script> 前注入 window.SLIDE_MAP（引擎会优先用它）
inject = '<script>window.SLIDE_MAP=' + str(SLIDE_MAP).replace("'", '"') + ';</script>\n\n<script>'
t = t.replace('\n</div>\n\n<script>\n', '\n</div>\n\n' + inject + '\n', 1)
open('slides.html','w',encoding='utf-8').write(t)
print('张数:', t.count('<section '), '| MAP:', len(SLIDE_MAP))
```

## 校验（浏览器跑一下）

```js
window.deckAPI            // {total, idx, SLIDE_MAP, SLIDE_TITLES, setActive, next, prev, goSeg, openPresenter}
window.deckAPI.total                      // == 张数
document.querySelectorAll('.segnav__seg').length   // == 段数（自动建）
```
截图自检版面（present 态）：
```js
// 编辑态把第 N 张拉到全屏大小截图
document.body.classList.add('present');
const ss=[...document.querySelectorAll('.deck>.slide-wrap>.slide')];
ss.forEach((s,i)=>s.classList.toggle('active',i===N));
ss[N].style.setProperty('--sc', Math.min(innerWidth/1920,innerHeight/1080));
```

## 坑

- **缩略图克隆也带 `.slide` 类**：调试别用全局 `document.querySelectorAll('.slide')[i]`（会选中 0×0 的缩略图），用 `window.deckAPI` 或 `document.querySelectorAll('.deck > .slide-wrap > .slide')`。
- **别混皮**：一份 deck 只内联一个 skin。要换风格 = 用 build.py 重新装配一份，再把 slides 注入。
- `window.SLIDE_MAP` 的 `<script>` 必须在引擎 `<script>` **之前**，否则引擎读不到、退回自动锚点。
- 改皮肤样式请改 `assets/` 下的源再 `build.py` 重生成；别直接改 `gallery/` 成品（会被下次构建覆盖）。
