#!/usr/bin/env python3
"""smrelay —— Slidesmith 自托管中转（手机遥控 + 现场问答）

和 Cloudflare Worker 版（relay/cloudflare/worker.mjs）**同一套协议**，
所以 deck / 遥控端 / 提问页三边代码完全不用改，只换中转地址。

为什么不用 websockets 库：这台机器是 2GB 的生产机，还跑着 MySpace。
WebSocket 服务端握手 + 帧解析总共两百行，不值得为它引入依赖和 venv。
纯标准库 = 装上就能跑，升级 Python 也不会坏。

角色：
  deck   放映端      —— 一个房间只留一个，新的顶掉旧的
  remote 遥控/讲稿端 —— 与 deck 双向转发（cmd / signal / status）
  ask    学生提问端  —— 只发 qa-add
  wall   大屏问题墙  —— 多实例共存（slides 是公开分享的，谁打开都不该顶掉讲台那份）
  host   讲者主持端  —— 收问题 + 发控制（清屏 / 隐藏 / 开关提问）

路由：
  GET /health              存活探测
  GET /r/<room>            遥控 + 讲稿 + 问答主持页
  GET /q/<room>            学生提问页
  GET /s/<room>            问卷页（0.4.0）—— 纯 HTTP，不走 WebSocket
  *   /api/survey/<...>    问卷的公开接口（填表人用，无认证；门是房间号 + 可选访问码）
  GET /ws?room=&role=      WebSocket
  *   /api/admin/<...>     管理台接口 —— 门在 Caddy（forward_auth → msauth）
  *   /api/agent/<...>     同一批接口的**令牌版**，给 AI / 脚本用（smlive CLI）
                           门在这里：Authorization: Bearer <令牌>，令牌在 /etc/smrelay/token
"""
import asyncio, base64, hashlib, hmac, json, os, pathlib, re, sqlite3, struct, sys, time
from urllib.parse import urlparse, parse_qs, unquote

HOST = os.environ.get("SMRELAY_HOST", "127.0.0.1")
PORT = int(os.environ.get("SMRELAY_PORT", "8092"))
DATA = pathlib.Path(os.environ.get("SMRELAY_DATA", "/var/lib/smrelay"))
ASSETS = pathlib.Path(os.environ.get("SMRELAY_ASSETS", str(pathlib.Path(__file__).parent)))

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
ROLES = ("deck", "remote", "ask", "wall", "host")
ROOM_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
MAX_LEN, MAX_KEEP, MIN_GAP = 200, 300, 4.0     # 单条字数 / 留存条数 / 同设备提交间隔（秒）
MAX_AUTH_FAIL, AUTH_COOLDOWN = 6, 60.0         # 密码连错几次 / 冷却多少秒
MAX_ROOMS = 200
MAX_PAYLOAD, MAX_ANSWERS = 1 << 18, 2000   # 单份答卷字节上限 / 单个问卷答卷份数上限
SESSION_GAP = 30 * 60          # 房间空这么久就从内存里清出去（**不再用来分场**，分场看自然日）
DB = DATA / "live.db"
TOKEN_FILE = pathlib.Path(os.environ.get("SMRELAY_TOKEN_FILE", "/etc/smrelay/token"))
VERSION = "0.4.0"


# ═══════════════════ 存储：一个 SQLite 文件 ═══════════════════
# 三层：课/活动（room）→ 场次（session）→ 条目（item）。
# 「一门课一个房间、**一个自然日一场**」就落在这个结构上：
# slides 里的房间号一次烘死、二维码永不变，而每次上课各成一场，事后好分析。
#
# **不存任何设备标识**（用户明确要求）：只在场次上记一个「同时在线峰值」的数字，
# 事后无法定位到任何人，但仍看得出参与规模。
SCHEMA = """
CREATE TABLE IF NOT EXISTS room(
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', created INT NOT NULL,
  archived INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS session(
  id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL,
  started INT NOT NULL, ended INT, peak INT NOT NULL DEFAULT 0,
  FOREIGN KEY(room) REFERENCES room(id));
CREATE TABLE IF NOT EXISTS item(
  id INTEGER PRIMARY KEY AUTOINCREMENT, session INT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'q', text TEXT NOT NULL, ts INT NOT NULL,
  hidden INT NOT NULL DEFAULT 0,
  FOREIGN KEY(session) REFERENCES session(id));
CREATE INDEX IF NOT EXISTS ix_session_room ON session(room, started DESC);
CREATE INDEX IF NOT EXISTS ix_item_session ON item(session, ts);

-- 问卷房间（0.4.0 新增）。和现场问答共用 room 表，但走完全独立的两张表和
-- 独立的 HTTP 路径 —— 问卷不是实时的，硬塞进 WebSocket 那条路只会两边都别扭：
-- 答卷动辄几 KB（qa 单条上限 200 字），一个人只交一次（qa 是连续多条），
-- 而且要能改能续填（qa 是只追加）。所以另起两张表，一行 qa 的代码都不动。
CREATE TABLE IF NOT EXISTS survey(
  room TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
  schema TEXT NOT NULL, code TEXT NOT NULL DEFAULT '',
  closed INT NOT NULL DEFAULT 0, updated INT NOT NULL);
CREATE TABLE IF NOT EXISTS answer(
  id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL,
  rid TEXT NOT NULL, track TEXT NOT NULL DEFAULT '',
  started INT, updated INT NOT NULL, done INT NOT NULL DEFAULT 0,
  payload TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ix_answer_rid ON answer(room, rid);
"""
_db = None

def db():
    global _db
    if _db is None:
        DATA.mkdir(parents=True, exist_ok=True)
        _db = sqlite3.connect(str(DB))
        _db.row_factory = sqlite3.Row
        _db.executescript(SCHEMA)
        _db.commit()
    return _db

def q1(sql, *a):
    r = db().execute(sql, a).fetchone(); return r

def qa_(sql, *a):
    return db().execute(sql, a).fetchall()

def ex(sql, *a):
    c = db().execute(sql, a); db().commit(); return c

def log(*a):
    print(time.strftime("[%F %T]"), *a, flush=True)


# ───────────────────────── WebSocket 帧 ─────────────────────────
class WS:
    """够用的 RFC6455 服务端：文本帧、分片重组、ping/pong、close。不谈压缩扩展。"""

    def __init__(self, reader, writer):
        self.r, self.w = reader, writer
        self.closed = False
        self.role = ""
        self.room = None
        self.authed = False
        self.last_post = 0.0

    async def send(self, text):
        if self.closed:
            return
        data = text.encode("utf-8")
        n = len(data)
        if n < 126:
            head = struct.pack("!BB", 0x81, n)
        elif n < (1 << 16):
            head = struct.pack("!BBH", 0x81, 126, n)
        else:
            head = struct.pack("!BBQ", 0x81, 127, n)
        try:
            self.w.write(head + data)
            await self.w.drain()
        except Exception:
            self.closed = True

    async def send_json(self, obj):
        await self.send(json.dumps(obj, ensure_ascii=False))

    async def close(self, code=1000):
        if self.closed:
            return
        self.closed = True
        try:
            self.w.write(struct.pack("!BBH", 0x88, 2, code))
            await self.w.drain()
            self.w.close()
        except Exception:
            pass

    async def _frame(self):
        h = await self.r.readexactly(2)
        fin = bool(h[0] & 0x80)
        op = h[0] & 0x0F
        masked = bool(h[1] & 0x80)
        ln = h[1] & 0x7F
        if ln == 126:
            ln = struct.unpack("!H", await self.r.readexactly(2))[0]
        elif ln == 127:
            ln = struct.unpack("!Q", await self.r.readexactly(8))[0]
        if ln > 1 << 20:                       # 1MB 一帧，远超任何正常用途
            raise ValueError("frame too large")
        mask = await self.r.readexactly(4) if masked else None
        payload = await self.r.readexactly(ln) if ln else b""
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return fin, op, payload

    async def recv(self):
        """返回一条完整文本消息；连接关闭时返回 None。"""
        buf, op0 = b"", None
        while True:
            try:
                fin, op, data = await self._frame()
            except (asyncio.IncompleteReadError, ConnectionResetError, ValueError, OSError):
                return None
            if op == 0x8:                       # close
                return None
            if op == 0x9:                       # ping → pong
                try:
                    self.w.write(struct.pack("!BB", 0x8A, len(data)) + data)
                    await self.w.drain()
                except Exception:
                    return None
                continue
            if op == 0xA:                       # pong
                continue
            if op in (0x1, 0x2):
                op0, buf = op, data
            elif op == 0x0:
                buf += data
            if fin:
                if op0 == 0x1:
                    try:
                        return buf.decode("utf-8")
                    except UnicodeDecodeError:
                        return None
                buf, op0 = b"", None            # 二进制帧直接丢弃


# ───────────────────────── 房间 ─────────────────────────
class Room:
    def __init__(self, name):
        self.name = name
        self.socks = {r: set() for r in ROLES}
        self.questions = []
        self.closed_qa = False
        self.passhash = ""      # 由第一个放映端登记；空＝这份 deck 没设遥控密码
        self.fails = 0          # 密码连错次数
        self.locked_until = 0.0
        self.touched = time.time()
        self._load()

    @property
    def _file(self):
        return DATA / (self.name + ".json")

    def _load(self):
        try:
            d = json.loads(self._file.read_text("utf-8"))
            self.questions = d.get("questions", [])[-MAX_KEEP:]
            self.closed_qa = bool(d.get("closed", False))
        except Exception:
            pass

    def _save(self):
        # 落盘是为了「服务重启 / 机器重启后问题还在」——现场最怕的就是一重启全没了
        try:
            DATA.mkdir(parents=True, exist_ok=True)
            tmp = self._file.with_suffix(".tmp")
            tmp.write_text(json.dumps(
                {"questions": self.questions, "closed": self.closed_qa,
                 "updatedAt": int(time.time())}, ensure_ascii=False), "utf-8")
            tmp.replace(self._file)
        except Exception as e:
            log("保存失败", self.name, e)

    def counts(self):
        return {"deck": len(self.socks["deck"]), "remote": len(self.socks["remote"])}

    async def to(self, roles, obj):
        msg = json.dumps(obj, ensure_ascii=False)
        for r in roles:
            for ws in list(self.socks[r]):
                await ws.send(msg)

    def empty(self):
        return not any(self.socks[r] for r in ROLES)


# ── 场次生命周期 ─────────────────────────────────────────────
# **分场判据＝自然日**：同一天里的所有动静都算一场（见 open_session 的注释）。
# 收场时间记的是「当天房间最后一次空掉」那一刻，当天再有动静就把它清回 NULL。
def ensure_room(rid, name=""):
    if not q1("SELECT id FROM room WHERE id=?", rid):
        ex("INSERT INTO room(id,name,created) VALUES(?,?,?)", rid, name or "", int(time.time()))

def same_day(a, b):
    """同一个自然日。用本地时区（服务单元里设了 TZ=Asia/Shanghai），不是 UTC——
    否则北京时间早上 8 点前的课会被算成前一天。"""
    la, lb = time.localtime(a), time.localtime(b)
    return (la.tm_year, la.tm_yday) == (lb.tm_year, lb.tm_yday)

def open_session(rid):
    """当前这一场。

    **分场判据＝自然日**：同一天里的所有动静都算同一场，中间隔多久都不分——
    放映端断开、页面刷新、试机和正课隔了一个半小时、上午讲一遍下午再讲一遍，
    统统记在这一天名下。跨到第二天才另起一场。

    （早先按「静默 30 分钟」分，边界太碎：同一堂课的课前试机和正式开讲之间隔了
    一个半小时，就会被切成两场。按天分，一门课的账目和课表天然对得上。）"""
    ensure_room(rid)
    now = int(time.time())
    last = q1("SELECT id, started, ended FROM session WHERE room=? ORDER BY id DESC LIMIT 1", rid)
    if last and same_day(last["started"], now):
        if last["ended"] is not None:
            ex("UPDATE session SET ended=NULL WHERE id=?", last["id"])   # 当天又有动静，这一场继续
        return last["id"]
    return ex("INSERT INTO session(room,started) VALUES(?,?)", rid, now).lastrowid

def touch_session_end(rid):
    """放映端下线：先记个结束时间；真正判定讲完由清扫任务在 SESSION_GAP 后做。"""
    ex("UPDATE session SET ended=? WHERE room=? AND ended IS NULL", int(time.time()), rid)

def bump_peak(rid, n):
    r = q1("SELECT id, started, peak FROM session WHERE room=? ORDER BY id DESC LIMIT 1", rid)
    # 最后一场不是今天的，说明这会儿只是有人点开了链接看看（deck 和提问页都是公开分享的）：
    # 既不该把峰值记到旧场上，也不该为此凭空开一场。真开一场由「放映端上线」或「第一条提问」触发。
    if not r or not same_day(r["started"], time.time()):
        return
    if n > (r["peak"] or 0):
        ex("UPDATE session SET peak=? WHERE id=?", n, r["id"])

def current_session(rid):
    """条目该记进哪一场。

    ⚠️ 原来是「拿这个房间的最后一场」，**不判间隔** —— 于是放映端早就下线一个半小时了，
    学生这会儿扫码提的问题仍旧记进上一场。线上真出过：8-30 那场放映端 14:54 就断了，
    16:29–16:42 的 21 条提问全被算进那一场，导出来时间对不上课。

    open_session() 本身就是「当前这一场，没有就开一场」（还开着就接着用 · 刚结束不到
    SESSION_GAP 就续上 · 隔久了才另起一场），语义正是这里要的，别再写第二份。"""
    return open_session(rid)


ROOMS = {}

def room_of(name):
    r = ROOMS.get(name)
    if r is None:
        if len(ROOMS) >= MAX_ROOMS:
            for k, v in list(ROOMS.items()):
                if v.empty():
                    del ROOMS[k]
        r = ROOMS[name] = Room(name)
    r.touched = time.time()
    return r


# ───────────────────────── 消息处理 ─────────────────────────
async def on_message(ws, raw):
    room = ws.room
    role = ws.role

    if role in ("ask", "host", "wall"):
        try:
            d = json.loads(raw)
        except Exception:
            return
        t = d.get("type")

        if role == "ask" and t == "qa-add":
            if room.closed_qa:
                await ws.send_json({"type": "qa-ack", "ok": False, "why": "closed"}); return
            now = time.time()
            if now - ws.last_post < MIN_GAP:     # 防连点，不是内容审核
                await ws.send_json({"type": "qa-ack", "ok": False, "why": "too-fast",
                                    "wait": int(MIN_GAP - (now - ws.last_post)) + 1}); return
            text = " ".join(str(d.get("text", "")).split())[:MAX_LEN]
            if not text:
                await ws.send_json({"type": "qa-ack", "ok": False, "why": "empty"}); return
            ws.last_post = now
            item = {"id": "q%s" % base64.b32encode(os.urandom(5)).decode().lower().rstrip("="),
                    "t": text, "ts": int(now * 1000)}
            room.questions.append(item)
            del room.questions[:-MAX_KEEP]
            room._save()
            # 落进 SQLite：墙上那份是"这一场正在显示的"，库里这份是"永久账本"。
            # 讲者清屏只清墙，不动账本——不然一清屏历史就没了。
            try:
                ex("INSERT INTO item(session,kind,text,ts) VALUES(?,?,?,?)",
                   current_session(room.name), "q", text, item["ts"])
            except Exception as e:
                log("入库失败", room.name, e)
            await room.to(("wall", "host"), {"type": "qa-new", "q": item, "total": len(room.questions)})
            await ws.send_json({"type": "qa-ack", "ok": True, "total": len(room.questions)})
            return

        if role == "ask":                        # 控制键只认 host / wall
            return

        if t == "qa-clear":
            room.questions = []; room._save()
            await room.to(("wall", "host"), {"type": "qa-cleared"})
        elif t == "qa-hide" and d.get("id"):
            gone = [q for q in room.questions if q["id"] == d["id"]]
            room.questions = [q for q in room.questions if q["id"] != d["id"]]; room._save()
            if gone:   # 账本里只标记，不删——事后复盘要看得到"当时撤下过什么"
                try: ex("UPDATE item SET hidden=1 WHERE session=? AND ts=? AND text=?",
                        current_session(room.name), gone[0]["ts"], gone[0]["t"])
                except Exception: pass
            await room.to(("wall", "host"), {"type": "qa-hidden", "id": d["id"], "total": len(room.questions)})
        elif t == "qa-scroll":
            # 纯瞬时指令，不落盘：讲者在 iPad 上翻大屏的问题墙
            await room.to(("wall",), {"type": "qa-scroll", "dir": d.get("dir", 1)})
        elif t in ("qa-close", "qa-open"):
            room.closed_qa = (t == "qa-close"); room._save()
            await room.to(("wall", "host", "ask"), {"type": "qa-state", "closed": room.closed_qa})
        return

    # 手机遥控：一端原样转发给另一端
    other = "remote" if role == "deck" else "deck"
    for peer in list(room.socks[other]):
        await peer.send(raw)


async def ws_session(ws, room_name, role, takeover=False, passhash=""):
    room = room_of(room_name)
    ws.room, ws.role = room, role

    # ── 遥控密码闸 ──────────────────────────────────────────────
    # 只拦 remote / host（遥控翻页、看讲稿、控问答）。
    # **ask（学生提问）和 wall（大屏展示）永远不要密码** —— 学生扫码就该能提问，
    # 加一道门等于把互动本身废掉。
    #
    # 密码由放映端在连接时登记（deck 里烘的是 sha256(room:code) 的十六进制，不是明文，
    # 所以翻 deck 源码看不到码本身）。deck 没登记密码 = 这份 deck 不设密码，行为和以前完全一样，
    # 老版本的 iPhone app 照常能用。
    if role == "deck":
        if not room.socks["deck"] or takeover:
            room.passhash = passhash or ""
            if room.passhash:
                # 放映端一登记密码，就把先前没验过的遥控端请下去（它们是密码生效前混进来的）
                for r in ("remote", "host"):
                    for old in list(room.socks[r]):
                        if not getattr(old, "authed", False):
                            await old.send_json({"type": "auth-required", "reason": "passcode-set"})
                            await old.close()
                            room.socks[r].discard(old)
    elif role in ("remote", "host") and room.passhash:
        now = time.time()
        if now < room.locked_until:
            await ws.send_json({"type": "auth-locked", "wait": int(room.locked_until - now) + 1})
            await ws.close(); return
        if passhash != room.passhash:
            room.fails += 1
            if room.fails >= MAX_AUTH_FAIL:
                room.locked_until = now + AUTH_COOLDOWN
                room.fails = 0
            await ws.send_json({"type": "auth-required",
                                "reason": "bad" if passhash else "need",
                                "left": max(0, MAX_AUTH_FAIL - room.fails)})
            await ws.close(); return
        room.fails = 0
        ws.authed = True

    # 放映端：**先到先得**，而不是「新的顶掉旧的」。
    # 为什么改：slides 是公开分享的，台下任何人打开一次公开链接、点一下「手机遥控」，
    # 就会把讲台那份从房间里踢出去，讲者的 iPad 遥控和讲稿同步当场断——这在现场是灾难。
    # 讲者自己要换机器时，客户端会显式带 takeover=1 再连一次，那时才允许顶替。
    # 刷新页面不受影响：旧连接一断，位置立刻释放。
    if role == "deck" and room.socks["deck"]:
        if not takeover:
            await ws.send_json({"type": "deck-busy",
                                "hint": "本房间已有放映端在线。若这台才是要讲的那台，请选择「接管」。"})
            await ws.close()
            return
        for old in list(room.socks["deck"]):
            await old.send_json({"type": "evicted", "reason": "another-deck"})
            await old.close()
            room.socks["deck"].discard(old)
    room.socks[role].add(ws)
    if role == "deck":
        try: open_session(room_name)
        except Exception as e: log("开场失败", room_name, e)
    elif role == "ask":
        try: bump_peak(room_name, len(room.socks["ask"]))
        except Exception: pass
    log("join", room_name, role, room.counts())

    await ws.send_json({"type": "joined", "role": role, "peers": room.counts()})
    if role in ("wall", "host"):
        await ws.send_json({"type": "qa-init", "questions": room.questions, "closed": room.closed_qa})
    elif role == "ask":
        await ws.send_json({"type": "qa-state", "closed": room.closed_qa, "total": len(room.questions)})
    if role in ("deck", "remote"):
        await room.to(("remote" if role == "deck" else "deck",),
                      {"type": "peer", "role": role, "event": "join", "peers": room.counts()})

    try:
        while True:
            msg = await ws.recv()
            if msg is None:
                break
            await on_message(ws, msg)
    finally:
        room.socks[role].discard(ws)
        await ws.close()
        # 收场时间＝**房间彻底空了**那一刻，不是「放映端走了」那一刻。
        # 纯扫码提问的场次常常根本没有 deck 连过（只有 wall 和 ask），
        # 只认 deck 的话那种场次的 ended 永远是空的，列表里一直显示「进行中」。
        if room.empty():
            try: touch_session_end(room_name)
            except Exception: pass
        log("leave", room_name, role, room.counts())
        if role in ("deck", "remote"):
            await room.to(("remote" if role == "deck" else "deck",),
                          {"type": "peer", "role": role, "event": "leave", "peers": room.counts()})


# ───────────────────────── HTTP ─────────────────────────
def page(name, room, title=""):
    try:
        html = (ASSETS / name).read_text("utf-8")
    except Exception:
        return None
    return html.replace("__ROOM__", json.dumps(room)).replace("__TITLE__", json.dumps(title))

async def http_reply(w, status, body, ctype="text/plain; charset=utf-8", extra=""):
    if isinstance(body, str):
        body = body.encode("utf-8")
    w.write(("HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\n"
             "Access-Control-Allow-Origin: *\r\nCache-Control: no-store\r\n%s\r\n"
             % (status, ctype, len(body), extra)).encode() + body)
    await w.drain()
    w.close()

# ═══════════════════ 令牌门（给 AI / 脚本用）═══════════════════
# 管理台 `/` 和 `/api/admin/*` 的门在 Caddy 上（forward_auth → msauth，密码同 MySpace），
# 那是给人用的：浏览器里登录一次，cookie 带着走。
#
# AI 和脚本没有浏览器也不该拿到用户的密码，所以给同一批接口开第二道门：
# `/api/agent/*` + `Authorization: Bearer <令牌>`。**Caddy 上这条路径要绕开 forward_auth**
# （否则 AI 拿着令牌也会被登录页挡住），门就完全落在下面这几行上——所以它必须简单到不会写错。
#
# 令牌存 /etc/smrelay/token（root:smrelay 0640），install.sh 首次装时随机生成。
# 改了令牌不用重启：这里按 mtime 自动重读。
_tok = {"v": None, "mt": -1}

def agent_token():
    try:
        st = TOKEN_FILE.stat()
    except Exception:
        return os.environ.get("SMRELAY_TOKEN") or None      # 没有令牌文件 = 这道门关死
    if st.st_mtime != _tok["mt"]:
        try:
            _tok["v"] = TOKEN_FILE.read_text("utf-8").strip() or None
            _tok["mt"] = st.st_mtime
        except Exception:
            return None
    return _tok["v"]

def agent_ok(headers):
    want = agent_token()
    if not want:
        return False
    got = (headers.get("authorization") or "").strip()
    if got.lower().startswith("bearer "):
        got = got[7:].strip()
    else:
        got = (headers.get("x-sm-token") or "").strip()
    return bool(got) and hmac.compare_digest(got, want)


# ═══════════════════ 管理台 API ═══════════════════
# 门由 Caddy 的 forward_auth 把（复用 MySpace 的 msauth，密码天然同一个）。
# 这里假定「能走到这儿的就是本人」——服务只监听 127.0.0.1，绕不过去。
def state_on_disk(rid):
    """房间当前不在内存里时，「提问关没关 / 墙上还留着几条」得从盘上读。

    ⚠️ 原来这两项在房间不在线时一律报「没关 · 0 条」。但**关闭状态是持久化的**
    （Room._load 会读回来，学生照样被挡），于是服务一重启、或者房间被清扫出内存，
    管理台就把「已关闭」显示成「开着」—— 显示和真相不一致比显示错更糟：
    讲者会以为二维码还敞着，或者反过来以为关上了其实没关。"""
    try:
        d = json.loads((DATA / (rid + ".json")).read_text("utf-8"))
        return len(d.get("questions") or []), bool(d.get("closed", False))
    except Exception:
        return 0, False

def secs(t):
    """条目的 ts 在库里是**毫秒**（墙上那份 questions 用的是 JS 的 Date.now()，入库时原样带进来），
    而场次的 started/ended 是**秒**。两种单位混在同一个接口里，谁读谁猜错：
    管理台 admin.html 和导出都按秒解释毫秒，日期直接变成公元 58626 年。
    所以 **HTTP 接口对外一律给秒**，在这里统一。库里那份不动（不用迁移，老数据照样对）。
    ⚠️ WebSocket 那侧（qa-init / qa-new）仍是毫秒 —— 大屏的 new Date(q.ts) 靠它，别顺手改。"""
    t = int(t or 0)
    return t // 1000 if t > 10 ** 11 else t

def csv_escape(v):
    v = "" if v is None else str(v)
    return '"' + v.replace('"', '""') + '"' if any(c in v for c in ',"\n\r') else v

# ═══════════════════ 问卷房间（0.4.0）═══════════════════
# 和现场问答的关系：**共用房间号空间，其余全部分开**。
#   /q/<房间>  扫码提问（WebSocket，实时上墙）
#   /s/<房间>  填问卷  （纯 HTTP，不实时）
# 一个房间号只当一种用：建问卷房间时会占掉这个号，qa 那边照旧看不见它。
#
# 为什么问卷不走 WebSocket：一份答卷几 KB（qa 单条限 200 字）、一个人只交一次
# 且要能回来改（qa 是只追加）、填到一半要能存草稿。硬套 qa 的通道，两边都残废。
#
# 这条路径**不要密码**：填问卷的是外单位的人，不可能给他们 MySpace 的密码。
# 门就是房间号本身（猜不到），需要更严就给问卷设一个访问码（code）。
RID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def survey_row(rid):
    return q1("SELECT * FROM survey WHERE room=?", rid)


def survey_api(path, qs, body):
    """公开接口：填表人用。没有任何认证，所以每一个入口都要自己把住。"""
    now = int(time.time())

    if path == "/api/survey/meta":
        rid = (qs.get("room") or [""])[0]
        if not ROOM_RE.match(rid or ""):
            return {"ok": False, "error": "房间号不对"}
        r = survey_row(rid)
        if not r:
            return {"ok": False, "error": "没有这份问卷"}
        out = {"ok": True, "room": rid, "title": r["title"],
               "closed": bool(r["closed"]), "needCode": bool(r["code"])}
        if r["code"] and (qs.get("code") or [""])[0] != r["code"]:
            out["locked"] = True          # 题目本身也不给，访问码才是门
            return out
        out["locked"] = False
        try:
            out["schema"] = json.loads(r["schema"])
        except Exception:
            return {"ok": False, "error": "问卷内容坏了，联系发问卷的人"}
        return out

    if path == "/api/survey/save" and body is not None:
        rid = str(body.get("room") or "")
        r = survey_row(rid) if ROOM_RE.match(rid) else None
        if not r:
            return {"ok": False, "error": "没有这份问卷"}
        if r["code"] and str(body.get("code") or "") != r["code"]:
            return {"ok": False, "error": "访问码不对"}
        if r["closed"]:
            return {"ok": False, "error": "这份问卷已经收卷了"}
        aid = str(body.get("rid") or "")
        if not RID_RE.match(aid):
            return {"ok": False, "error": "答卷编号不对"}
        payload = body.get("payload")
        if not isinstance(payload, dict):
            return {"ok": False, "error": "答卷格式不对"}
        blob = json.dumps(payload, ensure_ascii=False)
        if len(blob.encode("utf-8")) > MAX_PAYLOAD:
            return {"ok": False, "error": "答卷太大了"}
        track = str(body.get("track") or "")[:16]
        done = 1 if body.get("done") else 0
        old = q1("SELECT id,started FROM answer WHERE room=? AND rid=?", rid, aid)
        if old:
            ex("UPDATE answer SET track=?,updated=?,done=?,payload=? WHERE id=?",
               track, now, done, blob, old["id"])
        else:
            if q1("SELECT COUNT(*) c FROM answer WHERE room=?", rid)["c"] >= MAX_ANSWERS:
                return {"ok": False, "error": "这份问卷的答卷数已达上限"}
            ex("INSERT INTO answer(room,rid,track,started,updated,done,payload) VALUES(?,?,?,?,?,?,?)",
               rid, aid, track, now, now, done, blob)
        if done:
            log("问卷交卷", rid, track)
        return {"ok": True, "saved": now, "done": bool(done)}

    return {"ok": False, "error": "未知接口"}


# ── 导出：把答卷摊平成表 ──────────────────────────────────────
# 矩阵题一行一列（`题号::行名`），多选题用「；」连接。
# 列的顺序跟着问卷本身走，不跟着答卷走 —— 不然谁先交卷谁决定列序，两次导出对不上。
def survey_columns(schema):
    cols = []
    for sec_ in schema.get("sections", []):
        for qq in sec_.get("questions", []):
            if qq.get("type") == "matrix":
                for rw in qq.get("rows", []):
                    cols.append(("%s::%s" % (qq["id"], rw), "%s·%s" % (qq["id"], rw)))
            else:
                cols.append((qq["id"], "%s %s" % (qq["id"], qq.get("title", ""))))
    return cols


def flat(payload, key):
    qid, _, row = key.partition("::")
    v = payload.get(qid)
    if row:
        v = v.get(row) if isinstance(v, dict) else None
    if isinstance(v, list):
        return "；".join(str(x) for x in v)
    return "" if v is None else str(v)


def admin_api(path, qs, body):
    now = int(time.time())

    if path == "/api/admin/whoami":
        return {"ok": True, "service": "slidesmith-live", "version": VERSION,
                "uptime": now - START_AT, "rooms_live": len(ROOMS),
                "rooms_total": q1("SELECT COUNT(*) c FROM room WHERE archived=0")["c"]}

    if path == "/api/admin/overview":
        rooms = []
        for r in qa_("SELECT * FROM room WHERE archived=0 ORDER BY created DESC"):
            live = ROOMS.get(r["id"])
            st = q1("SELECT id,started,ended,peak FROM session WHERE room=? ORDER BY id DESC LIMIT 1", r["id"])
            n = q1("SELECT COUNT(*) c FROM item WHERE session IN (SELECT id FROM session WHERE room=?)", r["id"])["c"]
            ns = q1("SELECT COUNT(*) c FROM session WHERE room=?", r["id"])["c"]
            wall_n, closed = ((len(live.questions), bool(live.closed_qa)) if live
                              else state_on_disk(r["id"]))
            sv = survey_row(r["id"])
            rooms.append({
                "id": r["id"], "name": r["name"], "created": r["created"],
                "kind": "survey" if sv else "qa",
                "answers": (q1("SELECT COUNT(*) c FROM answer WHERE room=? AND done=1",
                               r["id"])["c"] if sv else None),
                "surveyClosed": (bool(sv["closed"]) if sv else None),
                "sessions": ns, "items": n,
                "online": {"deck": len(live.socks["deck"]) if live else 0,
                           "remote": len(live.socks["remote"]) if live else 0,
                           "ask": len(live.socks["ask"]) if live else 0} if live else None,
                "wallNow": wall_n,
                "closed": closed,
                "last": ({"id": st["id"], "started": st["started"], "ended": st["ended"], "peak": st["peak"]}
                         if st else None),
            })
        return {"ok": True, "now": now, "rooms": rooms,
                "health": {"uptime": now - START_AT, "rooms": len(ROOMS)}}

    if path == "/api/admin/sessions":
        rid = (qs.get("room") or [""])[0]
        out = []
        rows = qa_("""SELECT s.*, (SELECT COUNT(*) FROM item WHERE session=s.id) n
                       FROM session s WHERE s.room=? ORDER BY s.id ASC""", rid)
        # 序号按**这个房间**从 1 数。session.id 是全库自增的，直接拿来显示的话
        # 新房间的第一场会显示成「第 6 场」——看着像丢了五场。
        for i, r in enumerate(rows):
            out.append({"id": r["id"], "no": i + 1, "started": r["started"], "ended": r["ended"],
                        "peak": r["peak"], "items": r["n"]})
        out.reverse()
        rm = q1("SELECT * FROM room WHERE id=?", rid)
        return {"ok": True, "room": rid, "name": rm["name"] if rm else "", "sessions": out}

    if path == "/api/admin/items":
        sid = int((qs.get("session") or ["0"])[0] or 0)
        rows = qa_("SELECT id,text,ts,hidden FROM item WHERE session=? ORDER BY ts", sid)
        return {"ok": True, "session": sid,
                "items": [{"id": r["id"], "t": r["text"], "ts": secs(r["ts"]), "hidden": bool(r["hidden"])} for r in rows]}

    if path == "/api/admin/room" and body is not None:
        act = body.get("action")
        rid = str(body.get("id") or "").strip()
        if act == "create":
            rid = rid or ("r" + base64.b32encode(os.urandom(5)).decode().lower().rstrip("="))
            if not ROOM_RE.match(rid): return {"ok": False, "error": "房间号只能是 4–64 位字母数字和 - _"}
            if q1("SELECT id FROM room WHERE id=?", rid): return {"ok": False, "error": "这个房间号已经有了"}
            ensure_room(rid, str(body.get("name") or ""))
            return {"ok": True, "id": rid}
        if not q1("SELECT id FROM room WHERE id=?", rid): return {"ok": False, "error": "没有这个房间"}
        if act == "rename":
            ex("UPDATE room SET name=? WHERE id=?", str(body.get("name") or ""), rid); return {"ok": True}
        if act == "delete":
            ex("DELETE FROM item WHERE session IN (SELECT id FROM session WHERE room=?)", rid)
            ex("DELETE FROM session WHERE room=?", rid)
            ex("DELETE FROM room WHERE id=?", rid)
            ROOMS.pop(rid, None)
            try: (DATA / (rid + ".json")).unlink()
            except Exception: pass
            return {"ok": True}
        return {"ok": False, "error": "不认识的操作"}

    if path == "/api/admin/control" and body is not None:
        rid = str(body.get("room") or "")
        act = str(body.get("action") or "")
        if act not in ("clear", "close", "open"):
            return {"ok": False, "error": "不认识的操作"}
        live = ROOMS.get(rid)
        if not live:
            # **没人连着恰恰是最需要「关提问」的时刻** —— 课讲完了、投影关了，
            # 可二维码还贴在那儿/还在别人手机相册里，谁扫谁都还能提。
            # 房间存在就把它取出来（Room.__init__ 会从盘上读回 closed/questions），
            # 改完落盘；下一个学生连上时 _load() 把这个状态带回去，照样挡得住。
            if not q1("SELECT id FROM room WHERE id=?", rid):
                return {"ok": False, "error": "没有这个房间"}
            live = room_of(rid)
        PENDING_CONTROL.append((live, act))
        return {"ok": True}

    if path == "/api/admin/export":
        sid = int((qs.get("session") or ["0"])[0] or 0)
        fmt = (qs.get("fmt") or ["csv"])[0]
        st = q1("SELECT s.*, r.name rname FROM session s JOIN room r ON r.id=s.room WHERE s.id=?", sid)
        rows = qa_("SELECT text,ts,hidden FROM item WHERE session=? ORDER BY ts", sid)
        tf = lambda t: time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t))
        if fmt == "md":
            head = "# %s · %s\n\n共 %d 条 · 同时在线峰值 %d\n\n" % (
                (st["rname"] or st["room"]) if st else "?", tf(st["started"]) if st else "", len(rows),
                (st["peak"] or 0) if st else 0)
            body_ = "\n".join("%d. %s　`%s`%s" % (i + 1, r["text"], tf(secs(r["ts"])),
                                                  "　（现场已撤下）" if r["hidden"] else "")
                               for i, r in enumerate(rows))
            return ("text/markdown; charset=utf-8", (head + body_ + "\n").encode("utf-8"))
        out = "\ufeff序号,时间,问题,现场是否撤下\n"     # BOM：Excel 打开中文才不乱码
        for i, r in enumerate(rows):
            out += "%d,%s,%s,%s\n" % (i + 1, csv_escape(tf(secs(r["ts"]))), csv_escape(r["text"]),
                                      "是" if r["hidden"] else "否")
        return ("text/csv; charset=utf-8", out.encode("utf-8"))

    # ── 问卷（0.4.0）──────────────────────────────────────────
    if path == "/api/admin/survey" and body is not None:
        act = str(body.get("action") or "")
        rid = str(body.get("id") or body.get("room") or "").strip()
        if not ROOM_RE.match(rid):
            return {"ok": False, "error": "房间号只能是 4–64 位字母数字和 - _"}
        if act == "set":
            sch = body.get("schema")
            if not isinstance(sch, dict) or not sch.get("sections"):
                return {"ok": False, "error": "问卷内容必须是带 sections 的对象"}
            title = str(body.get("title") or sch.get("title") or "")
            code = str(body.get("code") or "")
            ensure_room(rid, title)      # 顺手在房间表里登记，管理台看得到
            if survey_row(rid):
                ex("UPDATE survey SET title=?,schema=?,code=?,updated=? WHERE room=?",
                   title, json.dumps(sch, ensure_ascii=False), code, now, rid)
            else:
                ex("INSERT INTO survey(room,title,schema,code,closed,updated) VALUES(?,?,?,?,0,?)",
                   rid, title, json.dumps(sch, ensure_ascii=False), code, now)
            nq = sum(len(x.get("questions") or []) for x in sch.get("sections") or [])
            return {"ok": True, "id": rid, "questions": nq, "code": bool(code)}
        r = survey_row(rid)
        if not r:
            return {"ok": False, "error": "没有这份问卷"}
        if act in ("close", "open"):
            ex("UPDATE survey SET closed=?,updated=? WHERE room=?", 1 if act == "close" else 0, now, rid)
            return {"ok": True, "closed": act == "close"}
        if act == "rm-answer":
            # 测试时留下的行、明显灌水的行，总得能单独摘掉，
            # 否则唯一的清理手段就是把整份问卷连同真答卷一起删了。
            aid = int(body.get("answer") or 0)
            c = ex("DELETE FROM answer WHERE room=? AND id=?", rid, aid)
            return {"ok": True, "removed": c.rowcount}
        if act == "delete":
            # 和删问答房间一个规矩：连答卷一起删、不可恢复，所以 CLI 那头要显式 --yes
            ex("DELETE FROM answer WHERE room=?", rid)
            ex("DELETE FROM survey WHERE room=?", rid)
            ex("DELETE FROM room WHERE id=?", rid)
            return {"ok": True}
        return {"ok": False, "error": "不认识的操作"}

    if path == "/api/admin/survey/list":
        rid = (qs.get("room") or [""])[0]
        r = survey_row(rid)
        if not r:
            return {"ok": False, "error": "没有这份问卷"}
        rows = qa_("SELECT id,rid,track,started,updated,done,payload FROM answer WHERE room=? ORDER BY id", rid)
        try:
            sch = json.loads(r["schema"])
        except Exception:
            sch = {"sections": []}
        who = {}
        for x in (sch.get("sections") or []):
            for qq in (x.get("questions") or []):
                if qq.get("id") in ("R1", "R2", "R3", "R4"):
                    who[qq["id"]] = True
        out, by_track = [], {}
        for x in rows:
            try:
                pl = json.loads(x["payload"])
            except Exception:
                pl = {}
            n_ans = sum(1 for v in pl.values() if v not in ("", None, [], {}))
            t = x["track"] or "?"
            by_track[t] = by_track.get(t, 0) + (1 if x["done"] else 0)
            out.append({"id": x["id"], "rid": x["rid"], "track": t,
                        "started": x["started"], "updated": x["updated"],
                        "done": bool(x["done"]), "answered": n_ans,
                        "who": " · ".join(str(pl.get(k)) for k in ("R2", "R3", "R1")
                                          if pl.get(k)) or "（未留名）"})
        return {"ok": True, "room": rid, "title": r["title"], "closed": bool(r["closed"]),
                "total": len(out), "done": sum(1 for x in out if x["done"]),
                "byTrack": by_track, "answers": out}

    if path == "/api/admin/survey/export":
        rid = (qs.get("room") or [""])[0]
        fmt = (qs.get("fmt") or ["csv"])[0]
        only_done = (qs.get("done") or ["0"])[0] == "1"
        r = survey_row(rid)
        if not r:
            return {"ok": False, "error": "没有这份问卷"}
        sch = json.loads(r["schema"])
        rows = qa_("SELECT * FROM answer WHERE room=?%s ORDER BY id"
                   % (" AND done=1" if only_done else ""), rid)
        recs = []
        for x in rows:
            try:
                recs.append((x, json.loads(x["payload"])))
            except Exception:
                pass
        tf = lambda t: time.strftime("%Y-%m-%d %H:%M", time.localtime(int(t or 0)))
        if fmt == "json":
            return ("application/json; charset=utf-8", json.dumps(
                {"room": rid, "title": r["title"], "exported": now,
                 "answers": [{"rid": x["rid"], "track": x["track"], "done": bool(x["done"]),
                              "updated": x["updated"], "payload": pl} for x, pl in recs]},
                ensure_ascii=False, indent=2).encode("utf-8"))
        cols = survey_columns(sch)
        if fmt == "md":
            L = ["# %s · 答卷汇总" % (r["title"] or rid), "",
                 "导出于 %s ·共 %d 份（完成 %d 份）" % (tf(now), len(recs),
                                                    sum(1 for x, _ in recs if x["done"])), ""]
            for i, (x, pl) in enumerate(recs):
                L += ["---", "", "## 第 %d 份 · %s 卷 · %s%s" % (
                    i + 1, x["track"] or "?", tf(x["updated"]),
                    "" if x["done"] else "　**（未提交，草稿）**"), ""]
                for k, h in cols:
                    v = flat(pl, k)
                    if v:
                        L.append("- **%s**：%s" % (h, v))
                L.append("")
            return ("text/markdown; charset=utf-8", "\n".join(L).encode("utf-8"))
        head = ["序号", "答卷编号", "分册", "是否提交", "最后更新"] + [h for _, h in cols]
        out = "\ufeff" + ",".join(csv_escape(h) for h in head) + "\n"
        for i, (x, pl) in enumerate(recs):
            line = [str(i + 1), x["rid"], x["track"] or "", "是" if x["done"] else "否（草稿）",
                    tf(x["updated"])] + [flat(pl, k) for k, _ in cols]
            out += ",".join(csv_escape(c) for c in line) + "\n"
        return ("text/csv; charset=utf-8", out.encode("utf-8"))

    return {"ok": False, "error": "未知接口"}


START_AT = int(time.time())
PENDING_CONTROL = []      # 管理台按的控制键：(room, action)，由事件循环里的小任务发出去


async def drain_control():
    """管理台是同步 HTTP，发不了 WebSocket；攒在这里由异步侧代发。"""
    while True:
        await asyncio.sleep(0.25)
        while PENDING_CONTROL:
            live, act = PENDING_CONTROL.pop(0)
            try:
                if act == "clear":
                    live.questions = []; live._save()
                    await live.to(("wall", "host"), {"type": "qa-cleared"})
                elif act in ("close", "open"):
                    live.closed_qa = (act == "close"); live._save()
                    await live.to(("wall", "host", "ask"), {"type": "qa-state", "closed": live.closed_qa})
            except Exception as e:
                log("控制指令失败", act, e)


async def sweep_sessions():
    """房间空满 SESSION_GAP 就从内存里清出去（只是回收 Room 对象；**分场看自然日**，
    和这里无关。问题和 closed 状态都在盘上，下次有人连上会重新读回来）。"""
    while True:
        await asyncio.sleep(120)
        try:
            for k, v in list(ROOMS.items()):
                if v.empty() and time.time() - v.touched > SESSION_GAP:
                    del ROOMS[k]
        except Exception:
            pass


async def handle(reader, writer):
    try:
        line = await asyncio.wait_for(reader.readline(), 15)
        if not line:
            writer.close(); return
        parts = line.decode("latin-1").split()
        if len(parts) < 2:
            writer.close(); return
        method, target = parts[0], parts[1]
        headers = {}
        while True:
            h = await asyncio.wait_for(reader.readline(), 15)
            if h in (b"\r\n", b"\n", b""):
                break
            k, _, v = h.decode("latin-1").partition(":")
            headers[k.strip().lower()] = v.strip()

        u = urlparse(target)
        path, qs = unquote(u.path), parse_qs(u.query)

        if path == "/health":
            await http_reply(writer, "200 OK", "ok"); return

        if path == "/" and method == "GET":
            html = None
            try: html = (ASSETS / "admin.html").read_text("utf-8")
            except Exception: pass
            if html is None:
                await http_reply(writer, "200 OK", "ok"); return       # 管理台还没装，退回探测响应
            await http_reply(writer, "200 OK", html, "text/html; charset=utf-8"); return

        # 问卷的公开接口。填表的是外单位的人，给不了他们密码，所以这条路径没有门
        # ——门是房间号本身（猜不到），要更严就给问卷设访问码。
        # ⚠️ Caddy 上 /s/* 和 /api/survey/* 必须绕开 forward_auth，否则外人只看到登录页。
        if path.startswith("/api/survey/"):
            body = None
            if method == "POST":
                n = int(headers.get("content-length") or 0)
                raw = await reader.readexactly(n) if 0 < n <= MAX_PAYLOAD + (1 << 14) else b""
                try: body = json.loads(raw.decode("utf-8") or "{}")
                except Exception: body = {}
            try:
                r = survey_api(path, qs, body)
            except Exception as e:
                log("问卷接口出错", path, repr(e))
                r = {"ok": False, "error": "服务器出错了"}
            await http_reply(writer, "200 OK", json.dumps(r, ensure_ascii=False),
                             "application/json; charset=utf-8"); return

        # 同一批接口，两道门：/api/admin/*（人 · Caddy 上的 msauth）和
        # /api/agent/*（AI 和脚本 · 这里校验 Bearer 令牌）。业务逻辑只有一份。
        if path.startswith("/api/admin/") or path.startswith("/api/agent/"):
            agent = path.startswith("/api/agent/")
            if agent and not agent_ok(headers):
                log("agent 令牌不对", path)
                await http_reply(writer, "401 Unauthorized",
                                 json.dumps({"ok": False, "error": "令牌不对或没带；要 Authorization: Bearer <令牌>"},
                                            ensure_ascii=False),
                                 "application/json; charset=utf-8")
                return
            apath = "/api/admin/" + path[len("/api/agent/"):] if agent else path
            body = None
            if method == "POST":
                n = int(headers.get("content-length") or 0)
                raw = await reader.readexactly(n) if 0 < n <= 1 << 20 else b""
                try: body = json.loads(raw.decode("utf-8") or "{}")
                except Exception: body = {}
            # 审计：令牌能删房间，日志里得留下是谁按的什么。journalctl -u smrelay 看得到。
            if agent: log("agent", method, apath, (body or {}).get("action") or "")
            try:
                r = admin_api(apath, qs, body)
            except Exception as e:
                log("管理接口出错", apath, repr(e))
                r = {"ok": False, "error": str(e)}
            if isinstance(r, tuple):            # 导出：(content-type, bytes)
                ct, data = r
                fn = "slidesmith-live." + ("md" if "markdown" in ct else "csv")
                await http_reply(writer, "200 OK", data, ct,
                                 'Content-Disposition: attachment; filename="%s"\r\n' % fn)
                return
            await http_reply(writer, "200 OK", json.dumps(r, ensure_ascii=False),
                             "application/json; charset=utf-8"); return

        m = re.match(r"^/(r|q|s)/([A-Za-z0-9_-]{4,64})$", path)
        if m and method == "GET":
            html = page({"r": "remote.html", "q": "ask.html", "s": "survey.html"}[m.group(1)],
                        m.group(2), (qs.get("t") or [""])[0])
            if html is None:
                await http_reply(writer, "500 Internal Server Error", "页面缺失"); return
            await http_reply(writer, "200 OK", html, "text/html; charset=utf-8"); return

        if path == "/ws":
            room = (qs.get("room") or [""])[0]
            role = (qs.get("role") or [""])[0]
            key = headers.get("sec-websocket-key", "")
            if (not ROOM_RE.match(room) or role not in ROLES or not key
                    or "websocket" not in headers.get("upgrade", "").lower()):
                await http_reply(writer, "400 Bad Request", "bad request"); return
            accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
            writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                          "Connection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n" % accept).encode())
            await writer.drain()
            takeover = (qs.get("takeover") or ["0"])[0] == "1"
            passhash = re.sub(r"[^0-9a-f]", "", (qs.get("pass") or [""])[0].lower())[:64]
            await ws_session(WS(reader, writer), room, role, takeover, passhash)
            return

        await http_reply(writer, "404 Not Found", "not found")
    except asyncio.TimeoutError:
        try: writer.close()
        except Exception: pass
    except (ConnectionResetError, BrokenPipeError):
        pass
    except Exception as e:
        log("handle 出错", repr(e))
        try: writer.close()
        except Exception: pass


def migrate_json():
    """老版本把每个房间存成一个 .json。首次启动时把它们收进库，别丢历史。"""
    n = 0
    for f in sorted(DATA.glob("*.json")):
        rid = f.stem
        if not ROOM_RE.match(rid) or q1("SELECT id FROM room WHERE id=?", rid):
            continue
        try:
            d = json.loads(f.read_text("utf-8"))
        except Exception:
            continue
        qs_ = d.get("questions") or []
        ensure_room(rid, "")
        if qs_:
            sid = ex("INSERT INTO session(room,started,ended) VALUES(?,?,?)",
                     rid, qs_[0].get("ts", 0) // 1000 or int(time.time()),
                     d.get("updatedAt") or int(time.time())).lastrowid
            for it in qs_:
                ex("INSERT INTO item(session,kind,text,ts) VALUES(?,?,?,?)",
                   sid, "q", it.get("t", ""), (it.get("ts") or 0) // 1000)
        n += 1
    if n: log("迁移了 %d 个老房间进库" % n)


async def main():
    DATA.mkdir(parents=True, exist_ok=True)
    db(); migrate_json()
    asyncio.get_running_loop().create_task(drain_control())
    asyncio.get_running_loop().create_task(sweep_sessions())
    srv = await asyncio.start_server(handle, HOST, PORT)
    log("Slidesmith Live 起在 %s:%d · 库 %s · 页面 %s" % (HOST, PORT, DB, ASSETS))
    async with srv:
        await srv.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
