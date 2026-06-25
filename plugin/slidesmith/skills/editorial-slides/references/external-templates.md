# 风格银行 · 从 beautiful-html-templates 移植新皮

我们把外部模板库 **beautiful-html-templates**（34 个 HTML 模板 · MIT · © 2026 Zara Zhang）当"风格银行"：
看中哪个视觉，就**把它移植成我们的一张皮**（插进我们的引擎），而不是直接换用它的模板。
> 为什么不直接用它的模板：它英文优先、各模板自带运行时，没有我们的段导航/实时缩略图/**演讲者双屏同步**/中文字体栈/单文件。移植 = 它的好看 + 我们的基建。

## 仓库在哪

> 注：这是**可选的外部风格库**，不是本 skill 的运行时依赖——没有它也能用三种原生皮正常出片；只有当你想"移植新皮"时才需要它。下面是作者本机路径，换机器时改成你自己的克隆位置即可。

`/Users/zhouliying/同步空间/Claude Projects/SlidesHTML/beautiful-html-templates/`
- `index.json` — 34 个模板的元数据目录（`mood/tone/formality/density/scheme/best_for/avoid_for`，部分含 `palette` 精确 hex + `typography`）。**选风格先读它**。
- `templates/<slug>/template.json` — 单个模板的结构化 palette + typography（移植时的 token 来源，最省事）。
- `templates/<slug>/template.html` — 实际视觉（`:root`、装饰语汇、排版细节）。
- `templates/<slug>/design.md` — 该模板的详尽设计说明（拿不准装饰怎么做时翻）。
- `screenshots/` + `README.md` 的 gallery — 带图浏览，挑风格用。

已移植成皮的：`cartesian`（极简）· `signal`（机构）· `vellum`（暗色学术）· `daisy-days`（活泼）。

## 移植配方（把一个模板变成一张皮 · 3 步）

1. **取 token**：读 `templates/<slug>/template.json`（palette + typography）+ `template.html` 的 `:root`，定我们皮的 `:root` 令牌。
   - 必填令牌见 `design-system.md`「皮肤必须定义的令牌」。主强调映射到 `--accent`，并列次色映射到 `--navy/--gold/--green`。
   - **中文回退**：源模板多是英文字体，字体栈里务必补 `Noto Serif SC / Noto Sans SC / 思源宋黑 / PingFang / 系统 serif|sans`，FONTS URL 里也加上对应 family。
2. **套契约**：以 `skins/academic.css`（浅色）或 `skins/keynote-dark.css`（深色）为骨架，**逐 class 照抄**，把每个组件改成目标模板的样子（装饰语汇、圆角、发丝线、边框、阴影都要还原）。一个 class 都不能少、不要定义 `_core.css` 里的引擎类。
3. **配 demo + 建图自检**：写 `demo/<slug>.slides.txt`（8–9 张中文片段，覆盖多版式）→ `python3 assets/build.py <slug>` → 浏览器 present 态逐张截图核版面。

## 两条红线（移植专用）

- **署名（MIT 要求 + 溯源）**：皮肤文件第二行写 `/* skin: <名> · ported from beautiful-html-templates/<slug> (MIT · © 2026 Zara Zhang) · DNA */`。
- **忠于原作**：移植是"还原它的视觉到我们的组件"，不是借机魔改。保它的字体/配色/装饰；我们只负责把它接进引擎 + 中文化 + 补齐我们独有的组件（figure/refs/演讲者钩子等）。

## 什么时候**不**移植，直接用它

纯英文、一次性、**不需要**段导航/演讲者双屏/中文栈的 deck → 直接按它仓库的 `AGENTS.md` 流程克隆改内容即可（那是"转交"，不是本 skill 的活）。需要我们这套基建（尤其你的 keynote 要副屏）时，才走上面的"移植成皮"。
