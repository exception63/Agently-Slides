# Slidesmith 优化路线图(2026-06-26 立)

来源:从「使用者 / 人机交互 / 界面设计 / 程序员」四视角评审 Studio(详见对话 + `_memory/active.md`)。
按 **影响 × 工作量** 四象限排优先级。用户决定:**一步一步做**,先做下面"第一步"的三件。

## 第一步(✅ 完成 2026-06-26 · 用户钦点的 top-3)
- [x] **① 防丢失**:`markDirty()` 防抖写 `localStorage`(DRAFT_KEY)草稿 + 顶栏「●未保存」红点 + `beforeunload` 提醒 + `visibilitychange` 隐藏即存 + 重开 `maybeOfferDraftRestore()` 横幅(恢复/丢弃);`Cmd/Ctrl+S` 保存后 `clearDraft`。
- [x] **② 撤销/重做**:快照栈(`snapshot`=JSON.stringify(htmlSlides)+overrides+theme+fx+cur)。`pushHistory(tag)` 在每个变更前调,**700ms 同 tag 合并**(拖色块=1步);覆盖 style/font/anim/motion/animout/move/del/token/img/ai-patch/revert;文本按 `focusin` 字段粒度。`Cmd/Ctrl+Z`、`Cmd/Ctrl+Shift+Z`/`Ctrl+Y` + 顶栏 ↶↷ 钮(parent + iframe 内都挂键盘转发)。
- [x] **③ HTML 模式插入图片**:格式 tab「🖼 插入图片」(选文件→FileReader base64 内联 `<img>`)+ 预览内**粘贴图片**(iframe paste 监听)。选中元素则插其后,否则进当前页 `.fill`。插入入 undo 栈。(拖拽图片暂缓——与"拖文件=导入 deck"冲突。)
- 验证 `scripts/verify-resilience.mjs` **13/13**;回归 tabs/editor/fx/save/polish/n3/n4 全过。钩子 `__SM_UNDO__/__SM_REDO__/__SM_STATE__/__SM_PLACE_IMAGE__`。
- **坑记**:`harvestAll()` 读实时 iframe,undo 后若在 re-render 完成前 export 会把旧 DOM 重新采集回来(测试要等 re-render 落定);keynote-target deck 自带 1 个 `data:image`,测试要用唯一标记区分自插图。

## 直接操作:移动 + 改大小(✅ 完成 2026-06-26 · 用户追加)
- [x] **画布拖拽 gizmo**(Keynote 式):选中元素出蓝框 + 上方 ✥ 移动柄 + 右下角 ◢ 改大小柄。移动=inline `transform: translate`(保住 flow 布局槽,不破契约);改大小=inline `width`(图片 `height:auto` 保比例)。坐标按 `deckScale=rect.width/offsetWidth` 换算(deck 1920 缩放到 iframe)。gizmo `position:fixed` 贴 `getBoundingClientRect`,挂在 iframe body(不进 slide → 不被 harvest)。
- [x] 检查器补:宽度(px)输入 + 「↺ 复位大小/位置」+ 方向键微调(选中时 ←↑↓→ 移 10px / Shift 1px,Keynote 式)。入 undo、入草稿、导出带。钩子 `__SM_MOVE_SEL__/__SM_RESIZE_SEL__/__SM_GIZMO_ON__`。

## 先做批次(✅ 完成 2026-06-26)
- [x] **快捷键**:`Cmd/Ctrl+S` 保存、`Cmd/Ctrl+Z`/`Shift+Z`·`Ctrl+Y` 撤销重做、方向键翻页(无选中时 ←→ 翻页)/微调(有选中时移动元素)、`Esc` 取消选择、`Delete` 删元素(都加了"不在输入框/contentEditable 才触发"守卫)。
- [x] **Studio 暗色模式**:顶栏 🌙/☀️ 切换 + `body.dark` 全套覆盖 + `localStorage('sm-studio-theme')` 持久。
- [x] **嵌入字体并行 + 进度**:`embedFonts` 改 `Promise.all`(family 并行 + 每个 family 的 woff2 并行)+ `fetchTimeout`(15s AbortController)+ 顶部 `setBusy()` 转圈进度条「正在下载并嵌入字体子集…」。
- [x] **修复 CI 红**:`verify-bridge`/`verify-connect` 改为**检测无 tsx 就自重启到 tsx**(`SM_TSX` 哨兵 + `node_modules/tsx/dist/cli.mjs` re-exec + 把 `.ts` import 改 dynamic),`node scripts/verify-*.mjs` 全绿。**全套 12/12 通过**。验证扩到 `scripts/verify-resilience.mjs` 23/23(含拖拽/方向键/暗色)。

## 排期做(高回报·高成本)
- [ ] harvest / 单一数据真相重构:HTML 模式 `htmlSlides[]` 与 iframe DOM 两份真相靠 `harvestAll()` 全量序列化缝合(12 处调用、无脏标记、无防抖)。改为脏页集 + 防抖。
- [ ] `main.ts`(~1700 行)拆模块:state / render / fx / ai / fonts / io。
- [ ] 选择粒度:支持"向上选一层"(选中文字→选其容器卡片),改布局类元素更顺手。
- [ ] AI 端可见性:发出后"Claude 看到没/在改没"跨端是黑盒,现靠用户"说一声"。探索状态回传。

## 排版（typography）
- [x] **`text-wrap: balance/pretty`(✅ 2026-06-26)**:标题/引用 balance(不掉孤字)、正文/要点 pretty(末行不留单字)。两处:Studio `TYPO_CSS` 注入(覆盖所有导入 deck + 导出)+ `runtime/core.css`(渲染 deck)。原生 CSS、零依赖、旧浏览器静默降级。verify-studio-tabs 24/24。
- 评估过 `@chenglou/pretext`(文本测量/排版库,真货)→ **暂不接入**:本项目 HTML-first,浏览器已免费精确排版;它的"无浏览器测量"卖点当前只能在浏览器跑(server-side "soon"),与现有视觉自检重叠,且 v0.0.8 太早。**回头看的触发点**:它出 server-side(可做"AI 改写前免 Chromium 查溢出")或本项目改用 Canvas/SVG 文字渲染。

## 顺手做(低成本·锦上添花)
- [ ] emoji 按钮(💾🔍🚀☰🖼)→ 统一线性图标(Tabler/Lucide 内联 SVG)。
- [ ] `window as unknown as {...}` 满屏 hook → 集中成一个 `SMWindow` 接口。
- [ ] aria/role/alt 基础可访问性(现 0 处)。

## 暂缓
- [ ] `FX_JS`/`BRIDGE` 内联 JS 字符串 → 独立文件 + 构建时内联(像 runtime)。
- [ ] i18n(现全中文硬编码)。
- [ ] (旧搁置:演讲者/讲稿同步深做、Open-Design 画布、对齐 AI 生成侧——见 active.md。)

## 工程纪律(每步都遵守)
- 改 `packages/studio/src/main.ts` 等 → `node scripts/build-studio.mjs` 重建 `studio/slidesmith-studio.html`(bridge 每请求重读,刷新浏览器即见)。
- 每个特性配 playwright 验证脚本(headless,file://),回归跑 `scripts/verify-*.mjs`。
- 非技术用户,靠 demo/截图验收,不读代码。
