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

## AI 能不能替你操作管理台

**不能。** 管理台在登录后面，AI 手里没有你的密码，也不该有。分工是：

| 谁 | 干什么 |
|---|---|
| AI | 定房间号 · 装互动块进 deck · 本地跑通验证 · 把三个网址交给你 |
| 你 | 在管理台建/改房间名 · 现场清屏关问答 · 课后导出 |

**不用先去管理台建房间**：房间号烘进 deck，放映端第一次连上时自动建、自动开场。
去管理台只是为了给它起个中文名（「营销学 2026 秋」），中文名只给你自己看。

## 接口（排障时用，需已登录的 cookie）

```
GET  /api/admin/overview                 所有房间 + 在线情况
GET  /api/admin/sessions?room=<房间>     场次列表（no 按房间从 1 数）
GET  /api/admin/items?session=<场次id>   某场全部条目
GET  /api/admin/export?session=<id>&fmt=csv|md
POST /api/admin/room     {action:"create|rename|delete", id, name}
POST /api/admin/control  {room, action:"clear|close|open"}
```
