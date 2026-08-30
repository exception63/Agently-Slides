# Slidesmith Live —— 现场互动服务（自托管）

`https://live.zhouliying.com`。一个进程同时是三样东西：

| | 路径 | 谁用 | 要密码吗 |
|---|---|---|---|
| **管理台** | `/` · `/api/admin/*` | 只有你 | **要**（复用 MySpace 的 msauth，密码天然同一个） |
| **令牌接口** | `/api/agent/*` | **AI / 脚本**（smlive CLI） | 要 `Authorization: Bearer <令牌>` |
| 学生互动页 | `/q/<房间>` | 学生 | **永远不要** |
| 讲者控制台 | `/r/<房间>` | 你的 iPad | 中转按房间校验遥控密码 |
| 中转 | `/ws` | deck | 同上 |

## 数据模型：课 → 场次 → 条目

```
课/活动（room）    长期    slides 里的房间号烘一次，二维码永不变
  └ 场次（session）  一天    **一个自然日 = 一场**
      └ 条目（item）  一条    一个提问
```

**分场的判据只有一条：自然日。**

同一天里的所有动静都算同一场 —— 中间隔多久都不分：放映端断开、页面刷新、
课前试机和正式开讲隔了一个半小时、上午讲一遍下午再讲一遍，统统记在这一天名下。
跨到第二天才另起一场。

- **开场**＝当天第一个动静（放映端上线，**或**有人提交第一条提问）。
  「有人点开了链接看看」不算 —— deck 和提问页都是公开分享的，不能凭这个凭空开一场。
- **收场**＝当天房间最后一次空掉那一刻。当天再有动静就把它清回 `NULL`，这一场继续。
- 序号按**每个房间**从 1 数，不是全库自增 ID。
- 用的是**本地时区**（`smrelay.service` 里 `TZ=Asia/Shanghai`），不是 UTC。
  跨零点的场次会被切成两场 —— 对上课来说无所谓，真遇到跨夜活动再说。

⚠️ **为什么不是「静默 N 分钟」**：先前按「静默 30 分钟」分，边界太碎。
真实的第一场是这样的：放映端 14:50 上线、14:54 就断了（那只是课前试遥控），
真正的课在 16:29–16:42，21 条提问 —— 按静默分会把同一堂课切成两场，
而按天分，一门课的账目和课表天然对得上。
（更早还有一个错：条目入账是「取这个房间的最后一场」而**完全不判时间**，
于是那 21 条被记进了 14:50 那一场，导出来时间对不上课。现在入账和开场走同一份逻辑。）

存储是一个 SQLite 文件 `/var/lib/smrelay/live.db`。老版本那些 `<room>.json`
首次启动时自动迁进库，不用手工搬。

## 隐私：不存任何设备标识

用户明确要求「完全不存」。所以：
- **不记 IP、不记设备指纹、不记任何能跨场追踪的东西**
- 场次上只记一个数字：**同时在线峰值**（当时连着几台），事后无法定位到任何人
- 「参与设备数」这类指标做不了，也不该做

## 管理台能做什么

看当前在线（哪个房间在讲、几台学生设备）· 场次列表 + 每场全部提问 ·
导出 CSV（带 BOM，Excel 开中文不乱码）和 Markdown · 新建/改名/删除房间 ·
**远程清屏 / 关闭提问**（不用掏 iPad）· 每场的提问数与在线峰值。

**关提问不要求房间在线**（2026-08-30 修）。原来这两颗按钮按「放映端是否在线」禁用，
中转也回「这个房间现在没人连着」—— 结果**最需要关的那一刻恰恰按不动**：
课讲完了、投影关了，可二维码还贴在教室里、还在学生手机相册里，谁扫谁都还能提。
现在没人连着也照样改状态并落盘，下一个学生连上时 `Room._load()` 读回来，照样挡得住。

⚠️ 连带修的一条：房间不在内存里时（服务重启、或被清扫出去），`overview` 原来一律
报「没关 · 墙上 0 条」。可关闭状态是**持久化**的，学生实际仍被挡 ——
**显示和真相不一致比显示错更糟**：讲者会以为二维码还敞着，或者反过来。
现在这两项在房间不在线时从盘上读（`state_on_disk()`）。

**清屏只清大屏，账本一条不少**；「隐藏某条」在账本里只做标记不删 —— 事后复盘要看得到当时撤下过什么。

## 令牌接口：让 AI 直接管

管理台的门是 msauth（浏览器登录）。AI 没有浏览器、也不该拿到你的密码，
所以同一批接口开了第二道门：`/api/agent/<和 admin 一样的后缀>` + `Authorization: Bearer <令牌>`。
**业务逻辑只有一份**（`admin_api()`），门不同而已，不会分叉。

- 令牌：`/etc/smrelay/token`（root:smrelay 0640）。`install.sh` **首次装时随机生成，之后不覆盖**。
  改了不用重启服务 —— 按 mtime 自动重读。要换：删掉这个文件再跑一次 `install.sh`。
- Mac 上：`node <slidesmith>/skills/live/scripts/smlive.mjs setup --token <令牌>`
  → 写进 `~/.slidesmith/live.json`（0600）。
- ⚠️ Caddy 里 `/api/agent/*` **必须绕开 forward_auth**（片段里已经有了）。
  也**别写成 `/api/*`** —— 那会把管理台自己的 `/api/admin/*` 一起放行，等于拆掉密码门。
- 审计：每次令牌调用都写 journal（`journalctl -u smrelay | grep agent`），令牌能删房间，得留痕。

认证边界（改中转或 Caddy 后务必复验这几条）：

```
/  和 /api/admin/*        → 303 跳登录
/api/agent/*              → 401（没带令牌）   ← 是 401 不是 303，才说明绕开了 forward_auth
/q/*  /r/*  /ws  /health  → 200 畅通
```

## 时间单位与时区（都踩过）

- 条目在库里存**毫秒**（墙上那份 `questions` 用 JS 的 `Date.now()`，入库原样带进来），
  场次的 `started/ended` 是**秒**。接口曾经原样吐毫秒 → 管理台和导出把日期显示成**公元 58626 年**。
  现在 HTTP 接口对外统一成秒（`secs()`），库里不动、老数据照样对。
  **WebSocket 那侧仍是毫秒**（大屏 `new Date(q.ts)` 靠它），别顺手一起改。
- 机器跑在 UTC。`smrelay.service` 里设了 `TZ=Asia/Shanghai`，否则现场 17:45 的提问导出成 09:45。

## 备份

`smrelay-backup.timer` 每天 03:30 用 SQLite 的 backup API 快照一份到
`/srv/myspace/files/_slidesmith-live/`，你 Mac 上现有的 `myspace sync pull`
（每天 12:30 那个 launchd 任务）顺手带回本地。**不另起一套备份体系** —— 多一套就多一处会悄悄坏掉的地方。

---

# 底层：中转协议

和 `relay/cloudflare/worker.mjs` **同一套协议**。deck / 遥控端 / 提问页三边代码一个字不用改，
只把中转地址从 workers.dev 换成自己的域名。

## 为什么会有这一份（2026-08-28 现场验证得出）

Cloudflare Worker 版本身没问题，但 **`*.workers.dev` 这个域名在国内移动网络下不稳**——
讲台电脑连得上（往往因为电脑挂了代理），学生手机用流量扫码却打不开。
这是域名级的问题，换成**自己的域名**（哪怕同样过 Cloudflare 橙云）就正常了。

判据：**给学生扫的码，必须用你自己的域名。** 别拿 `*.workers.dev` 上考场。

## 现在部署在哪

| | |
|---|---|
| 地址 | `https://live.zhouliying.com` |
| 机器 | AWS Lightsail 新加坡（和 MySpace 同一台） |
| 服务 | `smrelay.service`（systemd）· `127.0.0.1:8092` · 用户 `smrelay` |
| 代码 | `/opt/smrelay/`（smrelay.py + remote.html + ask.html + admin.html） |
| 数据 | `/var/lib/smrelay/live.db`（SQLite：房间/场次/条目）· 令牌在 `/etc/smrelay/token` |
| 入口 | Caddy 里 `live.zhouliying.com` 一段 → `reverse_proxy 127.0.0.1:8092` |

实测：`/health` 175–190ms（比 workers.dev 的 285ms 还快）；WSS 经 Cloudflare 握手 191ms，
学生提交 → 大屏出现端到端 **69ms**。

## 三个网址

```
https://live.zhouliying.com/q/<房间号>                       学生扫码提问
https://live.zhouliying.com/r/<房间号>?qa=1&qaAnchor=<锚点>   讲者 iPad：遥控 / 讲稿 / 问答
                                                             （qaAnchor＝问答页锚点，翻到就自动切过去）
wss://live.zhouliying.com/ws?room=<房间号>&role=<角色>        deck 用
```

房间号：`[A-Za-z0-9_-]{4,64}`。**遥控和问答共用同一个房间号**——角色不同，同一个房间各走各的。

## deck 侧怎么接

烘进 deck 的三行配置：

```html
<script>
window.__SM_CLOUD_RELAY__ = "https://live.zhouliying.com";
window.__SM_ROOM__        = "yourroom2026";   // 手机遥控（pair-client.js 读它）
window.__SM_QA_ROOM__     = "yourroom2026";   // 问答墙（qa-block 读它）
</script>
```

问答墙那段（二维码 + 卡片流 + 自动降级）见
`SlidesHTML/qygl-2026/qa-block.html`，是可以直接抄的成品。

## 角色

| 角色 | 谁 | 能做什么 | 多实例 |
|---|---|---|---|
| `deck` | 放映端 | 与 remote 双向转发 · **登记本房间的遥控密码** | ✗ **先到先得**（要顶替须 `?takeover=1`） |
| `remote` | 手机 / iPad 遥控 | 与 deck 双向转发 | ✓ |
| `ask` | 学生手机 | 只能发 `qa-add` | ✓ |
| `wall` | 大屏问答页 | 只收 | ✓ |
| `host` | 讲者 iPad | 收问题 + 发控制 | ✓ |

⚠️ **问答端一定不能复用 `deck` 角色。** slides 通常是公开分享的，角色用错就会互相踢。

### deck 为什么是「先到先得」而不是「新的顶掉旧的」

原来是新的顶掉旧的。但真实用法是：**讲者在公用电脑上打开公开链接放映，用自己的 iPad 遥控**——
也就是说公开版必须带遥控按钮。那台下任何人点一下「📱 手机遥控 → 云端」，
就会把讲台那份踢出房间，讲者的遥控和讲稿同步当场断。

改法不是砍掉公开版的遥控（那等于废掉讲者的实际流程），而是改中转：
房间里已有放映端时，新来的一律回 `{type:"deck-busy"}` 并关闭；
讲者自己换机器时，客户端弹一颗「接管本房间」，带 `?takeover=1` 重连才顶替。
刷新页面不受影响——旧连接一断，位置立刻释放。

## 消息

```
学生 → 服务端   {type:"qa-add", text:"…"}
服务端 → 学生   {type:"qa-ack", ok:true|false, why:"closed|too-fast|empty", total:N}
服务端 → wall/host  {type:"qa-init", questions:[…], closed:false}      连上即发全量
                    {type:"qa-new", q:{id,t,ts}, total:N}
                    {type:"qa-cleared"} / {type:"qa-hidden", id} / {type:"qa-state", closed}
服务端 → 遥控端 {type:"auth-required", reason:"need|bad|passcode-set", left:N}   要密码 / 密码错
                {type:"auth-locked", wait:秒}                                     错太多次，冷却中
host → 服务端   {type:"qa-clear"} / {type:"qa-hide", id} / {type:"qa-close"} / {type:"qa-open"}
                {type:"qa-scroll", dir:1|-1}      翻大屏的问题墙（瞬时指令，不落盘）
deck → 第二设备  deck-info 里带 qaRoom / qaAnchor —— iPad 据此自动开出问答面板并在
                翻到问答页时自动切过去。**别再靠 URL 参数**：漏一个参数等于没有这个功能。
```

阀门（技术性，不是内容审核）：单条 ≤200 字 · 同一连接两次提交间隔 ≥4 秒 · 每房间留存 ≤300 条。

## 部署 / 更新

```bash
D=plugin/slidesmith/skills/phone-remote/relay/selfhost
cd $D && tar czf - smrelay.py remote.html ask.html admin.html smrelay.service \
  smrelay-backup smrelay-backup.service smrelay-backup.timer caddy-snippet.conf install.sh \
  | myspace ssh 'rm -rf /tmp/smrelay && mkdir -p /tmp/smrelay && tar xzf - -C /tmp/smrelay && sudo bash /tmp/smrelay/install.sh'
```

⚠️ **公网 SSH（30022）从用户的网络连不通**（TCP 通、SSH banner 不来，路上有东西在干预）。
走 Tailscale `100.89.145.35` 正常 —— `~/.myspace/config.json` 里把 `host` 换成它，
然后用 `myspace ssh`（它支持 stdin，所以上面那条 tar 管道能用，不需要 scp）。

**部署前先备份线上库**（服务随时在写，别用 cp）：

```bash
myspace ssh 'sudo install -d -m 700 /root/smlive-backup; sudo python3 -c "
import sqlite3,time
s=sqlite3.connect(\"/var/lib/smrelay/live.db\"); d=sqlite3.connect(\"/root/smlive-backup/live-%s.db\"%time.strftime(\"%Y%m%d-%H%M%S\"))
s.backup(d)"'
```

`install.sh` 幂等：建用户、装文件、起服务、**并入 Caddy 前先 `caddy validate`，校验不过就回滚**。

## 排障

```bash
sudo systemctl status smrelay
sudo journalctl -u smrelay -f          # join/leave 都有日志
curl -s http://127.0.0.1:8092/health   # 机器上自测
ls /var/lib/smrelay/                   # 各房间的问题留存
```

- **提问页打得开、但问题不上屏** → 多半是 deck 那边 `__SM_QA_ROOM__` 和二维码里的房间号不一致。
- **大屏显示"未连接"** → 先 `curl https://<域名>/health`；再看 deck 是不是被别的 `deck` 顶掉了
  （问答走 `wall`，不受此影响；受影响的是遥控）。
- **一场结束想清干净** → iPad 上按「关闭提问」+「清屏」；或 `sudo rm /var/lib/smrelay/<room>.json && sudo systemctl restart smrelay`。

## 事后

活动结束不用拆服务——它闲着几乎不占资源（`MemoryMax=192M`，空转时几 MB）。
真要下线：`sudo systemctl disable --now smrelay`，再把 Caddyfile 里那一段删掉 `systemctl reload caddy`。

## 现场经验（2026-08-28 三端联调得出）

1. **问题墙别用 CSS 多栏。** `column-count` 在固定高度容器里是**往右**开新栏、不是往下堆，
   `scrollHeight` 永远等于 `clientHeight`，纵向怎么都滚不动（实测 705==705）。用两/三列 grid。
2. **别截断问题。** 原来只留最新 12 条，多了把最早的挤掉——而现场往往正是从最早那几条开始答。
   改成全部保留 + 墙可滚 + iPad 上「大屏 ⬆⬇」翻。1920×1080 三栏一屏约放 21 条。
3. **`PFEED.chan` 必须判空**（`pair-client.js`）。猜不到广播频道名时它是 null，
   直接挂 `onmessage` 会抛，把 `sendDeckInfo` 打断、讲稿第一次推送丢掉。
   表现极隐蔽：第二设备每 2 秒重问，第二次才拿到，看起来"只是慢了点"。
   托管在网页上（而不是 file://）时更容易触发。

## 遥控密码

连接时带 `&pass=<sha256 十六进制>`，哈希 = `sha256("slidesmith-remote:" + 密码)`。

- **放映端（deck）登记**：第一个 deck 上线时带什么，这个房间就要什么；不带 = 这房间不设密码
- **只拦 `remote` / `host`**。`ask`（学生提问）和 `wall`（大屏）**永远不要密码**
- 连错 6 次 → 冷却 60 秒（正确密码也暂时挡下）
- deck 一登记密码，会把此前没验过的 remote/host 请下线
- **向后兼容**：不设密码的房间行为与从前完全一致，旧版客户端照常连

⚠️ 哈希烘在 deck 里，而 deck 常常是公开分享的 —— **能读到 deck 源码的人就能拿到凭证**。
它挡的是「扫了一眼大屏二维码就想遥控」，不是有备而来的人。要更强的隔离：别公开分享那一份。
