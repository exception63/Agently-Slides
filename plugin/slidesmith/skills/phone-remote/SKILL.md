---
name: phone-remote
description: |
  用手机（iPhone / Android）遥控正在放映的 HTML slides 翻页 —— 手机上是 ◀ ▶ 两个大按钮 + 首页/末页/黑屏/放映态。
  两种用法：① 【推荐】在 Slidesmith Studio 勾「嵌入手机遥控」导出 deck → 那份 HTML 拿到任何电脑打开→点「📱 手机遥控」→手机扫码配对→遥控（自带云中转，无需装任何东西）；② 让 Claude 起本机 relay，给「局域网/离线」模式或不走 Studio 的 deck 用。
  连接方式演讲者可选：☁️云端（任何网络·会场隔离 Wi-Fi 也行·需联网）/ 📶局域网直连（同 Wi-Fi 或手机热点·WebRTC P2P·更快更私密·可离线）。
  当用户说 "手机遥控 / iPhone 遥控 / 用手机翻页 / 手机当遥控器 / 遥控翻页 / 放映遥控 / phone remote / 拿手机控制 PPT" 时启用。
  只负责「手机翻页遥控」；要副屏演讲者视图 + 讲稿同步是 slides-presenter-mode skill。
metadata:
  version: 0.2.0
  status: dogfood-validated
  part_of: slidesmith
  cloud_relay: https://slidesmith-remote.zly-scu.workers.dev
  dogfood_case: virtual-journeys.html · 2026-07-09 · Playwright 全链路（本机 relay + 云端 Cloudflare 全通；Studio 嵌入开关导出含客户端；WebRTC 代码就绪·P2P 直连待真机确认）
---

# phone-remote v0.2.0

> 把手机变成 HTML slides 的翻页遥控器。**deck 不用改一行**，任意 Slidesmith 皮通用。
>
> **核心物理规则**：一个网页不能当"服务器/接收器"，所以手机 ↔ 放映端之间**必须有个"中转站"转达指令**。中转站有三档，客户端自动/让用户选：
> 1. **局域网直连（WebRTC P2P）** — 同 Wi-Fi/热点时点对点，最快、最私密、握手后断网也不影响。
> 2. **云中转（Cloudflare）** — 隔离 Wi-Fi / 不同网也行，只要两边能上网。已部署，永久兜底。
> 3. **本机 relay（纯离线）** — 完全没网时，在放映的电脑上跑 `relay.mjs`。
>
> 翻页原理：客户端把命令合成 `ArrowRight/ArrowLeft/Home/End/p` 键盘事件派发到 `document.body`，deck 本就监听 keydown → 翻页。

---

## 两种用法

### ① 【推荐】Studio 里勾选嵌入（面向用户，一次做好永久可用）
1. 在 **Slidesmith Studio** 打开/导入 deck。
2. 顶栏勾选 **「嵌入手机遥控」**（在「嵌入字体」旁）。
3. 点 **「另存为」/「导出」** → 导出的 HTML 就焊好了「📱 手机遥控」按钮 + 配对客户端 + 云中转地址。
4. 这份 HTML 拿到**任何电脑**打开 → 点左下角「📱 手机遥控」→ 选连接方式 → 出二维码 → 手机扫码 → 遥控。
   - 进全屏需在电脑上点一次 deck 自己的全屏（浏览器手势限制）；之后翻页交给手机。

Claude 要做的：确认 deck 在 Studio 里；提示用户勾选并导出；解释"任何电脑打开即用"。源码在 `baked/{pair-client.js, vendor-qrcode.js}`，构建时经 `@slidesmith/phone-remote` 虚拟模块烘进 Studio（改了要 `node scripts/build-studio.mjs` 重建）。

### ② 本机 relay（给「局域网/离线」模式 · 或不走 Studio 的现成 deck）
「局域网/离线」连接方式需要放映的电脑上有个本机中转在跑：

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/phone-remote/relay/relay.mjs" --port 8787
```

（后台跑，`run_in_background`，别 nohup。）它绑 `0.0.0.0`、提供手机遥控页 `/r/<room>`、`/whoami`(报本机 LAN IP 给客户端生成手机地址)、WS 转发 + 信令。手机与电脑同 Wi-Fi 或**电脑连 iPhone 个人热点**即可（绕开会场设备隔离）。

不想走 Studio、只想把一个现成 deck 文件临时 LAN 遥控一下：也可用更早的自包含版 `server.mjs`（SSE + 房间码，见文件内注释），`node server.mjs --deck <deck.html> --open`。

---


## 中转怎么选：workers.dev vs 自己的域名

两份实现，**协议完全一样**，换地址即可切换：

| | `relay/cloudflare/`（Worker） | `relay/selfhost/`（smrelay.py） |
|---|---|---|
| 地址 | `https://<name>.workers.dev` | 你自己的域名，现为 `https://live.zhouliying.com` |
| 部署 | `npx wrangler deploy` | `sudo bash install.sh`（零依赖 Python + systemd + Caddy） |
| 适合 | 自己测、海外场合 | **国内现场，给学生扫码** |

⚠️ **给学生扫的码不要用 `*.workers.dev`。** 2026-08-28 实测：讲台电脑打得开（多半因为挂了代理），
学生手机用流量却加载不出来——这是域名级的问题，换成自有域名即正常。
自托管版还多了：问题落盘（重启不丢）、`/var/lib/smrelay` 可直接查、日志在 journalctl。

细节见 `relay/selfhost/README.md`。

## 云中转（已部署 · 归用户 Cloudflare）
- URL：`https://slidesmith-remote.zly-scu.workers.dev`（Durable Object 每 room 一实例 + WebSocket Hibernation，免费额度）。
- 源码：`relay/cloudflare/{worker.mjs, wrangler.toml, remote.html}`；重部署：`cd` 进该目录 → `npx wrangler deploy`。
- 改了手机页 `relay/remote.html` 要**同步复制**到 `relay/cloudflare/remote.html` 再 deploy。
- 详见自动记忆 `phone-remote-cloud-relay`。

## 设计与边界（必读）
- **WebRTC 直连（Phase 2）**：配对后客户端自动尝试建 P2P 数据通道（走云/本机 relay 做信令）；成功则指令走直连（手机端状态显示「直连」），失败自动回落中转（显示「云端」）。**fail-safe**：P2P 不通绝不影响遥控。真机同 Wi-Fi 才好确认 P2P（headless 沙盒因 mDNS/STUN 不可测）。
- **全屏**必须在电脑上真实点击触发（浏览器手势限制）；手机「放映态」按钮可切 deck 放映态但进全屏靠电脑。
- **黑屏 B**：客户端自建全屏黑色覆盖层，手机「黑屏」按钮切换。
- **deck 通用性**：只依赖「deck 监听 keydown、按方向键翻页」。合成事件派发到 `document.body`（不是 `document` —— deck 的 `e.target.matches()` 守卫在 document 上会抛错，这是开发时踩到修掉的坑）。
- **安全**：room id 是随机长串（配对密钥）；relay 不存内容、不认身份，只按 room 转发。命令仅「翻页」，slides 内容不经中转。
- **幂等**：Studio 注入用 `<!--sm-phone-remote-start/end-->` 标记，每次导出先剥离旧的再按需注入，防 re-import 重复。

## 相关
- 出片：`editorial-slides`；配讲稿：`transcripts_html`；副屏演讲者视图 + 讲稿同步：`slides-presenter-mode`。
- 细节 / 排障：`references/how-it-works.md`。
