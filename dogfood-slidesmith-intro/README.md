# Dogfood · Slidesmith 自述 slides（单文件 · 带讲稿同步 · 暗黑风）

用本插件**从 0** 做的一套介绍 Slidesmith 自己的演示——开发思路、架构、功能、上手教程，图文并茂，含一页**内嵌 HTML 模拟演示**（"评论→发送→Claude 改→回写"循环动画）。

## 怎么看

双击 **`slides.html`** 即可（单文件、离线、可移植，拷到任何电脑都能跑）。

- `F` / ▶ 全屏播放 · `←` `→` 翻页 · `1`–`9` 跳段 · `ESC` 退出
- **`S` 或点「🖥 演讲者」** → 弹出**演讲者窗口**：显示当前页的讲稿（cue 讲法提示 / golden 金句 / data 数据）、下一页提示、计时器；窗口里的 ◀▶ 可反向控制主屏翻页。把它拖到副屏/iPad 即可。

> 讲稿**嵌在同一个 HTML 里**，演讲者窗口用 `window.open` + 直接句柄 `postMessage` 同步——`file://` 双击也能用，**只需带走 `slides.html` 一个文件**。

## 怎么做出来的（dogfood 链路）

- 出片：`slidesmith:editorial-slides`（keynote-dark 暗场主旨皮，插件 cache 版）。
- 内嵌演示：自包含的循环动画（sim-livecase 思路，scoped class，避开引擎缩略图克隆导致的重复 id）。
- 讲稿 + 演讲者同步：`transcripts_html` 的视觉/块约定（cue/golden/data）+ `slides-presenter-mode` 的同步思路，做成**单文件内嵌 + 弹窗**形态。

## 自检

`node ../dogfood-slidesmith-intro/verify-deck.mjs`（在仓库根跑：`node dogfood-slidesmith-intro/verify-deck.mjs`）— 16 页渲染、讲稿内嵌、演示三态循环、无重复 id、弹窗演讲者收到正确讲稿、零报错，10/10。截图见 `screenshots/`。
