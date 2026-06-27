---
description: 用 Slidesmith 开起「握手式自动协作环」——浏览器 Studio 改 + Claude 自动接活回写
argument-hint: [deck.html 的路径]
---

你要用 Slidesmith 的桥接，和用户进入**握手式自动协作环**：一次握手后，用户在浏览器 Studio 里发出的修改需求会**自动唤醒你**去改、当场回灌，**全程零手动拉**。

目标 deck：`$ARGUMENTS`
（如果为空，问用户要 deck 的 `.html` 路径，或用仓库里的 `docs/style-reference/keynote-target.html` 做演示。）

## A · 从 Claude 发起（最常见）

1. 调用 MCP 工具 **`slidesmith_open`**，`deckPath` = 上面的路径。这会启动本地桥接、在浏览器打开 Studio、并把**本会话「握手」绑定**为该桥接的 owner——Studio 顶栏会显示「● 已连接 Claude · 会话 X · 端口 Y」。把返回的 `url` 和 `owner` 告诉用户。
2. 告诉用户：现在去浏览器里改——点文字直接改、右侧换配色/字号/动效；**复杂改动**就选中那一页写一句要求、点 **发送给 Claude**（可一次写多页再发）。右侧「改前先问我」开关：开了的话你要以**提议预览**方式回写，关了就直接生效。
3. **进入自动环**：调用 **`slidesmith_wait`**（会阻塞，直到用户提交就立刻返回那条请求；空闲到 timeout 则返回 `timedOut`）。
   - 也可以用后台轮询命令实现同样效果：`curl -s "<url>api/wait?timeout=280000"`——它挂起等待，用户一提交就返回并退出，从而唤醒你。挂起期间你什么都不用做。
4. 拿到请求后，对它列出的页：**只改它**，遵守 Deck 契约（颜色/字号走令牌、不写死内联 hex/px、保持单个 `<section class="slide …" data-id="…">` 且 data-id 原样不动）。
5. 把改好的页拼成 `<section data-id>`，调用 **`slidesmith_apply_patch`**（`sections` = 这些 section 的 HTML）。
   - 若该请求 `confirm: true`（用户开了「改前先问我」），回写时把 **`preview: true`**——Studio 会以「保留 / 还原」提议呈现，让用户先看再定。
6. **回到第 3 步** `slidesmith_wait`，继续守候下一批需求，直到用户说结束。随时可用 **`slidesmith_status`** 看连接/owner/待处理数。

## B · 从 Studio 冷启动（用户先开了 Studio）

如果用户说「我已经在 Studio 里发了需求 / Studio 已经开着」：
1. 先用 **`slidesmith_connect`** 与正在运行的桥接握手（把本会话登记为 owner，Studio 顶栏立刻显示「会话 X」）。
2. 然后照 A 的第 3 步起 `slidesmith_wait` 自动环——之前积压的需求会立刻被 `wait` 取到。

要点：stdout 不要打印噪音（MCP 在跑）；改写严格遵守 `AGENTS.md` §4b 的契约；每轮改完简短告诉用户改了哪几页 + 当前连接/owner 状态，让用户在对话里也能掌握 Studio 那边的情况。
