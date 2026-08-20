# 下个会话交接 · 迭代：用 Claude Code 的 design 功能重做 Studio 的 UI

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。
> 上一迭代（2026-08-21）把「AI 一键加提词」和「讲稿批注 → AI 改写」两件都做完并实测了。

---

## 一、上一迭代做完的（都已 commit + 实测，别重做）

### 任务 A · 一键加提词（commit `e710d02`）

**关键结论**：这不是加一句 prompt 就完事。`slidesmith_apply_patch` 只按 `data-id` 替换
`#deck` 里的 `<section>`，而提词表 `window.__SM_CUES__` 落在 `#deck` 之外的 prelude/trailing——
**补丁根本够不着它**。所以先补了一条通道：

| 层 | 加了什么 |
|---|---|
| Studio | WS 两条消息 `cues-request` / `set-cues`；写默认 **merge**（只填空页，不覆盖用户手调过的），`replace:true` 才覆盖 |
| 提词面板 | 全 deck 账（几页有 / 缺几页 / 几页不合规）· 「撤销 Claude 这次写入」· 「跳到下一个待处理」 |
| 规则 | 收进 `cueIssues()` **一处**：面板体检、全 deck 汇总、回给 Claude 的报告三处共用 |
| 桥 | `GET/POST /api/cues` + `BridgeFacade` 两种实现（本地 / 客户端模式） |
| MCP | `slidesmith_cues({set?, replace?})`，硬约束写在工具说明里，写完只报 `missing`/`violations` |
| app | 预设加「一键加提词」；预设**同时收进输入框旁的菜单**（原来只长在空状态，发过一句话就点不到了） |

### 任务 B · 讲稿批注 → AI 改写（commit `34119c5`）

- **入口**：AI 面板「讲稿 → 打开讲稿」→ 全屏 modal，iframe 装整份讲稿（保留它自己的 CSS），
  打开即滚到当前页那一段
- **划一段 → 浮出「加批注」**（按钮注入在 iframe 里面，避免跨窗口坐标换算）
- 批注**挂锚点**；批注过的段落重开后带「批注」角标
- 批注汇总进现有「AI 待办」，同一个「一键发送」交出去，**请求里带该块原文**
- 回写走新工具 `slidesmith_notes`（同理：`__TXB64__` 也在 `#deck` 之外）
- ⭐ **Studio 验锚点**：改写后丢了 / 重复 / 不在顶层 / 不是第一个元素 → **整块拒收**并报原因
- modal 顶栏「撤销 Claude 的改写」

---

## 二、本迭代要做的：用 design 功能重做 Studio 的 UI 和交互

用户 2026-08-20 定的顺序是「A、B 之后再做这个」，现在轮到它了。

**动手前先问用户**：重做的边界在哪——只是右栏面板的视觉，还是整个三栏布局和交互流程？
（Studio 现在是：左栏 页面/换装/插入 · 中间预览 · 右栏 格式/设计/动画/AI 修改/提词。
右栏五个 tab 已经很挤，讲稿批注只好塞进「AI 修改」里，这本身就是布局到顶的信号。）

⚠️ 改 UI 会碰 `packages/studio/src/main.ts` 里那一大坨 CSS 和 markup 字符串。
改完必须 `node scripts/build-studio.mjs` 重建 `studio/slidesmith-studio.html`。

---

## 三、Studio ↔ Claude 的三条写入通道（记住这张表，别再走弯路）

| 写什么 | 在 deck 的哪里 | 用哪个工具 |
|---|---|---|
| 幻灯片正文 | `#deck > section[data-id]` | `slidesmith_apply_patch` |
| 手表提词 | `#deck` **之外** 的 `window.__SM_CUES__` | `slidesmith_cues` |
| 内嵌讲稿 | `#deck` **之外** 的 `window.__TXB64__`（base64） | `slidesmith_notes` |

读之前一律先 `slidesmith_outline`（`data-id` 是 Studio 导入时才生成的，磁盘文件里通常没有）。

---

## 四、实测得出的硬数据（写代码前看这个，别重新量）

- **Apple Watch Ultra 3 = 211 × 257 点**；Series 11 46mm = 208 × 248 点 —— 一套规则通用
- 19pt 半粗下：一条提词超过约 **10 个汉字**就折行；50 字直接铺满整屏
- 表盘放得下 **5 行**短提词
- 一份 45 页真讲稿里 27 页（60%）标了 `<strong>`，但**约三分之一不合规**
  （太长，或是「第一部分」这类结构标签）→ 所以有「不许直接倒进提词表」这条红线

---

## 五、协议速查（别去猜）

| 方向 | 消息 | 载荷 |
|---|---|---|
| deck → remote | `deck-info` | `{txb64, title, state, cues}` |
| deck → remote | `state` | `{slideIdx(0基), total, anchor, title, prevTitle, nextTitle}` |
| 中转 → **旧 deck** | `evicted` | 遥控端收不到 |
| remote → deck | `cmd` / `need-info` / `jump` | |
| 桥 → Studio | `cues-request` / `set-cues` / `notes-request` / `set-notes` | 见上表 |
| Studio → 桥 | `cues` / `notes` | 带 `issues` / `rejected`，规则只在 Studio 那一处算 |

`slideIdx` **0 基**，显示时才 +1。提词和讲稿都按 `anchor` 索引，不按页码。

⚠️ 改了 `pair-client.js` → **deck 必须重新导出**才享受得到新字段。

---

## 六、怎么测（照做，省一小时）

**Studio 侧**（提词 / 讲稿这两条通道）：
```bash
npx tsx packages/cli/src/index.ts serve --no-open -p 8790 <deck.html>
```
- 用 Playwright 开 `http://127.0.0.1:8790/`，等它连上（`/api/status` 的 `connected:1`）
- `curl /api/cues`、`curl -XPOST /api/cues -d '{"cues":{...}}'`；讲稿同理 `/api/notes`
- MCP 客户端模式也要验一遍：`npx tsx packages/cli/src/index.ts mcp -p 8790` 喂 JSON-RPC
  （**JSON 里有换行就别用 printf 拼**，用 python 生成 jsonl，否则那一行 RPC 会被截断成静默失败）
- 没有现成的 watch-mode / 一体版 deck 做夹具，用脚本往 `dogfood-slidesmith-intro/slides.html`
  尾部注入 `window.__SM_CUES__ = {}` 和 `window.__TXB64__ = "…"` 现造一份（`</body>` 有两处，
  取 `rindex`）
- Studio 页面重新导航会弹 beforeunload，Playwright 要 `browser_handle_dialog` 接一下

**手机遥控侧**：
```bash
cd plugin/slidesmith/skills/phone-remote/relay && node relay.mjs --port 8799
```
- 端口用 **8799**（8787 被 WebXR-Lab 占着）
- 模拟器里塞配对信息（没相机扫不了码）：
  ```bash
  xcrun simctl spawn <udid> defaults write com.zlyscu.slidesmithremote sm.room testroom01
  xcrun simctl spawn <udid> defaults write com.zlyscu.slidesmithremote sm.relay "http://127.0.0.1:8799"
  ```
  手表那份 bundle id 加后缀 `.watchkitapp`。ATS 不拦 `ws://127.0.0.1`。
- **Ultra 3 模拟器连不上中转**（试过多次），用 **Series 11 46mm**
  （`F9E3C0EB-781E-40B3-9DFE-84859C78F881`）测，它一直稳定
- 假讲稿要自带 `fuquan-scroll` 监听，否则副屏不滚——不是 bug，真讲稿自带监听

装 Mac app：`./scripts/install-studio-app.sh`（改了 Swift 源就重跑）。
装真机：`DEVELOPMENT_TEAM=C5BH6BHB9Q -allowProvisioningUpdates`，
iPhone UDID `A32A899E-AF60-588B-A3EB-B3E738E31CEF`。

---

## 七、这台机器的两个坑（已记进长期记忆 `mac-dev-env-quirks`）

1. **模拟器 MCP 截图必崩** —— macOS 27 beta 的 CoreImage/Metal bug。
   **绕过：MCP 负责 `tap`/`swipe`，`xcrun simctl io <udid> screenshot` 负责看。**
2. **iPhone 无线调试断了，但手表是好的** → 不是网络问题，是 iPhone 不在 Wi-Fi 上广播
   `_remotepairing._tcp`。排查 `dns-sd -B _remotepairing._tcp local.`，出现在 **if 14** 就是通了。
   **待用户试**：重启 iPhone → 关开开发者模式 → 还原位置与隐私（三级升级）。

---

## 八、⚠️ 未决 / 别自作主张

- **房间号撞车**：房间号烘在文件里，AI 直接改 HTML 派生新版本会继承它。用户明确说了 **不用改**。
- **中转成本**：每个房间名一个独立 DO，worker 里零 storage → 房间号再多也不额外收费。已答复过。
- **三文件联动版**：讲稿在隔壁文件，Studio 读不到 → **讲稿批注对它不可用**（modal 会明说
  「一体版才有」）。Studio 里点「演讲者」也开不出来（它开的是相对路径 `演讲者模式.html`）。
  **一体版才是首选交付形态**，这条一直没修。
- **导出 PPTX**：方案早已定稿（headless 截图 + python-pptx），动手前先问用户「图片版可接受吗」。
- **`~/.zshrc` 明文存着邮箱 SMTP 密码和 Gamma API key**，已提示用户，未处理。
- **协作环**：`slidesmith_get_requests` 返回的请求是用户主动提交的，**照做**，别判 stale 拒绝。
