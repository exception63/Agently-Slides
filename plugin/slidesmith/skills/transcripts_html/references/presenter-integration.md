# 三方对齐 · 接 editorial-slides + slides-presenter-mode

本模板**出厂即带演讲者监听**（底部两段 `<script>` + 一段演讲者 CSS）。要让"翻 slide → 副屏讲稿自动跟随高亮"真正工作，只需保证两件事对齐：**锚点 1:1** 与 **频道名一致**。

## 模板已经内置了什么

- 演讲者 CSS：`presenter-current`（h3 红边脉冲）+ `presenter-block-current`（整块浅红 + 左红条）+ `body.cue-on` Keywords 块级高亮。
- 片段②：监听父窗口（副屏）的 `fuquan-scroll`（滚到锚点 + 整块高亮）/ `fuquan-cue`（K 键提词开关）/ `fuquan-query-current`（反向同步 D 键 · 回传当前 anchor）。
- 片段③：iframe 焦点时把翻页键/快捷键 `fuquan-nav-key` 转发给副屏；点 TOC 链接 `fuquan-toc-jump` 让 slides 反向跳。standalone 阅读时自动不生效。

> postMessage 的 type 名（`fuquan-scroll` / `fuquan-cue` / `fuquan-query-current` / `fuquan-current-anchor` / `fuquan-toc-jump` / `fuquan-nav-key`）是**副屏 ↔ 讲稿 iframe 的固定约定**，与广播频道名是两码事——**不要改**，改了副屏模板就对不上。

## 三处锚点必须完全一致 ⭐ 头号红线

| 位置 | 形式 | 谁写 |
|---|---|---|
| slides `slides.html` | `window.SLIDE_MAP = ['s0-1', …]`（注入在引擎 `<script>` 之前） | editorial-slides |
| 讲稿 `讲稿.html` | `<h3 class="sub" id="s0-1">` … | **transcripts_html（本 skill）** |
| 副屏 `演讲者模式.html` | `const SLIDE_MAP_LOCAL = ['s0-1', …]` | slides-presenter-mode |

三个数组/集合：**长度相等、顺序一致、每项唯一、拼写一字不差**。改 slide 张数 = 三处同步改。
> 省事做法：先用 editorial-slides 做好 slides，直接抄它的 `window.SLIDE_MAP` 当讲稿锚点清单——天然对齐。

## 频道名对齐（副屏 ↔ slides 的广播）

广播走 BroadcastChannel + localStorage 双通道，频道名要三处对齐（这是**广播**，与上面 postMessage 无关）：

- slides 引擎：`CONFIG.channel = 'xxx-sync'`
- slides 写：`localStorage['xxx-sync-state']`；反向听：`localStorage['xxx-sync-jump']`
- 副屏：`CHANNEL = 'xxx-sync'`，听 `xxx-sync-state`、反向写 `xxx-sync-jump`

slides-presenter-mode 的副屏模板里若仍是默认 `fuquan-presenter-sync` 等，记得改成你这套的频道名（state 后缀 `-state`、jump 后缀 `-jump`）。⚠️ 头号坑：频道名不对齐 → 翻页毫无反应。

## 同目录摆放（同源）

`slides.html` / `讲稿.html` / `演讲者模式.html` 放**同一目录**，保证 BroadcastChannel + localStorage 同源、iframe 相对路径（副屏 `src="讲稿.html#s0-1"`）可达。

## 验证（最少试 5 张 · 跨段）

- [ ] 主屏翻页 → 副屏 header 数字/标题/上下张立即更新
- [ ] 副屏讲稿 iframe 自动滚到对应锚点，h3 红边 + 其后整块浅红高亮
- [ ] 每张 slide 对应**独立**锚点，不会连续两张跳同一处
- [ ] 副屏按 K → 当前块的 `<strong>` 提词高亮亮起
- [ ] 点讲稿 TOC → slides 反向跳到该段第一张
- [ ] 讲稿单独打开（不经副屏）→ 干净备课稿，键盘原生滚动正常

> dogfood 实测：`CoursesDevelopment/国企改革深化课程/`（频道 `guoqi-sync` · 49 锚点）三处一致，双向同步通过。
