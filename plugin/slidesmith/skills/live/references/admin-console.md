# 管理台（live.zhouliying.com/）

一个进程同时是三样东西：管理台 `/`（**要密码**）· 学生页 `/q/<房间>`（**永不要密码**）·
中转 `/ws`。Caddy 用 forward_auth 转到 MySpace 现有的 msauth，
**所以管理台密码和 MySpace 天然是同一个**，改一次两处都变。

⚠️ 认证边界（改中转/Caddy 时务必回归这 6 条）：
```
/  和 /api/admin/*        → 303 跳登录
/q/*  /r/*  /ws  /health  → 200 畅通
```
学生扫码提问被密码挡住 = 互动本身作废。

## 数据模型：课 → 场次 → 条目

```
课/活动（room）    长期    slides 里的房间号烘一次，二维码永不变
  └ 场次（session）  一次    放映端(deck)上线＝开场；下线满 30 分钟＝讲完
      └ 条目（item）  一条    一个提问
```

- 刷新页面、断线重连**仍算同一场**；隔一次课再开讲自动分新场。
- 场次序号按**每个房间**从 1 数。
- **不存任何设备标识**（用户明确要求）：不记 IP、不记指纹。所以没有「参与人数」，
  只有**同时在线峰值**——看得出规模，事后定位不到任何人。这条是设计取舍，不是缺功能。
- 存储：`/var/lib/smrelay/live.db`（SQLite）。每天 03:30 备份进 `/srv/myspace/files/`，
  用户 Mac 上现有的 `myspace sync pull` 顺手带回来。

## 管理台上能做什么

新建房间（可自动生成房间号）· 改名 · 删除 · 看谁在线 ·
场次列表 + 每场全部提问 · 导出 **CSV**（带 BOM，Excel 开中文不乱码）/ **MD** ·
**远程清屏 / 关闭提问**（不用掏 iPad）· 每场的提问数与在线峰值。

**清屏只清大屏，账本一条不少**；「隐藏某条」在账本里只做标记不删 —— 事后复盘要看得到当时撤下过什么。

## 两道门，同一批接口

| 门 | 路径 | 谁用 | 怎么进 |
|---|---|---|---|
| 网页管理台 | `/` · `/api/admin/*` | 人 | 浏览器登录 msauth（密码同 MySpace） |
| **令牌接口** | `/api/agent/*` | **AI / 脚本** | `Authorization: Bearer <令牌>` |

业务逻辑只有一份（`admin_api()`），两道门只是门不同 —— **不会分叉**。
令牌在服务器 `/etc/smrelay/token`（root:smrelay 0640，`install.sh` 首次装时随机生成），
Mac 上存在 `~/.slidesmith/live.json`（0600）。改了令牌不用重启服务，按 mtime 自动重读。

⚠️ Caddy 里 `/api/agent/*` **必须绕开 forward_auth**，否则 AI 带着令牌也会被登录页挡住。
边界实测（改中转或 Caddy 后务必复验）：

```
/  和 /api/admin/*   → 303 跳登录        （人的门，没变）
/api/agent/*         → 401（没带令牌）    ← 是 401 不是 303，说明确实绕开了
/q/*  /r/*  /ws  /health → 200 畅通
```

## 接口清单

`/api/agent/X` 和 `/api/admin/X` 一一对应，X 相同：

```
GET  …/whoami                        连通性 + 令牌自检（版本 / 在线房间 / 房间总数）
GET  …/overview                      所有房间 + 在线情况
GET  …/sessions?room=<房间>          场次列表（no 按房间从 1 数）
GET  …/items?session=<场次id>        某场全部条目（**ts 是秒**）
GET  …/export?session=<id>&fmt=csv|md
POST …/room     {action:"create|rename|delete", id, name}
POST …/control  {room, action:"clear|close|open"}
```

平时不用自己拼这些，用 `scripts/smlive.mjs`（`node smlive.mjs help` 看命令）。

## 时间单位（踩过）

条目在库里存的是**毫秒**（墙上那份 `questions` 用 JS 的 `Date.now()`，入库原样带进来），
而场次的 `started/ended` 是**秒**。接口曾经原样吐毫秒，管理台和导出都按秒解释它，
**日期显示成公元 58626 年**。现在 HTTP 接口对外一律给秒（`secs()` 统一），库里不动。
⚠️ WebSocket 那侧（`qa-init`/`qa-new`）仍是毫秒 —— 大屏的 `new Date(q.ts)` 靠它，别顺手改。

服务器跑在 UTC，`smrelay.service` 里设了 `TZ=Asia/Shanghai`，否则现场 17:45 的提问会导成 09:45。
