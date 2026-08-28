# Slidesmith Live —— 现场互动服务（自托管）

`https://live.zhouliying.com`。一个进程同时是三样东西：

| | 路径 | 谁用 | 要密码吗 |
|---|---|---|---|
| **管理台** | `/` | 只有你 | **要**（复用 MySpace 的 msauth，密码天然同一个） |
| 学生互动页 | `/q/<房间>` | 学生 | **永远不要** |
| 讲者控制台 | `/r/<房间>` | 你的 iPad | 中转按房间校验遥控密码 |
| 中转 | `/ws` | deck | 同上 |

## 数据模型：课 → 场次 → 条目

```
课/活动（room）    长期    slides 里的房间号烘一次，二维码永不变
  └ 场次（session）  一次    放映端上线＝开场；下线满 30 分钟＝讲完
      └ 条目（item）  一条    一个提问
```

**刷新页面、断线重连仍算同一场**（现场天天发生）；隔一次课再开讲自动分新场。
场次序号按**每个房间**从 1 数，不是全库自增 ID。

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

**清屏只清大屏，账本一条不少**；「隐藏某条」在账本里只做标记不删 —— 事后复盘要看得到当时撤下过什么。

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
| 代码 | `/opt/smrelay/`（smrelay.py + remote.html + ask.html） |
| 数据 | `/var/lib/smrelay/<room>.json`（问题留存，重启不丢） |
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
ssh <server> 'rm -rf /tmp/smrelay && mkdir -p /tmp/smrelay'
scp $D/{smrelay.py,remote.html,ask.html,smrelay.service,caddy-snippet.conf,install.sh} <server>:/tmp/smrelay/
ssh <server> 'sudo bash /tmp/smrelay/install.sh'
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
