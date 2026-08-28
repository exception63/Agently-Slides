# slidesmith:live

## 0.1.0 · 2026-08-28

第一版。把 2026-08-28 那场宣讲上现做的现场问答，收成可复用的东西。

- **互动块 qa**：扫码匿名提问 → 实时上墙。从现场那份 `qa-block.html` 提炼，
  颜色改走皮肤令牌（22 张皮通用；二维码底仍写死白色，深色皮上才扫得出来）。
- **`inject-live.mjs`**：一条命令把块装进任意 Slidesmith deck。**幂等 + 可逆到字节一致**。
  按 div 层级找 deck 收尾，插入的互动页真的被引擎收编（段导航、缩略图、锚点都有）。
- **`data-seg` 必须是数字**：引擎 `segOf()` 是 `parseInt`，模板里写 `"LAST"` 会得到锚点
  `sNaN-1`、段导航里 `[data-seg-thumbs="NaN"]` 根本不存在。改成注入时算段号填进去。
- **references/new-block.md**：写清「新玩法只写两页、中转不用改」**只在复用 `qa-*` 时成立**——
  服务端是消息类型白名单，自造类型会被默默丢掉、两头都不报错。给出两条路和取舍。
- **`scripts/verify-live-inject.mjs`（16/16）**：本地起一份中转 + 真浏览器跑
  「学生提交 → 大屏出现」，不碰线上、不写用户真账本。

## 0.2.0 · 2026-08-28

用户要「AI 是执行者，我只当指挥者」—— 管理台上能点的每一件事，AI 现在都能直接做。

- **服务端第二道门**：`/api/agent/*` + `Authorization: Bearer <令牌>`，和管理台
  `/api/admin/*` **共用同一份业务逻辑**（只是门不同，不会分叉）。令牌在
  `/etc/smrelay/token`，`install.sh` 首次装时随机生成、之后不覆盖；改了不用重启。
  Caddy 里这条路径绕开 forward_auth —— 否则带着令牌也会被登录页挡住。
- **`smlive.mjs`**：rooms / new / rename / rm / sessions / items / export / clear /
  close / open / urls / whoami，全部支持 `--json`。删房间必须显式 `--yes`。
- **修掉一个线上真 bug**：条目的 `ts` 在库里是毫秒、场次时间是秒，接口原样吐毫秒，
  **管理台和导出都把日期显示成公元 58626 年**。接口对外统一成秒（库里不动，老数据照样对）；
  WebSocket 那侧仍是毫秒（大屏的 `new Date(q.ts)` 靠它）。
- **时区**：服务器跑在 UTC，导出的时间对不上课表（现场 17:45 导成 09:45）。
  `smrelay.service` 里设 `TZ=Asia/Shanghai`。
- **`scripts/verify-live-agent.mjs`（22/22）**：本地起中转跑完整圈 —— 令牌对/错/不带 ·
  建改删房间 · 真开一场 · 清屏后账本一条不少 · 关提问后学生被挡 · CSV 的 BOM ·
  时间不是公元 58626 年 · 删除要 `--yes`。
