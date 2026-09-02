# Studio 源码分成了 20 个 part

`main.ts` 是**生成物**——`node scripts/build-studio.mjs` 把这里的 `*.ts` 按文件名顺序原样拼接成
`../main.ts` 再打包。**改代码改这里，别改 main.ts**（构建会用哈希发现你改了生成物并拒绝覆盖）。

为什么是「拼接」不是 ES 模块：这 5,800 行共享几十个顶层 `let`（mode / cur / htmlSlides / H …），
真拆成模块要把它们全改成状态对象，改动面太大、回归风险太高。拼接拆分是**零风险**的第一步——
拼回去与拆之前逐字节一致，构建产物哈希不变；以后哪个 part 想变成真模块，单独动它即可。

只有 `01-head.ts` 带 `import`，其余 part 都是同一作用域里的代码。类型检查只跑生成后的 `main.ts`
（tsconfig 的 include 只列它），单个 part 自己过不了 tsc 是正常的。

| part | 内容 |
|---|---|
| `01-head.ts` | 文件头：说明 + 全部 import（唯一带 import 的部分——其余 part 共享同一作用域） |
| `02-preview-bridge.ts` | IR 模式预览桥：注进 deck iframe 的就地编辑脚本（data-bid 块） |
| `03-state.ts` | 全局状态：字体库、桥连接状态、HTML 模式的 slides / H 骨架、脏标记、文件句柄、暂存盘 |
| `04-left-rail.ts` | 渲染左栏：页面列表 / 换装画廊 / 插入中枢 |
| `05-ir-mode.ts` | IR 模式（旧）：编辑、元素操作、文稿块、导入导出 |
| `06-html-deck.ts` | HTML 模式核心：loadHtmlDeck · assembleDeck（预览注入 / chromeCss / editCss）· 就地换皮 · 收割写回 |
| `07-watch-cues.ts` | Apple Watch 提词：提词表读写 + 对外接口（桥 ↔ 这里） |
| `08-notes.ts` | 讲稿批注：一体版讲稿视图、划词批注、待办 |
| `09-annotations.ts` | 元素批注：预览里的角标层、批注小窗、锚点（原文前 40 字） |
| `10-notes-api.ts` | 讲稿的对外接口：Claude ↔ 桥 ↔ 这里（读块 / 写回校验） |
| `11-history-images.ts` | 不丢工作：脏标记与草稿、撤销重做、插图、暂存盘 |
| `12-color-picker.ts` | 网页内色板（替代原生取色器） |
| `13-ai-requests.ts` | AI 待办：已有图占位符、请求体构造（改字 / 配图 / 导入图 / 批注）、待办清单、图片库面板、搜图 |
| `14-gizmo-animpicker.ts` | 画布 gizmo（移动 / 缩放 / 批注把手）+ 动画库子窗口 |
| `15-fonts.ts` | 导出字体：子集化 + 只嵌用到的字重 + 去重 + 默认开 |
| `16-ai-patch-audit-pdf.ts` | AI 回写（applyAiPatch / 提议栏 / 还原）· 视觉自检 · PDF 导出 |
| `17-topbar-cmdk-live.ts` | Studio 顶栏放映 / 演讲者 · ⌘K 命令面板 · AI 改了什么 · 现场互动卡 |
| `18-bridge-connect.ts` | 桥：连接模式 + 一键连接 Claude |
| `19-ui-css.ts` | UI 样式表（CSS 模板字符串） |
| `20-ui-markup-boot.ts` | UI 骨架 markup + 全部事件绑定 + 启动 |
