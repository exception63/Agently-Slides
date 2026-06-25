# Slidesmith — 高度 AI 整合的 HTML Slides 编辑器

> 仓库 `presentsystems` · GitHub: [exception63/Agently-Slides](https://github.com/exception63/Agently-Slides)
> 一个**浏览器里改 HTML slides、Claude Code 实时帮你改**的编辑器。

## 一句话

**核心是分工**：你做高频细活（点字、换色、调字号、加动画、移动/删除元素——即时、零 token），
AI 做模糊重活（"这页改成两栏""统一全套风格"——你在那一页上留**评论**，Claude 改完回写）。
像 Claude Design 的 comment→edit，但是**真 HTML 你自己拥有**、只把相关页发给 Claude（省 token、不撞上限）、完全可定制。

## 两种用法

**① 连上 Claude Code（推荐，实时协作）** —— 装了 `slidesmith` 插件后：

1. 跟 Claude 说"用 slidesmith 打开 这个 deck"，或敲 `/slidesmith <deck.html>`；
2. 浏览器自动弹出 Studio，顶栏显示绿色 **● 已连接 Claude**；
3. 你在某页写句评论（如"把三个要点改成左右两栏"）→ 点 **🚀 发送给 Claude**；
4. 那几页变蓝色脉冲「已发送 · 等待」→ Claude 改完自动回写 → 变绿 **✓ 已改**；不满意点 **↩︎ 还原本页**。

> 连接怎么建立、状态长什么样，见 [GUIDE.md](GUIDE.md) 的「连接 Claude」一节。

**② 离线单干（双击即用，无需 Claude）** —— 双击 [`studio/slidesmith-studio.html`](studio/slidesmith-studio.html)：

把 deck 拖进去，点字改、换色、加动效、视觉自检、导出 HTML/PDF。复杂改动可「导出任务文件」交给任意 AI、再「应用返回」。

## 安装插件（接到 Claude Code）

```bash
npm install && npm run build:studio
claude plugin marketplace add "$(pwd)/plugin" --scope user
claude plugin install slidesmith@slidesmith-local --scope user
# 重启 Claude Code 后，MCP 工具 slidesmith_open/get_requests/apply_patch/status 生效
```

也可不装插件、直接起桥接给人用：`npm run sm -- serve <deck.html>`（开浏览器、连上模式）。

## 它解决什么

同目录的兄弟 skill（`html-ppt` / `guizang` / `frontend-slides` / `huashu` …）能生成很漂亮的 HTML slides，
但产物几乎都是**一次性的静态 HTML**——想改只能回去重新生成。Slidesmith 补的正是这块空白:
**把 AI 生成的（遵循契约的）HTML deck 变成可视化编辑、可 AI 回改、可导出**的东西。

## 架构一图

```
   浏览器 Studio  ──WebSocket──▶  桥接(bridge)  ◀──MCP──  Claude Code
   (人做高频细活)                 localhost:8765            (做模糊重活)
        │  在某页留"评论"(任务)  ──向上──▶  请求队列  ──▶  slidesmith_get_requests
        │                                                        │ 按 data-id 改那几页
        ◀── 当场替换那几页(✓已改/可还原) ◀── 补丁 ◀── slidesmith_apply_patch
```

桥接是中间人：浏览器沙箱关着 Studio、Claude Code 在桌面，谁也直接够不到谁。
桥接两边都够得着——Studio 走**同源 WebSocket**，Claude Code 走 **MCP**。
真相源始终是那份**契约 HTML deck**（单文件、离线、可移植）。从 `file://` 打开 Studio 则退回纯离线手动模式。

## 里程碑历史

- **v1 (M0–M5)**：IR→渲染→主题/动画→PDF/PNG→可视化编辑器；**M6 独立 Studio · M7 设计系统 · M8 视觉自检**。
- **🔄 HTML-first 转向 N1–N4**：导入契约 deck · 就地编辑 · Submit-to-AI 回路 · 视觉自检 + PDF。
- **桥接 + 插件**：`packages/bridge`（HTTP+WS+MCP）+ `plugin/`（Claude Code 插件），消除手动搬文件。
- **AI 整合编辑器 ①–④**：页内评论闭环（跟随当前页 + 队列 + 徽标）· 整份 deck 级评论 · 审阅/还原 · 直接编辑增强 · 动态进度提示（待发送/已发送脉冲/已改）。

## 文档导航

| 文档 | 内容 |
|---|---|
| [GUIDE.md](GUIDE.md) | **人类指南**：怎么连 Claude、连接状态、评论工作流、进度/审阅/还原、离线用法 |
| [AGENTS.md](AGENTS.md) | **AI 接口**：MCP 工具、怎么读评论请求、按 data-id 回写、生成契约 deck |
| [packages/bridge/README.md](packages/bridge/README.md) | **桥接**：HTTP+WebSocket+MCP，`serve`/`mcp` 命令，控制 API |
| [plugin/slidesmith/README.md](plugin/slidesmith/README.md) | **Claude Code 插件**：清单 / 市场 / `.mcp.json` / `/slidesmith` 命令 |
| [docs/DECK-CONTRACT.md](docs/DECK-CONTRACT.md) | **Deck 契约**：AI 照此生成、导入器照此解析（合规层级 L1/L2/L3） |
| [docs/PIVOT-v2-html-first.md](docs/PIVOT-v2-html-first.md) | HTML-first 改造蓝图 |

## 借鉴来源

- `keynote.html`（用户成熟样例）→ Deck 契约结构 · `huashu` Tweaks → 调参面板 ·
  Open Design（桌面）→ 画布/检查器 UX · Claude artifacts → Submit-to-AI 回路 ·
  `html-ppt`/`guizang` → 主题/布局/动画 · 现有 3 skill → 视觉/同步 DNA。

## 当前状态 & 下一步

✅ Studio + 桥接 + Claude Code 插件全链路打通，真实 dogfood 跑过（连上 → 留评论 → Claude 自动改 → 当场可见）。
▶ **候选**：把"自动接活"做成常驻服务 · `slidesmith_save` 一键存盘 · 评论卡贴幻灯片下方（docked）· deck 级 token 补丁。

记忆系统：见 [`_memory/active.md`](_memory/active.md)（当前状态与下一步）。
