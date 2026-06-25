# 与 slides-presenter-mode 的对接

本模板**出厂即带演讲者模式钩子**——不用再改主屏 slides 的 JS。要启用"翻页时副屏自动跟随讲稿"，只需用 `slides-presenter-mode` skill 生成副屏文件即可。

## 模板已经内置了什么

- `🖥 演讲者` 按钮（topbar）+ `S` 快捷键 → `openPresenter()` 打开副屏窗口。
- `broadcastPresenter(idx)` 每次翻页广播：`{slideIdx, total, segment, anchor, title, prevTitle, nextTitle}`，双通道（BroadcastChannel + localStorage 兜底）。
- 反向通道：接收副屏的 `jump-to-slide`（副屏点缩略图也能控主屏）。
- `window.deckAPI`：`{setActive, next, prev, goSeg, openPresenter, idx, total, SLIDE_MAP, SLIDE_TITLES}`，供副屏/调试调用。
- `SLIDE_TITLES`：自动从每张标题取（副屏显示用）。
- `SLIDE_MAP`：默认自动生成 `s{段}-{段内序号}`；**若页面在引擎运行前定义了 `window.SLIDE_MAP`（长度=slide 数），优先用它**——这正是接讲稿锚点的入口。

## 启用三步

1. **改频道名**：模板 JS 顶部 `CONFIG.channel`（占位 `{{CHANNEL}}`）改成本套唯一值，如 `beishaped-sync`。避免多份 slides 串台。
2. **建 1:1 映射**：每张 slide 对应讲稿里一个**唯一**锚点 id。两种接法：
   - (a) 让讲稿用 `s{段}-{序}`（如 `s0-1`/`s1-2a`）做锚点 → 和模板默认 `SLIDE_MAP` 自动吻合；
   - (b) 自定义锚点 → 在 slides HTML 里、引擎 `<script>` **之前**注入 `window.SLIDE_MAP=['a','b',...]`（长度=slide 数，每项唯一）。
3. **跑 slides-presenter-mode**：它会生成 `演讲者模式.html`（副屏）+ 给讲稿 HTML 注入"整块高亮"监听。模板里 `CONFIG.presenterFile` 默认就叫 `演讲者模式.html`。

> 红线（来自 slides-presenter-mode）：**每张 slide 必须唯一锚点**，否则翻页时讲稿跳回小节开头、失去同步意义。

## 实战配方（《被重塑的人》dogfood · 讲稿是 Markdown 生成的）

本案讲稿 HTML 由 `build-plain-html.py` 从 md 生成，所以**锚点 + 监听烤进 build**（而非对成品 HTML 手插）：
1. deck：`CONFIG.channel='beishaped-sync'`，`window.SLIDE_MAP=['s0-1'…'s6-3']`（37，与张数等长）。
2. 讲稿 build 脚本里加 `ANCHOR_PLAN=[(锚点id, 该块开头文字片段), …]`，渲染时按片段匹配给块加 `id`；并把 v0.3 监听（`fuquan-scroll` 滚动+整块高亮、`fuquan-cue`、`fuquan-query-current`、方向键转发）注入到生成的 HTML。脚本打印 `锚点匹配 N/37`，必须全中。
3. 副屏 `演讲者模式.html`：复制 `slides-presenter-mode` 的 presenter-view 模板，填 `{{SCRIPT_BASE}} {{INITIAL_ANCHOR}} {{SLIDE_MAP_LOCAL}} {{SEG_NAMES}}`，**并把模板里硬编码的 `fuquan-presenter-sync→你的channel`、`fuquan-presenter-state→channel-state`、`fuquan-slide-jump→channel-jump`**。
4. 三处锚点集合（deck `window.SLIDE_MAP`、副屏 `SLIDE_MAP_LOCAL`、讲稿 `id="s.-."`）必须完全一致。改张数 = 三处同步改。
> ⚠️ 头号坑：**频道名不对齐** → 翻页毫无反应。deck 写 `channel`，副屏听 `channel`/`channel-state`，必须一致。

## 不接讲稿也能用

不调 slides-presenter-mode 时，`🖥 演讲者` 会提示"副屏文件不存在"。其余功能（全屏播放、段导航、缩略图、键盘、缩放）全部独立可用——演讲者模式是可选增强。
