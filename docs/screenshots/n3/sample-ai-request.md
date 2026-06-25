# Slidesmith · 单页修改请求 (single-slide change request)

> 给 AI：请按下面的「修改要求」改写**这一页**，**只改这一页**，遵守 Deck 契约（见仓库 AGENTS.md / docs/DECK-CONTRACT.md）。

- deck: keynote-target
- 目标页 data-id: `s5`（第 5 页 · 一个共同前提）
- 段: 0 · 段 0 · 引入

## 修改要求
把这页整体改成一句话的金句版。

## 这一页当前的 HTML（在此基础上改写）
```html
<section data-seg="0" data-segname="段 0 · 引入" data-title="一个共同前提" class="slide insight" data-id="s5">
  <div class="insight__eyebrow">一个共同的前提问题</div>
  <h2 class="insight__statement" style="font-size:70px;">这两项发现共同指向一个更基础的问题：<br>「<em>心智</em>」，是否仍是人的专属？</h2>
  <p class="insight__sub" style="font-size:44px;line-height:1.5;">抑或，它本就是一种在关系中<span style="color:var(--accent)">被识别、被赋予、被实践</span>出来的<span style="color:var(--accent);font-weight:700">社会位置</span>？</p>
  <div class="keyline">当一个系统，在社会互动中持续地承担着「<em>有心智者</em>」的功能，我们还能不能简简单单地说一句——<em>心智，只属于人</em>？</div>
</section>
```

## 设计令牌（保持风格一致；颜色 / 字号请走这些变量，勿内联硬值）
- `--accent`: #F4B73E
- `--accent-2`: #D99828
- `--ink`: #F5F6F8
- `--ink-2`: #C2C6D0
- `--font-sans`: "Inter","Space Grotesk","Noto Sans SC","Source Han Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif
- `--t-h1`: 108px
- `--t-h2`: 76px
- `--t-body`: 32px
- `--pad-x`: 130px
- `--pad-y`: 96px

## 你要输出的补丁
只输出**改写后的这一页**：一个 `<section class="slide …" data-id="s5">…</section>`（务必保留同一个 data-id）。
不要输出整份 deck、不要 `<html>`/`<head>`。存成 .html 交回，用 Studio 的「应用 AI 返回」替换这一页。
