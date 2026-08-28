---
name: live
description: |
  给 HTML slides 加「现场互动」，并接到常驻服务 Slidesmith Live（https://live.zhouliying.com）上统一管理。
  一次装配 = 往 deck 里插一页互动页 + 烘一个房间号；学生扫码参与，内容实时上大屏，讲者用 iPad 主持，课后在管理台按场次导出。
  现在能装的玩法：**qa 扫码匿名提问 · 实时上墙**（已现场实战）。投票 / 词云 / 小测 / 抢答 / 评分 / 分组答案是菜单上还没做的，做法见 references/new-block.md。
  数据模型是「课 → 场次 → 条目」：一门课一个房间号（烘一次、二维码永不变），每次开讲自动分一场，事后能按场次导出 CSV / Markdown 做分析。不存任何设备标识。
  当用户说 "加个扫码提问 / 现场互动 / 课堂互动 / 学生扫码 / 提问上墙 / 弹幕上屏 / 现场投票 / 词云 / 随堂小测 / 抢答 / 匿名反馈 / 二维码提问 / live / 管理台 / 我的互动服务 / 这门课要互动 / 把提问导出来" 时启用。
  只负责「互动」；要手机翻页遥控是 phone-remote skill，要副屏讲稿同步是 slides-presenter-mode skill，要从零做 slides 是 editorial-slides skill。
metadata:
  version: 0.1.0
  status: dogfood-validated
  part_of: slidesmith
  service: https://live.zhouliying.com
  blocks: [qa]
  verify: node scripts/verify-live-inject.mjs（16/16 · 真浏览器 + 本地起一份中转，不碰线上）
  dogfood_case: 企业管理硕士 2026 级培养方案宣讲 · 2026-08-28 · 31 页 academic deck + 扫码提问，三端联调 12/12
---

# slidesmith:live · 把现场互动做进 slides

> 一句话：**给 deck 装一个房间号和一页互动页，学生扫码参与，你在管理台看账。**
> 底座（中转 + 管理台 + 账本 + 备份）已经常驻在新加坡那台机器上，**这个 skill 只管装配和交接**。

## 分工（先看这个，省得白忙）

| 谁 | 干什么 |
|---|---|
| **AI（你）** | 定房间号 · 把互动块装进 deck · 本地跑通验证 · 把三个网址交出去 |
| **用户** | 在管理台给房间起中文名 · 现场清屏/关提问 · 课后导出 |

**AI 进不去管理台**（在登录后面，密码和 MySpace 同一个，AI 手里没有也不该有）。
所以别承诺「我帮你在管理台建好了」——**说清楚哪几步要他自己点**。

好消息：**不用先去管理台建房间**。房间号烘进 deck，放映端第一次连上时自动建、自动开场。
去管理台只是给它起个中文名（「营销学 2026 秋」）。

---

## 标准流程（五步）

### 1 · 定房间号（一门课一个，定了就别改）

`[A-Za-z0-9_-]{4,64}`。**一门课 / 一个长期活动 = 一个房间号，烘一次，二维码永不变**；
每次开讲自动分成新的一场。别一节课换一个号——那样账本被切碎，事后没法比较。

起法：课程缩写 + 年份，`qygl2026` / `marketing2026f`。先问用户课程名，再给他一个。

### 2 · 装

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/live/scripts/inject-live.mjs" <deck.html> --room qygl2026
```

它做四件事：deck 末尾插入互动页 · `</body>` 前烘入房间配置 + 二维码库 + 手机遥控客户端 + 块的 CSS/JS ·
**幂等**（装过先拆干净再装，反复跑结果一样；改房间号直接重跑）· 打印三个网址。

常用参数：

| 参数 | 干什么 |
|---|---|
| `--blocks qa` | 装哪几个块（逗号分隔）。默认 `qa` |
| `--seg 6` `--segname "段 6 · 答疑"` | 互动页归到哪一段。默认新开最后一段 |
| `--no-slide` | 只装运行时，那一页自己已经写好了 |
| `--no-remote` | 不烘手机遥控客户端（一般**别加**，理由见下） |
| `--out 另存.html` | 不改原文件 |
| `--remove` | 整段卸掉（可逆到字节一致） |
| `--relay http://127.0.0.1:8901` | 换中转（本地验证用） |

**遥控客户端要一起烘**：讲者的真实用法是「公用电脑打开公开链接放映 + 自己的 iPad 遥控/看讲稿」，
公开版没有遥控等于这套流程直接废掉。「学生点一下把讲台顶下线」在中转那层已经解决了
（deck 先到先得，第二个直接回绝，只有显式接管才顶替）。

### 3 · 自己验一遍（别把没跑过的东西交出去）

```bash
node scripts/verify-live-inject.mjs        # 在 presentsystems 仓库里跑
```
它会自己起一份**本地**中转、用真浏览器走完「学生提交 → 大屏出现」，**不碰线上、不写用户的真账本**。

要看具体这份 deck：`npx tsx packages/cli/src/index.ts serve --no-open -p 8790 <deck>`，
翻到互动页，看状态点是不是绿的「已连接 · 实时」。

⚠️ **别拿用户的线上房间做写入测试**——每提交一条都会进他的真账本，混进课后导出里。
真要连线上试，用一个一次性房间号（`probe` + 日期），并告诉用户回头在管理台删掉。

### 4 · 交接（把这几行给用户）

```
房间号     qygl2026
学生扫码   https://live.zhouliying.com/q/qygl2026     ←（大屏上的二维码就是它）
你的 iPad  https://live.zhouliying.com/r/qygl2026     ←（清屏 / 隐藏 / 关提问 / 翻大屏）
管理台     https://live.zhouliying.com/               ←（密码同 MySpace；去给房间起个中文名）
```

### 5 · 课后

管理台 → 房间 → 那一场 → 导出 **CSV**（带 BOM，Excel 开中文不乱码）或 **Markdown**。
账本里看得到「现场撤下过哪条」（隐藏只做标记不删）。

---

## 三条红线（血的教训，别再踩）

1. **给学生扫的码必须用自有域名。** `*.workers.dev` 在国内移动网络下打不开——
   讲台电脑连得上（多半因为挂了代理），学生用流量扫码就是白屏。所以默认 `live.zhouliying.com`。
2. **互动块一律用 `wall` 角色，绝不能复用 `deck`。** slides 是公开分享的，
   角色用错，台下随便谁打开一下就把讲台踢下线。
3. **大屏上要滚动的区域不能用 `column-count`。** 多栏在固定高度容器里是往**右**开新栏，
   `scrollHeight` 永远等于 `clientHeight`，纵向怎么都滚不动（实测 705==705）。用 grid。

---

## 现在有哪些块

| 块 | 玩法 | 状态 |
|---|---|---|
| **qa** | 扫码匿名提问 → 实时上墙 → iPad/管理台主持 | ✅ 已上线，现场实战过 |

菜单上还没做的（投票 / 词云 / 小测 / 抢答 / 评分 / 分组）：**别现编消息类型**。
服务端是类型白名单，自己造的类型会被默默丢掉，两头都不报错。
两条路（搭 qa 便车 vs 改服务端）和取舍写在 **`references/new-block.md`**，动手前先读它。

看效果：`previews/qa-academic.png` · `qa-keynote-dark.png` · `qa-editorial.png`（同一个块，三张皮）。

---

## 还要读什么

| 文件 | 什么时候读 |
|---|---|
| `references/admin-console.md` | 用户问「管理台能干什么 / 数据怎么存 / 隐私」 |
| `references/protocol.md` | 要写代码连中转 |
| `references/new-block.md` | **要加新玩法（必读）** |
| `assets/blocks/qa/README.md` | 只是要装 qa |
| `../phone-remote/relay/selfhost/README.md` | 中转本身要改 / 要部署 / 排障（权威源） |

## 排障

| 症状 | 多半是 |
|---|---|
| 提问页打得开，但问题不上屏 | deck 里的 `__SM_QA_ROOM__` 和二维码里的房间号不一致 |
| 大屏显示「未连接」 | 先 `curl https://live.zhouliying.com/health`；再看是不是 deck 被别的放映端占了（问答走 `wall`，不受影响；受影响的是遥控） |
| iPad 上没有问答面板 | deck 里没烘遥控客户端（`--no-remote` 加错了），或问答页锚点没算出来 |
| 学生扫码打不开 | 见红线 1；再确认没把管理台的登录规则误套到 `/q/*` 上 |
