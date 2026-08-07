# Active Memory: Slidesmith — AI-first HTML Slides System

> Last updated: 2026-06-28 ·〔精简版 · 全部历史在 `_memory/history.md`〕

## ⚡ 启动须知（省 token · 每个新会话先读这块）
- **不要通读整个仓库**。开工只需：① 本文件 ② `_memory/NEXT-SESSION.md`（下阶段任务）③ 要驱动 Studio 时 `AGENTS.md §4b/§4c`（接口契约）。具体某功能细节再去 `_memory/history.md` 里 grep/跳读，别整篇通读。
- **Studio 对话机制不靠"读代码"，靠 MCP 工具 + AGENTS.md**。新会话启动即自动加载 `slidesmith` 插件的 MCP 工具（`slidesmith_open / wait / apply_patch / status / connect`，用户级安装，任意会话可用）。
- 改了 Studio 源（`packages/studio/src/main.ts`）要 `node scripts/build-studio.mjs` 重建 `studio/slidesmith-studio.html`；bridge 每请求重读，刷新浏览器即见。

## 🔌 Studio ↔ Claude 协作机制（一图流）
1. `slidesmith_open(deckPath)` → 浏览器开 Studio + 握手（连上即顶栏「● 已连接 Claude」）。deck = **契约 HTML**（`#deck > .slide[data-id]`）。
2. **实时协作环（正解）= 后台 `curl /api/wait` 自循环脚本**（`run_in_background`，**别 nohup**否则 harness 跟不住）：只在用户真按「发送」时 exit→唤醒我，空闲在后台内部消化 ≈ 零 token。**新会话要重新挂一次**。别用前台 `slidesmith_wait`（卡死对话）。
3. 用户在 Studio 写「AI 待办」（改字 / 配图：矢量·图表·照片 / 导入图）→ 一键发送 → 我收到**单个 `.ai-tasks.md`** → 改写对应 `<section data-id>` → `slidesmith_apply_patch` 回灌。
4. **分工**：人做高频细活（点字/换色/字号/动画/移删元素，即时零 token）；AI 做模糊重活（经待办）。

## ✅ 当前状态（已完成，详见 history.md）
- **【新 2026-07-09·下午】手机遥控「烘进 HTML + 云中转 + 连接方式选择器」——Phase 1 云端已部署+全链路验证**：用户嫌"每次起本机服务/换电脑没法用"麻烦，要把遥控**烘进 deck**，"任何电脑打开→点按钮→配对→遥控"，且**让演讲者自选连接方式**。做法：① **云中转已部署到用户自己的 Cloudflare**（账号 zly.scu@gmail.com·Google 登录·account id 183a7a0ba008e1c828d9e3a5972a8d0c），Worker=`slidesmith-remote`，**URL＝`https://slidesmith-remote.zly-scu.workers.dev`**，源在 `plugin/slidesmith/skills/phone-remote/relay/cloudflare/{worker.mjs,wrangler.toml,remote.html}`，用 **Durable Object（每 room 一实例·SQLite-backed·免费额度）+ WebSocket Hibernation** 做配对转发；重部署＝该目录 `npx wrangler deploy`（已 `wrangler login` 存了 OAuth）。② **烘进 deck 的客户端** `baked/pair-client.js`＋`baked/vendor-qrcode.js`（qrcode-generator·MIT·浏览器端出二维码，因 Worker 无 qrencode）：左下角「📱 手机遥控」按钮→**连接方式选择器**（☁️云端：任何网络/需联网 · 📶局域网离线：同 Wi-Fi/热点·更快更私密·需本机 relay）→出二维码→手机扫→配对→遥控。③ **本机 relay** `relay/relay.mjs`（Node ws，绑 0.0.0.0，加了 `/whoami` 返回 LAN IP 供"局域网"模式生成手机地址）。**关键物理规则**：网页不能当服务器，手机↔deck 必须有中转；三档＝同网 P2P(Phase2 未做)／云中转(已通·隔离 Wi-Fi 也行)／纯离线本机 relay。**全链路验证**：baked deck→选云端→手机开真 `workers.dev/r/<room>`→点翻页→curIdx 1→3 精确（跨公网经 Cloudflare DO 转发）。**✅ Studio 集成已完成**：Studio 顶栏加了「嵌入手机遥控」勾选框（在「嵌入字体」旁，`#embedRemote`），勾选后 `assembleDeck(false)` 导出时把 `<!--sm-phone-remote-start/end-->` 标记块（云URL配置 + vendor-qrcode + pair-client）焊进 HTML；幂等（每次导出先剥离旧标记，防 re-import 重复）；OFF 时不注入。经 `@slidesmith/phone-remote` 虚拟模块烘进 Studio bundle（`build-studio.mjs` + `main.ts`；改 baked 文件要 `node scripts/build-studio.mjs` 重建）。Playwright 验证：导 HTML deck→勾选→另存为→导出含 marker/button/RTCPeerConnection/云URL/QR 库、markerCount=1；OFF 则干净。**✅ Phase2 WebRTC 已完成**：配对后 deck(offerer)/手机(answerer) 自动试建 P2P 数据通道（信令走中转），成功则指令走直连(手机显示「直连」)、失败回落中转(「云端」)，fail-safe（回落已验证 curIdx 1→3）；P2P 真机同 Wi-Fi 才好确认（headless 沙盒 mDNS/STUN 不可测）。云 Worker 已重部署带 WebRTC 手机页。截图 `examples/{studio-toggle,conn-chooser,baked-pairing,console,phone}.png`。**下一步候选**：真机确认 P2P「直连」；Studio 预览里也放个「手机遥控」测试按钮（现在只在导出件里）；或手机端移动演讲者视图。
- **【新 2026-07-09·上午】手机遥控翻页 = 新 plugin skill `slidesmith:phone-remote`（MVP 完成·Playwright 全链路验证）**：用手机当 HTML slides 的翻页遥控器。**做成插件下独立 skill**（用户需要时调用即可，不耦合 bridge/Studio）。链路：`手机 /remote ──POST /cmd(4位一次性房间码)──▶ 零依赖迷你服务器(Node 内置 http，绑 0.0.0.0:8766) ──SSE /events──▶ /present(把 receiver.js 注入进 deck) ──合成 KeyboardEvent(ArrowRight/Left/Home/End)──▶ deck 本就监听 keydown → 翻页`。**deck 零改造、任意 Slidesmith 皮通用**。手机→服务器普通 fetch POST，服务器→放映端 SSE（不用 ws 库，`EventSource` 自带重连）。手机端 UI：◀ 上一页 / › 下一页 两大半屏 + 首页/末页/黑屏/放映态 + 绿色「已连接·N屏」状态灯。电脑「控制台页」`/`：qrencode 生成的二维码 + 房间码 + 「▶ 开始全屏放映」（全屏须电脑真实点击一次，浏览器手势限制）+ 局域网候选地址。**网络**：主路径同 Wi-Fi 扫码；**万能兜底＝iPhone 开个人热点、电脑连它**（绕开会场 Wi-Fi 设备隔离，IP 变 172.20.10.x，纯离线也通）。**唯一踩坑（已修）**：合成 KeyboardEvent 必须派发到 `document.body`（不是 `document`）——deck 守卫 `e.target.matches()` 在 document 上没 .matches 会抛错。文件：`plugin/slidesmith/skills/phone-remote/{SKILL.md, server.mjs, assets/{landing,remote}.html, assets/receiver.js, references/how-it-works.md, examples/{console,phone}.png}`。验证：virtual-journeys deck，first=1/next=2→3/prev=2/last=22 全对，黑屏切换、房间码错→403、二维码真 SVG。**加分项（未做·下一步可选）＝手机端「移动演讲者视图」**（当前页缩略图+下一页+讲稿+计时，复用 slides-presenter-mode + 讲稿基建）。详见自动记忆 [[iphone-slides-remote]]。
- **【新 2026-07-01】暂存盘显示逻辑重做（去每图选页 + 按 slide 分组 + 消除横向滚动）**：旧 `renderTray` 每张图带一个「排到」`<select>`（繁琐）且 `grid 1fr 1fr` + nowrap 子元素撑破 → 右栏横向滚动。新逻辑：图片导入时就绑定**当时选中的页**（`addTrayImage`→`currentSlideId`，本就如此），所以**去掉每图选页下拉**；暂存盘**按所属 slide 分组**（组头「第 N 页 · 标题 · k 张」，可点跳转），每组缩略图 `grid auto-fill minmax(96px,1fr)` 自动换行、绝不横向滚动；顶部提示「导入 / 搜图将加到：第 N 页」跟随左侧选中（`updateTrayTarget` 在 `updateAiTarget` 里调）；放错的用缩略图角上 `⤴` 一键移到当前选中页。用户流程＝**先在左侧点目标页 → 导入/搜图自动归到该页 → 多页配好 → 一键发 AI 排版**。Playwright 验证：选页 1 拖 2 图 + 选页 3 拖 1 图 → 两组正确、无横向溢出（scrollW==clientW）、⤴ 移动生效、target 提示跟随。源 `main.ts`，已重建。
- **【新 2026-06-30】Studio 搜图 → 暂存盘（借鉴 agent-native ImageSearchPanel · 阶段二/两阶段之一）**：「AI 修改」tab 的「导入图片」区加「搜图」按钮 → 弹搜图 modal（关键词 + 图源下拉 + 结果墙）→ **点一张即下载并加入暂存盘（含署名 note），不用手动搜/下/导**。搜索与下载**走 bridge**（同源 `/api/image-search`、`/api/image-fetch`，key 藏服务端不泄漏、绕开 CORS/canvas taint）。**图源**（下拉可选）：① Pexels（主，需一次性免费 key，放 `~/.slidesmith/config.json` `{"pexelsApiKey":"…"}` 或 `PEXELS_API_KEY` env，免费可商用无需署名；用户已填真 key）；② ~~Google 图片~~ **已搁置/UI 隐藏**（Google 把「搜索整个网络」弃用、Custom Search JSON API 将 2027-01 停用 → 新引擎只能搜≤50 指定域名，性价比太低，用户选择跳过）。bridge 仍留 `searchGoogle`+`source=google` 分支休眠（需 `googleApiKey`+`googleSearchCx`），要用把 studio 下拉里的 `<option value="google">` 加回即可；解析对齐 agent-native `image-search.ts`。用户 config 里 googleApiKey 已填但 cx 空 → `hasGoogle=false` 不生效；③ **百度图片**（`source=baidu`，**中文全网最广·免密开箱即用**，用网页版内部 `acjson`：必须先 `fetch('https://image.baidu.com/')` 拿**真 BAIDUID** cookie（`getSetCookie()`），假 cookie 返回 82 字节 0 图；再带 cookie+Referer 调 `search/acjson?tn=resultjson_com&ipn=rj&ct=201326592&word=&pn=&rn=30`；解析 `data[].thumbURL/middleURL/width/height/fromURLHost/fromPageTitleEnc`；JSON 有坏字符→sanitize 重试；缩略图在 `img*.baidu.com` CDN，**下载需带 `Referer:https://image.baidu.com/`**（已在 fetchImageDataUrl 对 `*.baidu.com` host 加）。非官方接口可能变）；④ **维基共享 Wikimedia Commons**（`source=wikimedia`，**中文文化/史地·官方稳定·免密**，`commons.wikimedia.org/w/api.php?generator=search&gsrnamespace=6&prop=imageinfo`，纯中文 query OK，多为 CC/PD 带署名）；⑤ Openverse（免密兜底，CC·commercial,modification 过滤，anon `page_size≤20` 否则 401，缩略图用**源站 CDN** `p.url` 而非 openverse `/thumb/` 代理——代理 anon 5/hr 会 401 变空图）。Pexels 任何错误（无/坏 key·限流·网络）→自动回退 Openverse（`fellBack:true`，UI 显实际 source）；Google 是显式选项，错误直接提示不回退。选中图经 bridge 下载成 dataURL → `addTrayImage(name,dataUrl,credit)` 内联，导出离线一致。Playwright 全验证：搜出 20 图缩略图墙、点击→暂存盘 0→1、署名带上。**bridge.ts 改了新端点，要重启 MCP/bridge（下个 /slidesmith 会话）才生效**。**阶段一（`/editorial-slides` 制作时 AI 自动搜图内联）待做**。图源事实核对：[[（websearch）]] Openverse 免密 100/天·5/时、Pexels 200/时·20k/月无需署名、Unsplash 条款限转存不用。
- **【新 2026-06-30】设计旋钮面板（借鉴 BuilderIO/agent-native 的 Tweaks）**：Studio 右栏 `#htmlpanel` 新增「设计」tab（在 格式 与 动画效果 之间），deck 级全局旋钮：主色/强调2/背景/文字（复用 `setHtmlToken`）+ 标题/正文字体（`setHtmlTokenFont` → `--font-display`/`--font-sans`，google 字体进 `usedFontIds` 一并导出）+ 字号/留白滑块（`applyTweakScale` 按当前皮肤 `:root` 基准 `tweakBaseMap()` 整体缩放 `--t-*` / `--pad-*`，70–130%）+ 复原。**即时生效·零 token·写入 H.overrides → 经 htmlOpenTag 烘焙进导出**。换皮时 `reapplyTweaksForSkin` 按新皮基准保持比例。已知边界：少数皮肤封面巨标题用硬编码 px（如 editorial `.cover__title:168px`、academic `.secdiv__lead:30px`），不随字号旋钮变（提示已写明）；走令牌的（academic `.title`=`--t-h2`、`.eyebrow`、`.body` 等）正常缩放。Playwright 全验证：4 tab 正常、老功能 9/9·6/6·4/4 全在、undo/redo + 复原 OK、导出 `<html style>` 含全部覆盖。源 `packages/studio/src/main.ts`，已 `build-studio.mjs` 重建。
- **【新 2026-06-29】PDF 导出满版修正**：「导出 PDF」改走 **bridge headless 渲染**（`playwright-core` + `preferCSSPageSize:true`）→ 精确 16:9 满版矢量 PDF、一键、自动打开、存在 deck 同目录（无 deck 路径则 `~/.slidesmith/exports/`）。standalone file:// 保留 `window.print()` 兜底。实测 virtual-journeys 22 页全 20×11.25in 满版、矢量文字。详见 [[pdf-export-via-bridge]]。**改了 bridge.ts，新端点要重启 MCP/bridge 进程才生效（下个会话自动生效）**。
- **Studio** 单文件离线编辑器（`studio/slidesmith-studio.html`，源 `packages/studio/src/main.ts`）+ **bridge** MCP（`packages/bridge`）+ **plugin**（已装，`/slidesmith:*` 技能 + MCP）。
- **AI 待办面板**：对整份 deck / 本页改字 / 配图（**矢量 SVG · 图表 · 照片 codex**）/ 导入图 → 统一一键发送；ⓘ 弹出式说明；图片库（`~/.slidesmith/library/`）；视觉自检。
- **AI 图表 v1**（A=Claude 直接画内联 SVG 默认，覆盖柱/折线/饼/雷达/散点；C=matplotlib 预渲染逃生舱给箱线/热力等复杂图；B 内联库搁置）+ **图表数据可导入文件**（CSV/数字/文本→textarea）。
- 握手自动协作环 · 动画库（10 类 + Studio 子窗口选择器 + 快速设置接全库）· 21 套皮 · 嵌入字体 · 撤销重做 · 保存/导出 PDF。
- **真 dogfood**：用户 JBR 论文《Virtual Journeys》→ 22 页 academic 学术 deck（含概念模型 + 5 张真数据图表 + 动画），仓库根 `virtual-journeys.html`，已在 Studio 渲染。

## ✅ 手机遥控·收尾修复（2026-07-09 晚）
- **Studio「另存为」失败修复**：旧「另存为」用 blob 下载（`download()`），在 bridge 的 app 窗口里被静默吞掉（闪一下、Downloads 无文件·用户实测确认）。改成三级兜底（`#expHtml` handler）：① bridge-served（`location.protocol=http`）→ POST `${libBase()}/api/export-html?name=` → bridge 存到 deck 同目录 + **访达高亮**（新增 `revealFile()` = `open -R`，仿 export-pdf）；② `showSaveFilePicker`（原生「保存到…」能选文件夹）；③ 退回 `download()` 并 toast 明确「已下载到下载文件夹」。**bridge.ts 改了（`/api/export-html` + `revealFile`）→ 要重启 bridge/MCP 才生效（下个 /slidesmith 会话）**；Studio 前端（picker 兜底）刷新即生效。Playwright 回归：导出仍产出注入版 HTML、无回归。
- **连接选择器文案改清楚**：`baked/pair-client.js` 里「云端」标「推荐·同网自动升级为直连」、原「局域网/离线」改成「🔌 完全离线（现场没网才用·需本机启动器）」。**关键认知**：本机 relay 几乎用不到——有网时「云端」+ 同 Wi-Fi 会自动 WebRTC 直连，不需要任何本机服务；只有现场彻底没网才用本机 relay。
- **一键启动器**（用户要的"不靠 Claude 启本地服务"）：`~/Desktop/启动本地遥控.command`（双击即 `node relay.mjs --port 8787`，已 chmod +x·实测 /health 200）。用户 node 在 `~/.hermes/node/bin`（不是 .local/bin）——启动器 PATH 已含。移仓库会失效（硬编码路径）。
- 真机验证：用户实测**云端连接成功**（iPhone 扫码翻页通）。P2P「直连」仍待真机确认（云 Worker 已带 WebRTC 手机页）。桌面测试件 `~/Desktop/virtual-journeys-手机遥控.html`（固定二维码版）。
- **【关键 bug 已修】Studio 导出件「二维码生成失败」真因＝`String.replace('</body>', PHONE_REMOTE_JS)` 把注入内容里的 `$`（qr 库 `case '$'`→`$'` 是 replace 的"匹配后文本"特殊记号）解释掉了 → 注入的 qr 库 JS 被腐蚀 → `qrcode` 坏。手搓 desktop 文件用 slice 拼接没这问题，故只在 Studio 导出复现。修法：改「函数替换」`doc.replace('</body>', () => inject+'</body>')`（函数返回值不做 `$` 解释）。教训：拼接大段含 `$` 的代码进 HTML，别用字符串 `.replace`。**已 Playwright 验证 Studio 导出件 qr 正常渲染。**
- **固定二维码（回应用户"为何每次生成"）**：房间号原来每次点击随机 → 二维码每次变。改成：Studio 导出时烘一个固定 `window.__SM_ROOM__`（`smRoomId()` 生成、`__SM_ROOMVAL__` 占位符替换——注意占位符不能叫 `__SM_ROOM__`否则先撞到变量名）；pair-client `roomId()` 优先用 `window.__SM_ROOM__`，没有则首次生成并缓存。→ 同一导出件二维码永久不变、可截图复用。已验证 qrUsesBakedRoom=true。

## ✅ Apple Watch 遥控 App（2026-08-07 · v0.1 已提交 16fc07d）
- **`apps/SlidesmithRemote/`**（xcodegen · `project.yml` → `xcodegen generate`）：watchOS + iOS 双 target。手表以 `role=remote` 接入**现有云中转**，发的就是既有 `{"type":"cmd","action":"next"}` 协议 → **中转和 deck 端一行未改**，纯增量。
- **手势（用户选定"分区"方案）**：下方大区=下一页、上方小区=上一页（零延迟、可盲按）；「下一页」同时 `.handGestureShortcut(.primaryAction)` → **捏合双击**翻页。触觉区分成功/失败。
- **关键限制（查 SDK 实证，别再重新调研）**：watchOS 27 的 `HandGestureShortcut` **只有 `primaryAction` 一个槽位**（`.../WatchOS.sdk/.../SwiftUI.swiftinterface`）；watchOS 27 新增的"单击捏合"被系统占用（Smart Stack 选 widget），第三方拿不到 → **"捏合单击=下页+捏合双击=上页"做不到**。
- **捏合手势的高亮动画 + 震动＝watchOS 系统自带，App 抑制不了**（2026-08-07 用户反馈后查证）：完整签名只有 `handGestureShortcut(_:isEnabled:)`，**没有任何关闭视觉/触觉反馈的参数**，只能整体开/关；Apple 文档亦明说系统会自动高亮按钮轮廓表示"这就是捏合会触发的动作"。→ 用户已知情并**选择保留**。屏幕点击那条路才是零反馈快路径（我方的动画/成功震动已删，只保留失败震动）。
- **未用 `WKExtendedRuntimeSession`**：其类别只有健身/正念/闹钟等，无"演示遥控"适配项，硬套＝滥用 API。改为文档指引用户设「返回时钟→1 小时」。
- **配对**：iPhone 扫二维码拿 room → `WCSession.updateApplicationContext` 同步给表 → 表存 `UserDefaults` 后**直连中转**（不依赖手机在身边）。因 room 已固定烘进导出 HTML，**一份 deck 只配对一次**。
- **验证**：Ultra 3 (49mm)·watchOS 27 模拟器 → 真实 Cloudflare → 浏览器 22 页 deck：下一页 1→2→3、上一页 3→2 全对。**注意模拟器 tap 坐标要用「点」不是截图像素**（Watch @2x，截图 422×514 ⇒ 点 211×257）。**真机装机 + 捏合手势待用户确认**（模拟器没有捏合手势）。
- 环境：Xcode 27.0 beta + watchOS 27 SDK 已装；用户有开发者账号 zly.scu@gmail.com。
- **【真机反馈后的修复三连 · 2026-08-07 · commit 901496a】**
  1. **手表永远「未配对」的根因＝手表 App 没被嵌进 iPhone App**：`project.yml` 的 embed `subpath` 必须是 `$(CONTENTS_FOLDER_PATH)/Watch`，只写 `Watch` 会拷到产物目录旁边 → 系统不认伴侣关系 → WatchConnectivity 报 `Companion app is not installed`。检查方法：`ls SlidesmithRemote.app/Watch/`。另把两个 bundle id 收敛为 `$(SM_APP_ID)` 派生（防 companion 声明漂移），并显式声明 schemes（xcodegen 重生成后不丢）。
  2. **手表没开蜂窝就连不上中转**：原设计让手表自己跑 WebSocket，没蜂窝时只能靠蓝牙代理，长连接不可靠 → 卡「连接中」。改为 **手机优先、直连兜底**：手表 `sendMessage(["cmd":…])` 交给 iPhone，由手机的 WebSocket 发往中转；手机不可达才用手表直连。状态栏显示「经 iPhone」/「直连」，并每 3s ping 手机同步放映端在线状态。**结论：手表不需要蜂窝**。
  3. **一次点击翻多页**：deck 端 `pair-client.js` 每次点「手机遥控」都新建 WebSocket 却不关旧的 → 连接累积 → 一条指令被多条连接各执行一次。修：`startPairing()` 开头 `closePc()` + 关旧 `ws`。（这个 bug 也影响纯手机遥控场景。）
  验证：故意点 3 次配对后，手表点一次＝恰好 1 次方向键＝翻 1 页；上一页也对。
  **用户重装提示：务必先把手机和手表上的旧 App 都删掉**（旧的孤立手表 App 会继续占用伴侣位）。

## ⚠️ 已知坑（必读）
- **【已修 2026-06-29】Studio「加载特别慢 / 看不到 slides / 换肤黑屏」的真因＝外链 Google Fonts 阻塞渲染**。deck/皮肤用 `<link rel=stylesheet href=fonts.googleapis.com/css…>`（render-blocking），墙内没翻墙时拉不到 → 浏览器卡死等渲染。修法：`nonBlockFonts()` 把字体 link 改成 `media=print onload` 非阻塞（预览里）+ 换肤改 `applySkinLive()` 就地换不重建 iframe。Playwright 让字体永久 hang 实测：46 页 deck 159ms 渲染、换肤 9ms、全程不黑。详见自动记忆 [[studio-editorial-skin-black]]。**可选 follow-up**：让导出/保存(forEdit=false)也走 nonBlockFonts，使独立成品离线秒开。
- **editorial-slides deck 的 FX 自动播放 / 合成层**（[[studio-drops-deck-engine]]）是另一回事，只在带 `data-smfx` 的 editorial deck（如 virtual-journeys）上；普通 deck（如 keynote-v3，无 FX）不受影响，真痛点是上面的字体阻塞。
- 提交：UI 精简 `d90d01b` + 图表 v1 `31be79a` + 图表数据 `ce95c6f` 已 push；app化/顶栏 `0536a4f` 已 push。`virtual-journeys.html`/`vr-how-it-works.html` 未跟踪（生成成品/样本）。

## 🎯 下一阶段
**手机遥控 MVP 已完成（2026-07-09，见上 ✅ `slidesmith:phone-remote`）。** 当初 4 个待定项的结论：①网络＝会场常隔离设备 → 已用「iPhone 个人热点兜底」解决；②放映走独立迷你服务器（不耦合 bridge），能给局域网 URL+QR；③本版只做翻页遥控；④防误连＝一次性房间码 + 仅 LAN。第三方 App 路线（Remote Mouse 等）弃用（不贴合、要装伴侣端）。

**下一步候选（跟用户确认再动手）：**
- **A｜手机端「移动演讲者视图」**（phone-remote 的加分项）：在遥控页上加 当前页缩略图 + 下一页预览 + 讲稿 + 计时。复用 `slides-presenter-mode` + 讲稿基建。工作量中。
- **B｜导出 PPT/PPTX**（历史 parked 迭代，见 NEXT-SESSION.md）：方案已定＝每页 headless 截图塞 python-pptx（图片版、不可改字）。动手前确认用户接受图片版。
- **C｜制作段一站式入口**（v2 北极星 [[v2-one-stop-closed-loop]] 的「制作」段）：大纲/想法→一键成片的顺滑入口。

**导出 PPT/PPTX（上迭代用户选「以后再说」，已搁置）。** PDF 满版已做完。
- PPT 调研已定方案：**每页转图（headless 截 1920×1080 PNG → python-pptx 满版塞 16:9 PPTX，复用 PDF 渲染管线）**，像素级保真但 PPT 里不可改字；结构化重建可编辑但跨皮肤/图表大失真、不做。`python-pptx 1.0.2` 已系统装好。动手前跟用户确认「图片版可接受 / 还是要可编辑」。
- 可选 follow-up：让导出/保存（`assembleDeck(false)`）也走 `nonBlockFonts`，独立成品离线秒开 + headless PDF 不被外链字体拖慢。
用户非技术、按里程碑自主推进、用 demo/截图验证（非读代码）。

## 按需再读
`_memory/history.md`（全部历史 ✅ 块）· `_memory/NEXT-SESSION.md` · `_memory/decisions.md` · `AGENTS.md`（agent 接口）· `GUIDE.md`（人类指南）· `docs/DECK-CONTRACT.md` · `docs/RESEARCH-{ai-charts,reveal-impress,html-ppt-borrow}.md`
