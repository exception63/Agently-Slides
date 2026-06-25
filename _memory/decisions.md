# Decisions: Slidesmith — AI-first HTML Slides System

| Date | Decision | Status | Notes |
|---|---|---|---|
| 2026-06-24 | 初始化 Hermes 式项目记忆系统 | Active | hot/semantic/episodic/procedural/archive |
| 2026-06-24 | **源格式 = Hybrid**: Markdown authoring → JSON IR canonical | Active | 兼顾 AI/人类书写便利与可视化编辑无损往返。Markdown 仅 authoring/import/export，IR 才是真相源 |
| 2026-06-24 | **技术栈 = Node.js + TypeScript** | Active | Web 原生、npm 分发、浏览器运行时与编辑器同语言 |
| 2026-06-24 | **v1 人类编辑面 = 实时预览 + 内联快编** | Active | 覆盖~80%后编辑；全 WYSIWYG 留 v2+ |
| 2026-06-24 | **v1 重心 = AI→产物 流水线优先** | Active | 先端到端验证 IR，再加宽；编辑器 M5 跟进 |
| 2026-06-24 | 不直接采用 reveal/Slidev/Marp，做"薄引擎+自有 IR" | Active | 五约束无单一工具同时满足；但子问题皆可复制 |
| 2026-06-24 | 演讲者同步主通道 = window.open()+postMessage+心跳 | Active | `file://` 下 BroadcastChannel/localStorage 失效，仅作 http 增强。**修正现有 skill 做法** |
| 2026-06-24 | 锚点单一来源(从 IR slide id 派生) | Active | 消除 slides/transcript/presenter 三处手工同步 |
| 2026-06-24 | CJK: 标题子集内联字体 + 系统正文栈，不内嵌整套字体/不依赖 CDN | Active | 保离线可移植；用 text-autospace/text-spacing-trim |
| 2026-06-24 | 动画: GSAP(免费)页内时间轴 + View Transitions 页间 | Active | 备选全 MIT 用 Motion；声明式 data-anim* |
| 2026-06-24 | 产品代号 Slidesmith / CLI `slidesmith` | Active | 用户已确认采用 |
| 2026-06-24 | **程序界面(编辑器/GUI)用 HTML 呈现**，浏览器内本地 Web 应用，不做原生客户端 | Active | 跨系统操作；与 Node/TS+浏览器栈一致；预览复用 render engine。可选 Electron 壳留后续 |

| 2026-06-24 | M0 工程: npm workspaces(无 pnpm) · zod 校验 · vitest · `@slidesmith/*` 包名 | Active | ir 用 extensionless import + moduleResolution Bundler；测试经 vitest(读 src)；CLI/engine 消费时改 bundler(tsup/esbuild) 产可运行 ESM |
| 2026-06-24 | **工作方式: 用户非程序员，授权自主推进里程碑**，不做代码评审 | Active | 用"能用 + 截图/实际产物演示"验证，不让用户看代码；反馈在真实使用时给。优先让每步产出可直接打开/看见的东西 |
| 2026-06-24 | M1 引擎: 内部包解析到 src(vitest alias + package main=src)；CLI 阶段再 bundle | Active | 无需逐包 build；engine tsconfig 用 paths 指向各包 src |
| 2026-06-24 | style token 工具类(c-/fs-/al-/w-)用 `!important` 永远压过组件 CSS | Active | 否则 `.slide h1` 特异性高于 `.c-accent`，IR 的 style 不生效(M1 实测 bug) |
| 2026-06-24 | 验证用本地 http 服务截图(Playwright MCP 禁 file://) | Active | 产物本身仍单文件 file:// 可用；仅自动化截图需 http |
| 2026-06-24 | **最终输出风格目标 = keynote.html**(用户指定) | Active | 已拷贝到 `docs/style-reference/keynote-target.html`(204KB/1697行)。M4 主题阶段做成内置主题(很可能成旗舰/默认风格)。不打乱顺序，先做 M2 |
| 2026-06-24 | 顺序不变: 按原 roadmap M0→M5 | Active | 用户明确"不用调整顺序"。编辑器仍排 M5；M2 继续做 Markdown 解析 + CLI |

| 2026-06-24 | M2: 解析用 markdown-it + gray-matter；`:::`容器指令(layout/slot/note/seg/segname/id) | Active | slide 用 `---` 分隔(忽略代码围栏)；块 id 全局自增 b1..；CLI 用 commander |
| 2026-06-24 | CLI 暂经 tsx 运行(`npm run sm --`)，未打包二进制 | Active | 内部包 main=src/ts；可执行 binary 待后续 esbuild bundle(asset 内联问题届时解决) |
| 2026-06-24 | M3 IR 扩展: 加 `slide.noteBlocks[]`(kind=cue/golden/data)，`notes`(string)仍存台词正文 | Active | 解 NEXT-SESSION 标注的断点; 向后兼容(旧 deck 不受影响); parser 把 `:::cue/golden/data` 写进结构(放宽正则支持紧凑写法 `:::cue`+裸`:::`闭合) |
| 2026-06-24 | M3 锚点单一来源落地: `deriveSlideMeta(deck)` 派生 anchor+seg+title，deck/transcript/presenter 全引用同一结果 | Active | 一次 build 内三处必一致(插页重 build 不错位); `slideTitle` 回退 heading→quote→text→id |
| 2026-06-24 | **M3 同步主通道 = window.open()+窗口引用 postMessage+~1s 心跳，完全不用 BroadcastChannel** | Active | 兑现既定修正; file:// 下 BC/localStorage 失效而窗口引用 postMessage 永远可用; deck↔presenter 用 opener/child 引用, presenter↔transcript 用 iframe.contentWindow; `source` 字段防回声; 浏览器实测正/反向双工通过 |
| 2026-06-24 | M3 transcript = 每 slide 一个自包含 `<article id=anchor>`(非旧 skill 的扁平 prose+散锚点) | Active | "整块高亮"=直接高亮该 article(无需 nextElementSibling 遍历); IR 单一锚点模型让旧机制变多余, 更干净 |
| 2026-06-24 | M3 CLI build 默认产 deck+transcript+presenter 三件套(共享 basename, 相对名交叉链接), `--deck-only` 跳过 | Active | 相对名 `x.transcript.html`/`x.presenter.html` 同目录, file:// 直接可用; deck/presenter 也可由 location 约定自行推导对方 URL |
| 2026-06-24 | M4 主题: 3 套(editorial/keynote-dark 旗舰/academic)，共用同一 class 契约换肤不改结构 | Active | keynote-dark 按 `keynote-theme-spec.md` 暗+琥珀(Space Grotesk 系统回退) 落到现有 layout 集，不新增 layout(避免动 IR/parser) |
| 2026-06-24 | **M4 运行时换肤 = 全主题内联 + media-gated(`media="not all"`)，`T` 键翻 media** | Active | 离线单文件可切；非活动表用 media 关闭(标准、无 FOUC、无需 JS 初绘)；比 `<style disabled>`/重写选择器更稳 |
| 2026-06-24 | **M4 动画 = 纯 CSS keyframes + rAF counter，未引入 GSAP** | Active | keynote spec 本身就是 CSS @keyframes；离线轻量(免 ~70KB UMD)；`data-anim*` 由 render 产出、engine.js reveal 读取设 per-元素/per-li 延迟；`body.anim` 开关(B 键)、reduced-motion、print 强制 opacity:1 |
| 2026-06-24 | M4 导出 = playwright-core + chromium headless-shell(不绑全 playwright) | Active | headless-shell 体积小;版本须配 playwright-core(1.61.1→build 1228, 已 `playwright-core install chromium-headless-shell`)；PDF 走 @media print(@page 1920×1080, 一页一 slide)，PNG 走 present 模式 `window.__SM_GO__` 逐页截图 |
| 2026-06-24 | M4 QA = `@slidesmith/qa` lintDeck(IR 级, 无需渲染) | Active | 查空页(error)/槽过密/超长标题文本/长列表/缺 alt/缺讲稿(info)/重复标题; 接入 `validate`(有 error 退出 1) + 独立 `lint --strict`(warn 也退出 1) |
| 2026-06-24 | **M5 编辑器 v1 不用重型块编辑库(Editor.js/TipTap/Lexical)**，用 contentEditable + 面板 | Active | IR 块是扁平 typed + 纯文本 payload，contentEditable 直接往返(html→**md** 还原 strong/em)够用；ProseMirror 级编辑留 v2。Open decision「块编辑库选型」就此定为 v1=轻量、v2=按需 |
| 2026-06-24 | M5 编辑器架构: Node http 本地服务(无框架) + 浏览器三栏 app；server 持 deck，client 全量回写 | Active | `/preview`=`renderDeckHtml(deck)`+注入 bridge；`/api/deck` GET/POST(POST 先 validateDeck 再写 deck.json)；`/api/rebuild` 产三件套；预览 iframe 用注入 bridge(contentEditable + postMessage `sm-edit`/`sm-select`)；deck 导航复用 `window.__SM_GO__` |
| 2026-06-24 | M5 结构改动必须「先存后刷」: commit(立即 POST).then(reloadPreview) | Active | 实测 bug: 改主题/布局后 debounced save 落后于 reloadPreview → /preview 渲染旧 deck。文本编辑仍用 debounced save(无需刷预览, contentEditable 已显示) |
| 2026-06-24 | **v1 路线图(M0–M5)完成** | Active | 全功能: MD→IR 解析/校验/lint/渲染(deck+transcript+presenter)/3 主题+运行时换肤/动画/PDF·PNG 导出/可视化编辑器。decks 本身仍 0 依赖单文件；仅作者侧 CLI 引入 playwright-core(2 moderate vuln，不入产物) |
| 2026-06-24 | **用户澄清核心需求: 要"能双击打开的 HTML UI"(非 CLI/服务器)** → 做独立浏览器 Studio | Active | M5 的 `edit` 需终端，用户(非程序员)用不了。双轨明确: 人类=Studio 单文件 HTML(导入/编辑/导出全在浏览器)，AI/终端=CLI。共用 canonical deck.json |
| 2026-06-24 | **Studio = 单文件自包含 HTML，esbuild 打包浏览器版整条流水线** | Active | `scripts/build-studio.mjs`: esbuild bundle `packages/studio/src/main.ts`(iife/minify) + 虚拟模块插件内联 `@slidesmith/runtime`/`@slidesmith/themes`(资产/主题 CSS 当字符串) + `gray-matter`→浏览器 frontmatter shim(避 Node Buffer)。markdown-it/zod 直接 bundle。产 `studio/slidesmith-studio.html`(~304KB) |
| 2026-06-24 | Studio 预览=srcdoc iframe + postMessage(无服务器，file:// 安全)；deck 在内存，改动同步重渲染 | Active | 比 M5 服务器版更简单: 无"先存后刷"竞态(内存同步)。文本编辑走 bridge postMessage 回写、结构改动重设 srcdoc。导入=拖拽/文件选择→validateDeck；导出=Blob 下载(json/md/三件套 HTML) |
| 2026-06-24 | 加 `irToMarkdown`(IR→authoring MD 反向序列化) 入 engine | Active | Studio "存 .md" + 给手写/git diff 用；round-trip 测试(MD→IR→MD→IR 结构不变)；exotic 块(chart/embed)best-effort。canonical 仍 JSON |
| 2026-06-24 | **产品定位升级: AI 做整体、人类精修;系统是"会生长的 design system"** | Active | 用户定调:AI 擅长整体、细节改起来慢→人类在 Studio 精修;用户用 AI 做出新设计/动效→让我"融入项目",越用越贴合。元素登记册 `docs/design-system.md`(含怎么加新效果) |
| 2026-06-24 | Studio 右栏改 Keynote 式三 tab(格式/动画效果/文稿)+ 子区 + 元素级增删移 | Active | 仿 Keynote inspector;格式=主题/布局/选中元素字号·颜色·粗细·对齐(符号 token)+上移/下移/删除/加元素;动画=入场 anim + 持续 motion;文稿=notes + cue/golden/data。自由拖拽+吸附排后(需 IR 绝对坐标) |
| 2026-06-24 | IR 加 `build.motion`(持续动效) 与 `build.anim`(入场)并列;扩 ANIM_NAMES | Active | 提取自 keynote.html(glow=kl-breathe 呼吸灯/neon/stress)+ huashu(breathe/float/pulse);入场加 fade-up/pop/in-left/in-right;缓动统一 expoOut `cubic-bezier(.16,1,.3,1)`(huashu 反廉价曲线)。声明式 `data-motion`,CSS keyframe 在 core.css,B 关 + reduced-motion |

| 2026-06-24 | **里程碑编号对齐**: v1 后的 M6=独立 Studio、M7=设计系统 v1、**M8=AI 视觉自检环** | Active | 截图目录 m6/m7 已被 Studio/设计系统占用,故新主线编号 M8(截图 m8/)。roadmap 表补上 M6/M7 行 |
| 2026-06-24 | **M8 启动方向 = 闭合 AI 视觉环**(用户在"如何迭代"中拍板,推荐项) | Active | 洞察:产品命脉是 AI↔人交接环,v1 两端都是开口的。AI 端=闭眼生成(只有结构层 validate/lint,看不见渲染结果)。先补 AI 端视觉自检;人机协作环(局部 patch+Studio 回灌 AI)、真图表/拖图、设计系统可拖入包 留作后续主线 |
| 2026-06-24 | **缓做"自由拖拽 WYSIWYG"**(原 v2 头号项) | Active | 自由拖拽需 IR 引入绝对坐标,与"可重排/可换肤/AI排版+人精修"模型打架,高投入偏离主张。改走 per-element token 微调(低风险覆盖 80% 精修)+ 闭环工作 |
| 2026-06-24 | M8 视觉审计 = 复用 export 的 playwright-core 路径,headless 渲染→present 模式逐页 `__SM_GO__`→在页内量真实布局 | Active | 检测项:越界裁切(per-block 用 data-bid + slide 级 scrollHeight)/对比度(WCAG,有效背景=向上找首个非透明 bg)/坏图(naturalWidth==0)/空页(layout-aware fill<12%)。每条 finding 带 slide id + block data-bid → AI 知道改哪 |
| 2026-06-24 | 页内审计器写成**原始 JS 字符串** `AUDIT_SRC` 传 page.evaluate(非 TS 函数引用) | Active | tsx/esbuild 给具名函数注入 `__name` helper,浏览器里未定义→传函数引用会 `ReferenceError: __name`。IIFE 字符串免转译、也扛未来打包。代价:页内代码失去 TS 检查(可接受,本就是浏览器代码) |
| 2026-06-24 | 新增 `audit`(视觉审计,--thumbs/--json) + `doctor`(validate+lint+audit+缩略图 一站式交付前 gate) | Active | doctor 是给 agent 的推荐工作流第 3 步(generate→validate→**doctor 看+修**→build);有 error 退出 1。finding 用统一 `[code]` 格式(visual.offcanvas/overflow-y/contrast/image-broken/sparse)。AGENTS.md §recommended workflow + finding codes 表已更新 |
| 2026-06-24 | demo 产物 `examples/broken.deck.json`(过 validate+lint 但渲染翻车:display 巨字溢出 + color=bg 隐形文字) | Active | 证明"结构合法≠视觉正确"的缺口;audit 实测两条 error 各带 block id,AI 改 IR(display→h3、bg→ink)后 doctor 全清,前后缩略图存档(dist/broken/) |

| 2026-06-24 | **🔄 重大转向: HTML-first 改造**(用户"如何迭代"二轮深思后拍板) | Active | 反转 v1 第一支柱(IR 唯一真相)。定位从"IR 生成器"→"把 AI 生成的(遵循契约的)HTML deck 变可视化编辑+AI回路+可导出 的编辑器/增强器"。依据:扫描 6 兄弟项目无一能"生成后再编辑"(仅 huashu 有调参 Tweaks),是真实空白。蓝图 `docs/PIVOT-v2-html-first.md` |
| 2026-06-24 | 真相源 = **契约 HTML deck 本身**(非 JSON IR);Studio 改"导入真实 HTML 并增强",不再"由 IR 渲染" | Active | 抽取轻量结构视图(slides/tokens/可编辑节点)驱动编辑器,是视图非真相。parser-md/严格 IR schema/IR→HTML 渲染器 降级为可选入口或归档 |
| 2026-06-24 | **Deck 契约 = keynote.html 结构**(`docs/style-reference/keynote-target.html`,36页);AI 照此生成 | Active | 实测结构:令牌全在 :root + 工具类原子(.title/.lead/.eyebrow)+ `<section class=slide data-id/seg/segname/title>` + SLIDE_MAP + data-theme 换肤。原则"结构紧内容松"。缺的编辑钩子(contentEditable+检查器)由本项目补 |
| 2026-06-24 | 复杂改动 = **Submit-to-AI 回路**(每页窗格→导出修改请求文件→AI 只重写那页 section(按 data-id)→应用/重导入) | Active | 不硬造全功能 WYSIWYG;借 Claude artifacts 回路。简单改(文字/字号色/换肤/基础动效)在 Studio 就地做 |
| 2026-06-24 | v2 里程碑 N1-N5: N1 契约+导入器 / N2 就地编辑(改字+Tweaks+导出) / N3 Submit-to-AI 闭环 / N4 接回演讲者·导出·M8自检 / N5(可选)Open-Design 式画布 | Active | 借鉴:keynote.html(契约)/huashu Tweaks(检查器面板)/Open Design.app(画布UX)/Claude artifacts(AI回路)。保留复用 ≈60%(引擎/M8/导出/Studio 外壳) |

| 2026-06-24 | N1 落地: Studio 加 html 模式(DOMParser 解析 `#deck>.slide`)+ `docs/DECK-CONTRACT.md`(L1/L2/L3) | Active | 导入 keynote.html=36页+6段+36缩略图+0错;`window.__SM_IMPORT__` 自动化钩子;验证 `scripts/verify-n1.mjs`(playwright-core file://) |
| 2026-06-24 | **N2 就地编辑架构 = 单页干净编辑面 + parent 直接操作同源 iframe DOM(无节点寻址)** | Active | srcdoc 同源→parent 可读写 contentDocument;编辑面=deck head 样式+fit 缩放,不跑 deck 引擎(避免 wrap/clone 污染);isTextLeaf(无块级子节点+有文字)挂 contentEditable;导出时 harvest 当前页 outerHTML(剥 contentEditable/sm-sel)。比注入 bridge + postMessage 简单可靠 |
| 2026-06-24 | **N2 令牌覆盖走 `<html>` inline style**(不用 `:root{}` style 块) | Active | 实测 bug: `:root{--accent}` 覆盖块特异性低于 deck 的 `:root[data-theme=dark]{--accent}` → 换色失效。inline style on `<html>` 特异性最高,必胜;导入时解析 `<html style>` 的 `--*` 回 H.overrides 再 strip,避免重复 |
| 2026-06-24 | N2 导出 = 重组(prelude + `#deck`{各页 outerHTML} + trailing),非改原串 | Active | 导入时把 body 按 `#deck` 切成 prelude/trailing 留存,head/htmlAttrs/bodyClass 留存→导出重新拼装,保 deck 自带引擎/SLIDE_MAP/演讲者脚本。`__SM_EXPORT_HTML__` 钩子;round-trip 实测改字+换色重导入全在 |
| 2026-06-24 | N2 setHtmlMode 只隐藏 IR 面板用 `[data-pane]`(非 `.pane`) | Active | 实测 bug: 隐藏 `.pane` 把检查器自身的 `.pane` 也藏了→右栏空白。改用 `[data-pane]`(仅 IR 三 tab 面板带该属性) |
| 2026-06-24 | **N2 修订: 编辑面 = 渲染完整 deck(含自带引擎),不再单页**(用户反馈) | Active | 单页编辑面 bug: ① `.sm-stage{display:flex}` 让 `.slide` 作为 flex item 被横向压缩→**变正方形**;② 不跑 deck 引擎→**丢了 deck 自带的缩略图段导航**(用户明确想要那个)。改为 `assembleDeck()` 渲染整份 deck→引擎自建 segnav/缩略图、16:9 正确。编辑层叠加在 `#deck .slide`(同源直接 contentEditable + 选中);harvest 读 `#deck .slide` 剥 `.chrome`/contenteditable/active/data-global-idx。导出 `assembleDeck(false)` |
| 2026-06-24 | N2 Studio 左侧页列表可折叠(`body.navcollapsed`)+ html 模式自动折叠 | Active | 用户:html 模式用 deck 自带导航即可,Studio 列表要能折叠。☰ 顶栏按钮切换;进 html 模式自动 collapse(deck 有自己的 segnav);IR 模式自动展开。主题切换交给 deck 自带控件(避免 localStorage 抢);检查器只留 accent/paper/ink 令牌 + 选中元素 |

| 2026-06-24 | **N3 Submit-to-AI = 请求文件(.md) + 补丁(HTML 片段) 回路** | Active | 请求 `<deck>.<id>.ai-request.md` 自包含(指令+该页当前HTML+令牌+契约);AI 只输出一个 `<section class="slide" data-id=同id>`;Studio `applyAiPatch` 按 data-id 精确替换(单段无id→落当前页),应用前 harvest 别页防丢手改。导入即给每页注入稳定 data-id。AGENTS.md §6b 文档化。钩子 `__SM_AI_REQUEST__`/`__SM_APPLY_PATCH__` |
| 2026-06-24 | N3 目标页 = 选中元素所在页 → deck active 页 → 左栏 cur(回退) | Active | `currentHtmlSlideIndex()`;检查器顶部"目标页"标签实时反映。已知小瑕疵:应用补丁后 deck reload 跳回首页、标签随之回首页,留 N4 保位 |

| 2026-06-24 | **N4 视觉自检进 Studio = 浏览器内量渲染后布局**(不复用 CLI playwright) | Active | Studio 无 Node;`auditImportedDeck()` 在同源 iframe 上用 scrollHeight/clientHeight(溢出,transform-immune)+ win.getComputedStyle 算 WCAG 对比度 + naturalWidth 坏图;每页 contrast 限 2 条防刷屏。检查器出可点报告→跳页。M8 的"人也能一键自检" |
| 2026-06-24 | **N4 PDF = 纯浏览器 print**(不在 Studio 跑 playwright) | Active | `pdfPrintHtml()`=assembleDeck + 注入 print CSS(每页 1920×1080、`.slide` 强制 relative/transform:none/page-break)→ window.open + print → 用户「另存为 PDF」。离线、无依赖;实测 page.pdf 出 36 页。精确 PNG/批量仍走 CLI export |
| 2026-06-24 | N4 修 N3 保位: `htmlGotoAfterRender` 记录补丁页,renderHtmlEdit onload 后 selectHtmlSlide 回该页 | Active | 解决"应用补丁后 deck reload 跳回首页"。初次导入该值 -1 → 停在首页(正确) |
| 2026-06-24 | 演讲者/讲稿同步对导入 deck 暂缓 | Open | 需从契约 deck 抽取 notes(位置不标准);keynote 自带演讲者钮指向 slides-presenter-mode 生成的 `演讲者模式.html`。留后续里程碑 |

| 2026-06-24 | AGENTS.md + GUIDE.md 重写为 **HTML-first**(用户要求,部分兑现 N5"对齐生成侧") | Active | AGENTS.md 主路=AI 生成契约 HTML deck(§2 essentials + 链 DECK-CONTRACT)+ Submit-to-AI 应用(§4)+ 视觉自检(§3);IR+CLI 降为 §6 "alternative/legacy"。GUIDE.md 主流程改"AI 出 HTML→拖进 Studio 改→导出";新增 C 节解释 Submit-to-AI 怎么传(走文件)/怎么只改那页(按 data-id)/冲突(轮流非同时,同页快照过期是唯一坑)。**README.md 仍是 IR-era,待更新** |

| 2026-06-25 | **聚焦决策: 项目只做"快速改 slides 编辑器"**;讲稿同步/双屏交给其它 skill,本项目不做 | Active | 用户拍板收窄范围。双屏/讲稿里程碑搁置 |
| 2026-06-25 | 打磨: 就地编辑加**持续动效**(data-motion: glow/breathe/float/pulse/neon/stress);MOTION_CSS 注入每次 assembleDeck(预览+导出),离线可播 + reduced-motion | Active | 之前只有入场动画(data-anim),动效丢了。检查器选中元素加"持续动效"下拉(7 项) |
| 2026-06-25 | Submit-to-AI 改批量: 每页指令**记住可改**(aiInstructions[id] map,切页自动存取)+「📦导出全部请求」一次性打包所有写过的页 + 仅本页/清空本页;应用支持**粘贴**(不必存文件)或文件 | Active | 用户要"逐页写好一次性提交"。批量请求一个 MD(令牌一次+每页 block);applyAiPatch 已能多 section 一起应用、按 data-id 落位、应用后清该页指令 |
| 2026-06-25 | **修真 bug: 就地编辑 wiring 之前根本没生效** | Active | renderHtmlEdit 把 contentEditable+点选监听挂在 iframe `load` 事件上,而 load 等 deck 的外部字体 `<link>`(离线时卡住)→ 点字编辑/选元素静默失效(过往测试都绕过了选择,没暴露)。改为**轮询 contentDocument 出现 `#deck .slide` 即 wiring**(不等 load),done 标志防重复。实测 selTag=h1.cover__title、data-motion 落到正确元素 |

| 2026-06-25 | Submit-to-AI 导出文件 = **完整 prompt**(角色+任务+令牌+每页指令&当前HTML+输出规范) | Active | 文末「输出要求」明确让 AI 生成 `<deck>.patch.html`(只含若干 `<section data-id>`),用户「从文件应用/粘贴」导入即生效。aiRequestHeader(角色/任务/令牌)+aiSlideBlock(每页)+aiOutputSpec(产物规范)。AGENTS.md §4 同步。样例 `dist/polish/sample.ai-request.md` |

| 2026-06-25 | **插件通信架构 = 本地服务 + MCP 中间人**(用户认可,下个会话搭) | Active | 浏览器 Studio 沙箱不能直连桌面 Claude Code → 本地小进程当中间人:Studio↔WebSocket(同源)、Claude Code↔MCP(原生)。三选一里选③(另:①手动文件=兜底,②File System Access API=Chrome only)。MCP 工具 `slidesmith_open/get_requests/apply_patch`;Studio "已连接"模式,断开退回手动(=人类脱离 AI 单干)。复用 `window.__SM_*` 钩子。详见 `_memory/NEXT-SESSION.md` |

| 2026-06-25 | **桥接(本地服务+MCP)落地**: 新包 `@slidesmith/bridge` = node:http 服 Studio + `ws` WebSocket + MCP(`@modelcontextprotocol/sdk`,stdio)，内存持 deck+请求队列 | Active | Studio 经**同源 WS**(`ws://location.host`,故 deck 路由不用知端口)连回；`file://` 无 host→静默退回手动模式。CLI 加 `serve`/`mcp`；MCP 进程内嵌 HTTP+WS。装了 `ws`+MCP SDK 两个 dev 期依赖(bridge 是开发态工具，不破坏产物离线性) |
| 2026-06-25 | MCP 4 工具: `slidesmith_open/get_requests/apply_patch/status`，复用 §4 请求/补丁格式(按 data-id) | Active | open=载 deck+开浏览器；get_requests=读用户「🚀 发送给 Claude」提交的意见(取走清空)；apply_patch=推 `<section data-id>` 当场替换。Studio 加 `__SM_BRIDGE__`/`__SM_SEND_ALL__` 钩子。验证 `scripts/verify-bridge.mjs`(tsx,起 bridge+headless Studio,14/14 过) |

| 2026-06-25 | **打包成 Claude Code 插件**: 本地 marketplace `slidesmith-local` + 插件 `slidesmith`(`plugin/`) | Active | MCP 必须放**单独 `plugin/slidesmith/.mcp.json`**(扁平 name→config,**非** plugin.json 内联 `mcpServers`——这版 v2.1.162 不识别内联,details 显示 MCP(0))。命令 `commands/slidesmith.md`。装插件会**拷贝到 `~/.claude/plugins/cache/`**,`${CLAUDE_PLUGIN_ROOT}` 指 cache(无 node_modules)→ MCP 启动用**绝对路径** `node + 仓库/node_modules/tsx/dist/cli.mjs + 仓库/packages/cli/src/index.ts mcp` |
| 2026-06-25 | 部署用 `claude` CLI(headless,非交互 /plugin TUI) | Active | `claude plugin marketplace add <repo>/plugin --scope user` + `claude plugin install slidesmith@slidesmith-local --scope user`;写进 `~/.claude/settings.json` 的 `extraKnownMarketplaces`+`enabledPlugins`。新 MCP **下次启动**才连(本会话搜不到工具,预期) |
| 2026-06-25 | bridge 加 HTTP 控制 API + patch 回灌 deck + EADDRINUSE 回退 | Active | `/api/{status,requests(GET取走),patch(POST)}` 让非 MCP(curl/dogfood)也能驱动 serve;`syncExportToBridge` 让 patch 后 bridge 内存 deck 更新(晚到 studio 也见);8765 被占→自动换空闲端口(遗留 serve 不和插件 MCP 抢) |
| 2026-06-25 | dogfood 用 control-API 黑盒跑实际部署的 serve(非 MCP 客户端) | Active | 本会话 MCP 未连,用 `/api/*` 等价跑通全闭环(`scripts/dogfood.mjs`,截图 `docs/screenshots/dogfood/`);**原生 `mcp__slidesmith__*` 实跑留下次启动后**(唯一没现场验的链路) |

| 2026-06-25 | **产品重定位 = 高度 AI 整合的 HTML slides 编辑器**(用户拍板) | Active | 核心原则**分工**:人做高频细活(点字/色/字号/动画/移动删除元素=即时零 token),AI 做模糊重活=经**评论**(像 Claude Design comment→edit,但真 HTML 自有+只发相关页省 token、绕开 token 上限+全可定制)。AI 角色=**只按我的评论改**(不主动提建议,用户选)。模型=**共享 deck + 评论/任务层** |
| 2026-06-25 | 编辑器重构 ①-④(评论闭环/deck 级/审阅还原/直接编辑) | Active | ① 评论**跟随当前页**(`navSyncTimer` 轮询 deck `.active`,`updateAiTarget` 用 `cur` 不用 selection;修原 bug:html 模式左列不再折叠、每页徽标、队列、apply 标✓不删)。② deck 级评论带**结构总览**。③ `aiBefore` 存改前 HTML→「还原本页」。④ inspector 选中元素 ↑↓🗑 直改 iframe DOM+harvest。`scripts/verify-editor.mjs` 22/22 |

## Open Decisions
| Question | Needed from | Why it matters |
|---|---|---|
| ~~块编辑库 Editor.js vs TipTap/Lexical~~ → **已定(2026-06-24): v1 contentEditable 轻量，重型库留 v2** | ~~spike(M5)~~ | — |
| 是否最终用 Style Dictionary 还是自写 token 解析 | M1/M4 | 主题工具链复杂度 |
| 与现有 3 skill 的最终迁移/退役策略 | 用户 | 是否把旧皮全导出为内置主题后退役旧 skill |
| 产品最终命名 | 用户 | Slidesmith 为暂定 |
