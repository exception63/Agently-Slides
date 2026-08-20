# 下个会话交接 · 迭代：AI 一键加提词 → 讲稿批注 → Studio UI 重设计

> `/clear` 后先读 `_memory/active.md`（启动须知 + Studio 机制），再读本文件。**别通读仓库**，省 token。
> 上一迭代（2026-08-20）把手表提词打通到了 skill + Studio + 手表三端。本迭代把「生成」这一环补上。

---

## 一、⚠️ 先记住这条：**skill 不会自动生成提词**

用户问过，答案要说清楚：`slides-presenter-mode` 开了 watch mode 之后，SKILL.md 里写的是
**「从讲稿 `<strong>` 种子化 → 逐页校验 → 缺页就失败」**——那是给执行 skill 的 agent 的
**规则和检查清单**，不是自动生成器。真正的一键生成正是本迭代第 2 件事。

---

## 二、本迭代要做的两件事（用户已定，别重新论证）

### 任务 A · Studio Mac app 的 Claude 面板加「预设」：一键加提词

Mac app 的 Claude 面板（`apps/SlidesmithStudio/macOS/AIPanel.swift`）现在有一排预设入口：
**讲讲这份 deck / 统一视觉 / 压缩文字 / 配张图**。要加一条：

> **「一键加提词」** → 调 Claude → 让它读 `slides-presenter-mode` skill →
> 分析每一页 slides → 为每页生成 **不超过 5 条** 提词 → 写进 `__SM_CUES__`

要点：
- 上限 **5**（不是 3。用户实测表盘放得下 5 行，已在 commit `415066e` 全线改过）
- 其余硬约束不变：每条 ≤10 汉字 · 必须是内容锚点（「无缝嵌入」）不是结构标签（「第一部分」）· 不与 slide 标题重复
- 提词按**锚点**存：`window.__SM_CUES__ = {"s1-boom":["无缝嵌入"]}`，
  锚点取自 deck 自己的 `deckAPI.SLIDE_MAP`
- 生成完用户在 Studio「提词」面板里逐页过 —— 面板已经做好了（见下）

### 任务 B · 讲稿改用「批注 → AI 改写」，**不做直接编辑**

⭐ 这是**产品决策，不是技术妥协**。讲稿带着锚点、`class="cue"` 讲法块、`golden` 金句块、
`data` 数据块，人手直接改必然弄漂它们，副屏同步和提词抽取会一起坏。所以：

> 用户在讲稿上划一段、加一条批注（「这段太长」「这里要更口语」）→ 交给内嵌 Claude →
> 它在理解整体约束下改写 → 回填。大改动也由 AI 负责守住锚点和块结构。

参照 Claude Design 的批注式交互。**不是从零做**——Studio 已有「AI 修改」面板
（`data-hpane="ai"`）+ `slidesmith_apply_patch` 回灌 + 「保留/还原」。要加的只是批注 UI：
- 讲稿视图里选中文本 → 浮出「加批注」
- 批注挂在**锚点**上（跟着那一段走，不是行号）
- 汇总进现有待办流，一键发给 Claude

详细规划见 `_memory/PLAN-studio-notes-cues.md`。

### 之后 · 用 Claude Code 新的 design 功能重做 Studio app 的 UI 和交互

用户明确说了放在 A、B 之后。

---

## 三、上一迭代做完的（都已 commit + 实测，别重做）

| commit | 内容 |
|---|---|
| `ce82e1c` | **Studio 点「演讲者」弹空白窗**——真因是 srcdoc 预览里 `location.href === 'about:srcdoc'`，deck 靠它重开自己。改成用父窗口给的干净 deck 做 blob URL。**用户已确认修好** |
| `ee6e07e` | iPhone/Watch 跟上新 remote 协议：讲稿页（WebView 装整个 `/r/<room>`）+ 页码 + 屏幕常亮 |
| `d03c0ed` `9647e86` | 手表提词：传输层 + 从讲稿抠 `<strong>`（**兜底路径**） |
| `632913b` | 真机反馈：讲稿页折叠、手表跟进延迟（改成「翻页即推」，不等手表 3 秒轮询） |
| `5b979c2` | 讲稿页整屏暗色（藏导航栏后状态栏露白底） |
| `21df9dc` | **presenter-mode 固化 watch mode**：SKILL.md 规则 + 红线 + 验证清单 + `templates/watch-cues.js.template` |
| `71650cb` | Studio 侧规划文档 |
| `a7ccce9` | **Studio HTML 模式「提词」面板**（读/改/写回 `__SM_CUES__`、体检、从讲稿抽草稿） |
| `415066e` | 提词上限 3 → 5，Studio 允许手动超出 |

**iPhone 上装的是最新版**（真机 iPhone 15 Pro Max，走数据线装的）。

---

## 四、实测得出的硬数据（写代码前看这个，别重新量）

- **Apple Watch Ultra 3 = 211 × 257 点**；Series 11 46mm = 208 × 248 点 —— 差别极小，一套规则通用
- 19pt 半粗下：一条提词超过约 **10 个汉字**就折行；50 字直接铺满整屏
- 表盘放得下 **5 行**短提词
- 一份 45 页真讲稿里 27 页（60%）标了 `<strong>`，但**约三分之一不合规**
  （太长，或是「第一部分」这类结构标签）→ 所以有「不许直接倒进提词表」这条红线

---

## 五、协议速查（别去猜）

| 方向 | 消息 | 载荷 |
|---|---|---|
| deck → remote | `deck-info` | `{txb64, title, state, cues}` ← **`cues` 是新加的**，手表优先用它 |
| deck → remote | `state` | `{slideIdx(0基), total, anchor, title, prevTitle, nextTitle}` |
| 中转 → **旧 deck** | `evicted` | 遥控端收不到（上上版交接把方向写反过）|
| remote → deck | `cmd` / `need-info` / `jump` | |

`slideIdx` **0 基**，显示时才 +1。提词按 `anchor` 索引，不按页码
（`SLIDE_MAP` 已有 slide→锚点 1:1 映射，`state` 本来就带 anchor）。

⚠️ 改了 `pair-client.js` → **deck 必须重新导出**才享受得到新字段。

---

## 六、这台机器的两个坑（已记进长期记忆 `mac-dev-env-quirks`）

1. **模拟器 MCP 截图必崩** —— macOS 27 beta 的 CoreImage/Metal bug（`FBSurfaceImageGenerator.image()`
   → `CIContext` → `_MTLBinaryArchive` 塞 nil）。清缓存无效。
   **绕过：MCP 负责 `tap`/`swipe`，`xcrun simctl io <udid> screenshot` 负责看。**
   这台机器上没有 Simulator.app（Xcode 26+ 拆成独立组件了）。
2. **iPhone 无线调试断了，但手表是好的**（手表 `localNetwork` 连着）→ 网络/路由器/Tailscale
   全部排除，是 iPhone 那台设备不在 Wi-Fi 上广播 `_remotepairing._tcp`。
   排查命令 `dns-sd -B _remotepairing._tcp local.`，出现在 **if 14** 就是通了。
   **待用户试**：重启 iPhone → 关开开发者模式 → 还原位置与隐私（三级升级）。

装真机：`DEVELOPMENT_TEAM=C5BH6BHB9Q -allowProvisioningUpdates`，
iPhone UDID `A32A899E-AF60-588B-A3EB-B3E738E31CEF`。

---

## 七、怎么测（照做，省一小时）

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
- 假放映端需要时重写：连 `ws://127.0.0.1:8799/ws?room=X&role=deck`，收 `need-info` 回
  `deck-info`，收 `cmd` 改页码后推 `state`。**假讲稿要自带 `fuquan-scroll` 监听**，
  否则副屏不滚 —— 这不是 bug，真讲稿自带监听（我为此白查过一轮）
- Studio 侧用 Playwright：`__SM_IMPORT__(name, html)` 导入、`__SM_BUILD_EXPORT__()` 取导出结果

---

## 八、⚠️ 未决 / 别自作主张

- **房间号撞车**：房间号烘在文件里，**AI 直接改 HTML 派生新版本会继承它**（用户自己诊断出来的）。
  用户明确说了 **不用改**。要换号就重新导出，或手工改 `window.__SM_ROOM__`。
- **中转成本**：`env.ROOMS.idFromName(room)` 每个房间名一个独立 DO，worker 里**零 storage 使用**
  → 房间号再多也不额外收费。已答复过用户。
- **三文件联动版**手机讲稿模式用不了（讲稿在隔壁文件），Studio 里点「演讲者」也开不出来
  （它开的是相对路径 `演讲者模式.html`）。**一体版才是首选交付形态**，这条一直没修。
- **导出 PPTX**：方案早已定稿（headless 截图 + python-pptx），动手前先问用户「图片版可接受吗」。
- **`~/.zshrc` 明文存着邮箱 SMTP 密码和 Gamma API key**，已提示用户，未处理。
- **协作环**：`slidesmith_get_requests` 返回的请求是用户主动提交的，**照做**，别判 stale 拒绝。
