---
name: live
description: |
  常驻服务 Slidesmith Live（live.zhouliying.com）上的两种房间，都由 smlive CLI 全权管理。
  **① 现场互动房间**：给 HTML slides 插一页互动页 + 烘一个房间号，学生扫码参与、实时上大屏、讲者用 iPad 主持、课后按场次（一个自然日一场）导出 CSV / Markdown。现有玩法 qa 扫码匿名提问；投票 / 词云 / 小测等未建，做法见 references/new-block.md。
  **② 问卷房间（0.4.0 新增）**：一份 JSON 题库推上去就是一条网址 `/s/<房间号>`，手机电脑都能填、分册只显示自己那一册、断点续填、答卷导出 CSV / JSON / Markdown。适合课前摸底、课后评估、企业调研、需求收集——**任何"要发一份表出去收数据"的场合**。
  **管理台的每件事 AI 都能用 smlive CLI 直接做**：建 / 改名 / 删房间 · 看在线 · 列场次 · 读提问 · 导出 · 清屏 · 关 / 开提问 · 推问卷 · 看谁交了 · 导答卷 · 收卷。
  当用户说「扫码提问 / 现场互动 / 课堂互动 / 提问上墙 / 弹幕上屏 / 投票 / 词云 / 小测 / 抢答 / 匿名反馈 / 管理台 / 把提问导出来 / 关掉提问 / 做个问卷 / 发问卷 / 调查表 / 问卷星那种 / 收问卷 / 导出答卷」时启用。
  手机翻页是 phone-remote，副屏讲稿是 slides-presenter-mode，从零做 slides 是 editorial-slides。
metadata:
  version: 0.4.0
  status: dogfood-validated
  part_of: slidesmith
  service: https://live.zhouliying.com
---

# slidesmith:live · 把现场互动做进 slides

> **速览**（原 frontmatter 元数据，按需查阅）
>
> - 两种房间: 现场互动（/q/ · WebSocket · 实时）· 问卷（/s/ · 纯 HTTP · 不实时）
> - blocks: [qa]
> - cli: scripts/smlive.mjs（令牌版管理接口 · 配置在 ~/.slidesmith/live.json 0600）
> - verify: node scripts/verify-live-inject.mjs（16/16 · 装配）+ node scripts/verify-live-agent.mjs（22/22 · 管理 CLI）—— 都自己起本地中转，不碰线上
> - dogfood_case: 企业管理硕士 2026 级培养方案宣讲 · 2026-08-28 · 31 页 academic deck + 扫码提问，三端联调 12/12
> - dogfood_case: 振华集团「AI 时代企业经营效率提升」调研 · 2026-09-03 · 133 题 / 7 分册的问卷房间，上线联调通过（问卷房间就是这一次做出来的）


> 一句话：**给 deck 装一个房间号和一页互动页，学生扫码参与，你在管理台看账。**
> 底座（中转 + 管理台 + 账本 + 备份）已经常驻在新加坡那台机器上，**这个 skill 只管装配和交接**。

## 分工：用户指挥，AI 全干

管理台上能点的每一件事，AI 都能直接做 —— 用 `smlive`（见下）。用户不用去点任何按钮。

| 谁 | 干什么 |
|---|---|
| **AI（你）** | 建房间 / 起名 / 删 · 装配进 deck · 验证 · 看在线 · 列场次 · 读提问 · 导出 · 现场清屏 / **讲完关提问**（不需要 slides 还开着） |
| **用户** | 说要什么。想自己看一眼就开 `https://live.zhouliying.com/`（浏览器登录，密码同 MySpace） |

**两道门，同一批接口**：管理台网页 `/` 走 msauth（给人用，浏览器登录）；
`/api/agent/*` 走 Bearer 令牌（给 AI 和脚本用）。业务逻辑只有一份，不会分叉。
令牌在服务器 `/etc/smrelay/token`，Mac 上存在 `~/.slidesmith/live.json`（0600）。

⚠️ 只有一件事仍要用户本人：**换令牌**（要 SSH 上服务器）。其余全都 AI 干。

---

## smlive —— 管理台的 AI 版

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/live/scripts/smlive.mjs"

node $S rooms                                   # 所有房间 · 谁在线 · 场次数 · 累计条数
node $S new qygl2026 --name "企业管理 2026 级宣讲"
node $S sessions qygl2026                       # 这门课讲过几场，每场多少人多少问题
node $S items qygl2026                          # 最近一场的全部提问（也可以给场次 id）
node $S export qygl2026 --fmt csv --out ~/Desktop/提问.csv     # 或 --fmt md
node $S clear qygl2026                          # 远程清大屏（**账本一条不少**）
node $S close qygl2026   /   node $S open qygl2026             # 关 / 开提问
node $S rename qygl2026 --name "…"   /   node $S rm qygl2026 --yes
node $S urls qygl2026                           # 三个网址，直接贴给用户
```

任何命令加 `--json` 出机器可读结果（**要把结果喂给别的步骤就用它**，别去解析中文表格）。
第一次用要 `node $S setup --token <令牌>`；令牌在服务器 `sudo cat /etc/smrelay/token`。

**删房间会连同它所有场次和提问一起删掉、不可恢复**，所以 `rm` 必须显式加 `--yes`。
删之前先 `export` 一份，除非用户明说不要。

---

## 标准流程（五步）

### 1 · 定房间号（一门课一个，定了就别改）

`[A-Za-z0-9_-]{4,64}`。**一门课 / 一个长期活动 = 一个房间号，烘一次，二维码永不变**；
每次开讲自动分成新的一场。别一节课换一个号——那样账本被切碎，事后没法比较。

起法：课程缩写 + 年份，`qygl2026` / `marketing2026f`。先问用户课程名，再给他一个，然后直接建：

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/live/scripts/smlive.mjs" new qygl2026 --name "企业管理 2026 级宣讲"
```

（其实不建也行 —— 房间号烘进 deck，放映端第一次连上会自动建、自动开场。
先建的好处是能同时把中文名起上，事后在账本里一眼认得出是哪门课。）

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
管理台     https://live.zhouliying.com/               ←（想自己看时才用，密码同 MySpace）
```

现场用户也可以直接吩咐你：「清一下屏」「关掉提问」→ `node $S clear|close qygl2026`。

**讲完第一件事：关提问。**

```bash
node $S close qygl2026
```

二维码还贴在教室里、还在学生相册里 —— 不关掉，散场后谁扫谁都还能提。
**不需要 slides 还开着**，房间没人连着也照样关得掉（下次开讲前 `open` 回来）。

### 5 · 课后

```bash
node $S sessions qygl2026                                  # 这次是第几场
node $S export qygl2026 --fmt md --out ~/Desktop/提问.md    # 或 --fmt csv（带 BOM，Excel 不乱码）
```

账本里看得到「现场撤下过哪条」（隐藏只做标记不删）。用户要分析就把导出的内容读进来直接做。

---

## 问卷房间（0.4.0）

现场互动是「一群人同时在场，你要实时看到反应」；问卷是「人不在场，各自找时间填」。
两件事的形状完全不同，所以**没有硬塞进 qa 那条通道**：

| | 现场互动 `/q/` | 问卷 `/s/` |
|---|---|---|
| 传输 | WebSocket，实时上墙 | 普通 HTTP，不实时 |
| 一个人 | 连续提很多条 | 只交一份，还能回来改 |
| 单条大小 | ≤200 字 | 一份答卷几 KB |
| 节流 | 同设备 4 秒一条 | 不节流，但有草稿和大小上限 |
| 存哪 | `session` + `item` | `survey` + `answer`（两张新表） |

**qa 那条路一行代码没动**，老 deck 照常跑。

### 怎么用（四步）

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/live/scripts/smlive.mjs"

# 1 推题库上去（房间不存在会自动建）。改题就再跑一次，链接和二维码都不用换
node $S survey set zhenhua2026 --schema 问卷.json --title "…" [--code 访问码]

# 2 把链接发出去（要二维码：qrencode -o q.png -s 10 "<链接>"）
node $S survey urls zhenhua2026

# 3 随时看回收
node $S survey list zhenhua2026            # 谁交了、哪一册、答了几题、草稿还是已交

# 4 收数据
node $S survey export zhenhua2026 --fmt csv   # 一份答卷一行，矩阵题一行一列
node $S survey export zhenhua2026 --fmt json  # 要自己算就用这个
node $S survey close zhenhua2026              # 收卷；反悔用 open
node $S survey rm-answer zhenhua2026 3 --yes  # 删掉某一份（测试行 / 灌水行）
```

### 题库长什么样

一个 JSON，两层：`tracks`（分册）+ `sections`（节，每节声明属于哪几册）。

```jsonc
{
  "id": "…", "title": "…", "subtitle": "…", "org": "…",
  "intro": ["段落，**粗体**能用"], "privacy": "隐私声明", "thanks": "交卷后那句话",
  "tracks": [ {"id":"A","name":"全局速答","who":"给谁填","count":31,"minutes":13,
               "desc":"…","primary":true} ],
  "sections": [ {"id":"A1","tracks":["A"],   // ["*"] = 所有册都要答
                 "title":"…","desc":"…","questions":[ … ]} ]
}
```

题型六种，都在一个 `type` 字段上：

| type | 长什么样 | 关键字段 |
|---|---|---|
| `single` / `multi` | 整行可点的大选项 | `options[]` · `other:true` 出「其他」输入框 · `max:3` 限选几项 |
| `likert` | 一排刻度，说明在节首出现一次 | `scale:[{v,label,desc}]` |
| `matrix` | 一行一张卡，选项是 chip | `rows[]` `cols[]`（**列名压到四个字**，长了手机上折三行） |
| `text` / `textarea` | 输入框 | `rows` `placeholder` |

每题还认 `required:false`（默认必答）、`hint`、`star:true`（标成重点题，左侧加红边）。

**改题的正确姿势**：题库用脚本生成，别手改 JSON。
参考 `振华集团AI赋能调研/01_调研设计/questions.py` —— 一个 Python 文件是唯一事实源，
跑一下同时吐出 JSON（给网页）和 Markdown（给人看 / 打印）。手改 JSON 迟早两边对不上。

### 做问卷时容易踩的四个坑

1. **题量要按册算，不能按总数算。** 133 题的问卷发出去没人填，
   拆成七册各二三十题就有人填。册数和题量是**自动算**的，别手填——
   卡片上写「23 题」点进去 31 题，第一印象就毁了。
2. **别赌 CSS 新特性。** 这类问卷八成从微信里点开，安卓那边是 X5 内核。
   `:has()` 用来做选中态 = 老内核上点了没反应。选中态一律 JS 打 `data-on`。
   `color-mix()` / `100dvh` 都要先写一行老写法兜底。
   **字体只能用系统栈** —— Google Fonts 在国内加载不出来。
3. **一册一份答卷。** 同一个人填完 A 卷又去填 B5，那是两份，
   共用一个答卷编号会互相覆盖，而且两边都不报错。抬头那几题（R1–R5）自动带过去。
4. **不要强制必填拦提交。** 有些题人家确实不方便答。
   提交时温和提示「还有 N 题没填」，然后放行。拦下来只会让人直接关掉。

### 服务端改了什么（要排障时看）

- `smrelay.py`：两张新表 · `survey_api()`（公开，无认证）· `admin_api` 里三个 survey 接口 · `/s/<房间>` 路由
- `survey.html`：问卷页，题目不写死在里面，运行时从 `/api/survey/meta` 取
- `caddy-snippet.conf`：`/s/*` 和 `/api/survey/*` **必须绕开 forward_auth** ——
  填表的是外单位的人，给不了他们 MySpace 密码。**门是房间号本身**，要更严就 `--code`

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
| `references/admin-console.md` | 用户问「管理台能干什么 / 数据怎么存 / 隐私」· 令牌接口和 CLI 的完整说明 |
| `references/protocol.md` | 要写代码连中转 |
| `references/new-block.md` | **要加新玩法（必读）** |
| `assets/blocks/qa/README.md` | 只是要装 qa |
| `../phone-remote/relay/selfhost/README.md` | 中转本身要改 / 要部署 / 排障（权威源） |

## 排障

| 症状 | 多半是 |
|---|---|
| 问卷页打开显示「没找到这份问卷」 | 房间号敲错，或者题库还没 `survey set` 上去 |
| 问卷页转到登录页 | Caddy 里 `/s/*` 或 `/api/survey/*` 没绕开 forward_auth，重跑 install.sh |
| 选项点了没反应（安卓 / 微信） | 用了 `:has()` 之类的新 CSS。选中态必须 JS 打 `data-on` |
| 答卷少了一册 | 同一个人两册共用了答卷编号，后填的把先填的覆盖了（0.4.0 已修） |
| 提问页打得开，但问题不上屏 | deck 里的 `__SM_QA_ROOM__` 和二维码里的房间号不一致 |
| 大屏显示「未连接」 | 先 `curl https://live.zhouliying.com/health`；再看是不是 deck 被别的放映端占了（问答走 `wall`，不受影响；受影响的是遥控） |
| iPad 上没有问答面板 | deck 里没烘遥控客户端（`--no-remote` 加错了），或问答页锚点没算出来 |
| 学生扫码打不开 | 见红线 1；再确认没把管理台的登录规则误套到 `/q/*` 上 |
| `smlive` 报「返回的不是 JSON」 | Caddy 里 `/api/agent/*` 没绕开 forward_auth，被登录页挡了。见 `../phone-remote/relay/selfhost/caddy-snippet.conf` |
| `smlive` 报 401 | 令牌不对。服务器上 `sudo cat /etc/smrelay/token`，再 `setup` 一次 |
