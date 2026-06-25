---
description: 用 Slidesmith 打开一个契约 HTML deck，开起人机协作编辑闭环
argument-hint: [deck.html 的路径]
---

你要用 Slidesmith 的桥接，帮用户进入「浏览器 Studio 就地编辑 + Claude 回写复杂改动」的闭环。

目标 deck：`$ARGUMENTS`
（如果为空，问用户要 deck 的 `.html` 路径，或用仓库里的 `docs/style-reference/keynote-target.html` 做演示。）

按顺序做：

1. 调用 MCP 工具 **`slidesmith_open`**，`deckPath` = 上面的路径。这会启动本地桥接、在浏览器打开 Studio（顶栏出现绿色「● 已连接 Claude」）并自动载入 deck。把返回的 `url` 和状态告诉用户。
2. 告诉用户：现在去浏览器里改——点文字直接改、右侧换配色/字号/动效；**复杂改动**就选中那一页、在「Submit to AI」里写一句要求，点 **🚀 发送给 Claude**。可一次写多页再发。
3. 用 **`slidesmith_get_requests`** 读取用户提交的修改意见（每条是一份自包含 prompt：指令 + 该页当前 HTML + 设计令牌 + 输出规范）。如果暂时为空，等用户提交后再读。
4. 对每条请求里列出的页：**只改它**，遵守 Deck 契约（颜色/字号走令牌、不写死内联 hex/px、保持单个 `<section class="slide …" data-id="…">` 且 data-id 原样不动）。
5. 把改好的页拼成一个或多个 `<section data-id>`，调用 **`slidesmith_apply_patch`**（`sections` = 这些 section 的 HTML）。Studio 会按 data-id 当场替换对应页，其它页不动。
6. 回到第 3 步继续接收下一批意见，直到用户说结束。随时可用 **`slidesmith_status`** 看连接/待处理数。

要点：stdout 不要打印噪音（MCP 在跑）；改写严格遵守 `AGENTS.md` 的契约；每轮改完简短告诉用户改了哪几页。
