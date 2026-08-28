# 中转协议速查（deck / 学生页 / iPad 三边）

> **权威版本在** `../../phone-remote/relay/selfhost/README.md` 和 `smrelay.py` 本身。
> 这里只留「写互动块时会用到」的那部分。两边打架时以那边为准。

服务：`https://live.zhouliying.com` · AWS 新加坡 · systemd `smrelay.service` · `127.0.0.1:8092`
Cloudflare Worker 版（`relay/cloudflare/worker.mjs`）是**同一套协议**，只是域名不同。

## 三个网址

```
https://live.zhouliying.com/q/<房间>            学生扫码（永不设密码）
https://live.zhouliying.com/r/<房间>            你的 iPad：遥控 + 讲稿 + 问答主持
wss://live.zhouliying.com/ws?room=<房间>&role=<角色>   deck / 大屏 / 学生页都走这个
```

房间号 `[A-Za-z0-9_-]{4,64}`。**遥控和问答共用同一个房间号** —— 角色不同，各走各的。

## 角色

| 角色 | 谁 | 能做什么 | 多实例 | 要密码 |
|---|---|---|---|---|
| `deck` | 放映端 | 与 remote 双向转发 · 登记本房间遥控密码 · **上线＝开一场** | ✗ 先到先得（顶替要 `?takeover=1`） | 登记方 |
| `remote` | 手机 / iPad 遥控 | 与 deck 双向转发 | ✓ | 要 |
| `ask` | 学生手机 | 只能发 `qa-add` | ✓ | **永不** |
| `wall` | 大屏互动页 | 只收 | ✓ | **永不** |
| `host` | 讲者 iPad | 收问题 + 发控制 | ✓ | 要 |

⚠️ **互动块一律用 `wall`，绝不能复用 `deck`。** slides 是公开分享的，
台下谁打开一下就会把讲台那份挤出房间（deck 是先到先得，第二个直接被回绝）。

## 消息

```
学生 → 服务端      {type:"qa-add", text:"…"}
服务端 → 学生      {type:"qa-ack", ok, why:"closed|too-fast|empty", total}
服务端 → wall/host {type:"qa-init", questions:[…], closed}   ← 连上即发全量，别自己补拉
                   {type:"qa-new", q:{id,t,ts}, total}
                   {type:"qa-cleared"} / {type:"qa-hidden", id} / {type:"qa-state", closed}
                   {type:"qa-scroll", dir:1|-1}              ← 翻大屏，瞬时指令不落盘
host → 服务端      {type:"qa-clear"|"qa-hide"|"qa-close"|"qa-open"|"qa-scroll"}
```

阀门（技术性，不是内容审核）：单条 ≤200 字 · 同一连接两次提交间隔 ≥4 秒 · 每房间墙上留存 ≤300 条。

## ⚠️ 服务端有**消息类型白名单**

`on_message()` 里逐个 `if t == …` 判断，**不认识的类型直接丢掉**，不会广播。
所以「新玩法只写两页、中转一行不用改」这句话**只在你复用 `qa-*` 时成立**。
真要新消息类型，就得改 `smrelay.py` 并重新部署。两条路怎么选见 `new-block.md`。

## deck 侧要烘的三行

```html
<script>
window.__SM_CLOUD_RELAY__ = "https://live.zhouliying.com";
window.__SM_ROOM__        = "yourroom2026";   // 手机遥控（pair-client.js 读它）
window.__SM_QA_ROOM__     = "yourroom2026";   // 互动块读它
</script>
```

`inject-live.mjs` 会替你写好这三行，一般不用手写。

## 遥控密码

连接带 `&pass=<sha256 十六进制>`，哈希 = `sha256("slidesmith-remote:" + 密码)`。
只拦 `remote` / `host`；`ask` 和 `wall` 永远畅通。连错 6 次冷却 60 秒。
哈希烘在 deck 里，而 deck 常常公开分享 —— 它挡的是「扫一眼大屏就想遥控」，不是有备而来的人。
