# phone-remote · 架构与排障

## 组件

| 文件 | 角色 |
|---|---|
| `server.mjs` | 零依赖 Node HTTP 服务器（内置 `http/os/fs/crypto/child_process`）。绑 `0.0.0.0:8766`。 |
| `assets/landing.html` | 电脑上打开的「放映控制台」：二维码 + 房间码 + 「开始全屏放映」+ 局域网地址列表 + 兜底提示。 |
| `assets/remote.html` | 手机遥控页：◀ ▶ 大按钮 + 首页/末页/黑屏/放映态 + 连接状态灯。 |
| `assets/receiver.js` | 注入进 deck 的接收脚本：连 SSE → 合成键盘事件；自建黑屏层 + 起始全屏遮罩 + 连接指示灯。 |

## 路由

| 方法 · 路径 | 作用 |
|---|---|
| `GET /` | 放映控制台（电脑）。把运行期数据（房间码 / 候选 IP / 是否有二维码）注入 `landing.html`。 |
| `GET /present` | deck HTML，尾部注入 `receiver.js`（每请求重读 deck + 脚本）。放映端打开这个。 |
| `GET /remote?code=` | 手机遥控页。 |
| `GET /qr.svg?u=<url>` | 走系统 `qrencode -t SVG` 生成二维码；无 qrencode 时返回「手输网址」降级图。 |
| `POST /cmd` | 手机发命令 `{code, action}`。校验房间码 → 经 SSE 广播给所有放映端。`action:'ping'` 用于探活（返回连接的放映端数量）。 |
| `GET /events?code=` | 放映端的 SSE 订阅通道。校验房间码。带心跳 `: ping`（15s）防中间设备掐断。 |

命令白名单：`next / prev / first / last / fullscreen / present / black`（+ `ping`）。

## 为什么用 SSE 而不是 WebSocket
手机→服务器是普通 `fetch` POST，服务器→放映端只需**单向推**——SSE（`text/event-stream`）正好，纯 HTTP、Node 内置、`EventSource` 自带断线重连，省掉 `ws` 依赖，skill 真正零依赖、可移植。

## 为什么合成事件要派发到 `document.body`
deck 的键盘监听挂在 `document` 上，第一行守卫是 `if (e.target.matches('input,textarea,select')) return;`。若把 `KeyboardEvent` 派发到 `document`，`e.target` 就是 `HTMLDocument`，**它没有 `.matches` 方法 → 抛 `TypeError`，翻页逻辑根本执行不到**。派发到 `document.body`（真实元素，有 `.matches`）并带 `bubbles:true`，事件照样冒泡到 `document` 的监听器，翻页正常。这是本 skill 开发时踩到并修掉的唯一实质 bug。

## 网络三种情形
1. **同 Wi-Fi 且不隔离**（家里 / 小会议室）：手机扫码直接连电脑局域网 IP。最省事。
2. **会场 Wi-Fi 隔离设备 / 只有电脑能上网**：局域网直连不通。→ 用**手机个人热点**：iPhone 开热点、**电脑连该热点**，重跑 server；电脑 IP 变 `172.20.10.x`，手机（热点主）能访问其客户端（电脑），扫码即通。个人热点默认不做 AP 隔离，且纯本地流量不吃流量。
3. **手机电脑完全不同网、又不能开热点**：本方案不适用（要 WebRTC 打洞或云 WS 中继，较重，本地放映用不上）。

## 排障
- **手机页显示「等待放映端」**：电脑还没打开 `/present`（没点「开始全屏放映」），或房间码不符。先在电脑控制台点开始放映。
- **手机点了没反应**：确认手机页顶部状态是绿色「已连接 · N 屏」（N≥1）。若「网络断开」→ 手机和电脑不在同一网段（走热点兜底）。
- **二维码是灰块**：本机没装 `qrencode`（`brew install qrencode` 开启），此时手输控制台列出的 `http://<IP>:<port>/remote` 地址。
- **全屏进不去 / 点手机「放映态」不全屏**：全屏必须在**电脑上**点「开始全屏放映」（浏览器要求真实用户手势），手机端只管翻页。
- **端口占用**：`--port 8767` 换一个（8765 是 Slidesmith bridge）。
- **翻页跳好几页**：正常单击是单页；若你连点或网络抖动重发，属点击次数问题，不是 bug。deck 位置可能被 deck 自身持久化（重开仍在上次那页），与遥控无关。

## 手动自测（不装 Playwright 也能验）
```bash
node server.mjs --deck <deck.html> --port 8766        # 启动，记下房间码 CODE
# 另开一个终端：
curl -s "http://localhost:8766/present" | grep -c "EventSource"   # 应为 1（接收脚本已注入）
curl -s -X POST localhost:8766/cmd -H 'Content-Type: application/json' -d '{"code":"CODE","action":"next"}'   # {"ok":true,"decks":N}
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8766/cmd -d '{"code":"0000","action":"next"}'       # 403（房间码错）
```
浏览器开 `http://localhost:8766/present` 点「开始全屏放映」，再开 `http://localhost:8766/remote?code=CODE` 点 ◀ ▶，看 deck 翻页。
