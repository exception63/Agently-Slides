# Timeline: Slidesmith — AI-first HTML Slides System

## 2026-06-24
- 初始化项目记忆系统。
- 完成 3 路并行需求调研: (A) 本地 6 收藏项目逆向、(B) 现有 3 skill 引擎拆解、(C) 外部最佳实践综述。
- 与用户确认 4 项关键决策: Hybrid(MD→JSON IR)、Node/TS、实时预览+内联快编、流水线优先。
- 产出 5 份文档: REQUIREMENTS-RESEARCH / PRD / ARCHITECTURE(含 IR schema v1) / ROADMAP / README。
- 定下里程碑 M0–M5。
- 用户补充: 程序界面(编辑器/GUI)用 HTML 浏览器内 Web 应用呈现(跨系统)。
- **完成 M0**: Node/TS monorepo(npm workspaces) + `@slidesmith/ir`(类型+Zod schema+校验+锚点派生+JSON Schema 导出) + 2 样例 deck + 13 单测。typecheck 干净、13/13 过、build 干净、prod 0 漏洞。7 个占位包就位。
- **完成 M1**: themes(editorial) + engine(IR→单文件HTML) + runtime(1920×1080缩放/翻页/段导航/实时缩略图/进度条/全屏)。20/20 测试、typecheck 0 错。浏览器实测+截图确认观感(已发用户)。修了一个 CSS 特异性 bug(style token 工具类加 !important)。产物 examples/preview/*.html。
- 用户反馈: 最终输出风格以 `keynote.html`(暗色+琥珀 keynote 风) 为准 → 已拷贝+后台拆解出完整 theme spec 存 `docs/style-reference/`，M4 实现。用户重申不调顺序、自主推进。
- **完成 M2**: parser-md(Markdown+frontmatter+`:::`容器 → IR, 用 markdown-it) + cli(new/build/validate, 支持 stdin JSON)。25/25 测试、typecheck 0 错。CLI 三路实测(md/json/stdin)+ 截图确认 markdown 产物。
- **完成 M3**: 同步讲稿 + 双屏演讲者模式。① IR 加 `noteBlocks`(cue/golden/data) + parser 解析; ② `deriveSlideMeta` 锚点单一来源; ③ `renderTranscriptHtml`(杂志风逐字稿, 每slide一个`<article id=anchor>`) + `renderPresenterHtml`(暗色副屏: 当前/下一页+计时+iframe讲稿+控制); ④ **同步主通道 window.open+postMessage+心跳(无BroadcastChannel)**, deck-side 写进 engine.js; ⑤ 整块高亮 + K 提词(仅激活块 strong); ⑥ CLI build 默认产三件套(`--deck-only` 跳过)。31/31 测试、typecheck 0 错。浏览器双窗口实测: 正向跟随高亮 + 反向按键翻页 + K 提词全部截图确认(已发用户)。`slideTitle` 加 quote/text 回退。
- **完成 M4**: 多主题 + 动画 + 导出 + QA。① 3 主题(editorial/keynote-dark 旗舰暗+琥珀/academic)，build `--theme` + 运行时 `T` 换肤(全主题 media-gated 内联、离线无 FOUC)；② 动画 `data-anim*`→CSS keyframes(fade/rise/stagger-list/counter-up)+ rAF 计数，`B` 关 + reduced-motion + print 可见，未用 GSAP；③ `export -f pdf|png`(playwright-core + headless-shell build 1228，PDF @media print 一页一 slide、PNG present 逐页截图)；④ `@slidesmith/qa` lintDeck(空页/溢出/缺 alt/缺讲稿/重复标题) 接入 validate + lint。36/36 测试、typecheck 0 错。浏览器实测: keynote-dark + T 换肤(academic↔keynote) + stagger/counter 动画 + PDF/PNG 导出全部截图确认(已发用户)。slideTitle 加 quote/text 回退(M3 起)。
- **完成 M5**: 可视化编辑器。`slidesmith edit <deck>` 起 Node http 本地服务 + 浏览器三栏 GUI(左幻灯列表/中实时预览复用 engine/右检查器)。中间预览注入 bridge → 点文字 contentEditable 直接改(html→md 还原 strong/em)→ postMessage 回写 IR；右侧换主题配色/本页布局/选中块动画；左侧加删移幻灯。自动保存 deck.json + 一键重建三件套。选型: v1 不用重型块编辑库(扁平 IR 块 contentEditable 够用)。修 bug: 结构改动「先 commit 后 reloadPreview」(否则 /preview 渲染旧 deck)。36/36 测试、typecheck 0 错。浏览器实测 0 次 AI 调用完成: 改标题+换 keynote-dark+加页+删页+设 stagger-list+重建 4 文件(截图存档)。
- **🎉 v1 路线图 M0–M5 全部完成**。
- **用户澄清核心需求 → 做独立浏览器 Studio**: 用户(非程序员)指出 `edit` 要终端、用不了，要"双击就能用的 HTML UI"。明确双轨(人类 Studio / AI 终端 CLI，共用 deck.json)。产出 `studio/slidesmith-studio.html`(单文件 304KB、离线、无服务器): esbuild 打包浏览器版整条流水线(虚拟模块内联 runtime/themes + gray-matter shim)，srcdoc 预览 + postMessage 编辑，拖入 json/md→点文字改+换配色/布局/动画+加删移页→导出 json/md/三件套 HTML。加 `irToMarkdown`(IR→MD 反向)。39/39 测试。浏览器实测全过: 导入(json+md)/内联编辑/换主题/导出(json+html+md)全部截图确认(已发用户)。
- **写接口/指南文档**: `AGENTS.md`(给 AI agent 的契约: 输入 deck.json、CLI 命令、完整 IR schema,免扫全仓) + `GUIDE.md`(人类: AI 怎么帮做、Studio 怎么用、何时用本项目 vs 直接问 AI) + `studio/README.md`。客观对比结论: 直接 AI = 单页视觉上限高/一次性;Slidesmith = 系统(数据层/可再编辑/一致/同步/导出)。
- **设计系统 v1(用户定方向)**: 确立"AI 做整体、人类精修、设计元素随用沉淀"。扫 huashu-design + keynote.html 提取格式/动画/文稿元素。① IR 加 `build.motion`(持续动效)+ 扩入场 anim(fade-up/pop/in-left/in-right)+ expoOut 缓动;② core.css 加 6 个动效 keyframe(呼吸灯 glow/呼吸/漂浮/闪烁/霓虹/强调脉冲);③ Studio 右栏重构成 Keynote 式三 tab(格式/动画效果/文稿)+ 元素级增删移 + 字号/颜色/粗细/对齐(符号 token)+ 文稿块编辑;④ 登记册 `docs/design-system.md`(含怎么加新效果)。40/40 测试。浏览器实测: 三 tab 切换 + 呼吸灯应用并导出 + 加元素 + 文稿块全部截图确认。
- 下一步 = 继续沉淀新动效/主题;自由拖拽+自动对齐(需 IR 绝对坐标)。
