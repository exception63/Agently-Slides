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
  GET /health          存活探测
  GET /r/<room>        遥控 + 讲稿 + 问答主持页
  GET /q/<room>        学生提问页
  GET /ws?room=&role=  WebSocket
"""
import asyncio, base64, hashlib, json, os, pathlib, re, sqlite3, struct, sys, time
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
SESSION_GAP = 30 * 60          # 放映端下线满这么久，就认为这一场讲完了
DB = DATA / "live.db"


# ═══════════════════ 存储：一个 SQLite 文件 ═══════════════════
# 三层：课/活动（room）→ 场次（session）→ 条目（item）。
# 「一门课一个房间、每次开讲自动分一场」就落在这个结构上：
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
# 放映端一上线就开一场；下线满 SESSION_GAP 才算讲完。
# 中途刷新页面、网断一下重连，都还算同一场——现场这两件事天天发生。
def ensure_room(rid, name=""):
    if not q1("SELECT id FROM room WHERE id=?", rid):
        ex("INSERT INTO room(id,name,created) VALUES(?,?,?)", rid, name or "", int(time.time()))

def open_session(rid):
    ensure_room(rid)
    now = int(time.time())
    cur = q1("SELECT id, started FROM session WHERE room=? AND ended IS NULL ORDER BY id DESC LIMIT 1", rid)
    if cur:
        return cur["id"]                       # 还开着，接着用（刷新/断线重连不该另起一场）
    last = q1("SELECT id, ended FROM session WHERE room=? ORDER BY id DESC LIMIT 1", rid)
    if last and last["ended"] and now - last["ended"] < SESSION_GAP:
        ex("UPDATE session SET ended=NULL WHERE id=?", last["id"])   # 刚讲完又连回来 = 同一场
        return last["id"]
    return ex("INSERT INTO session(room,started) VALUES(?,?)", rid, now).lastrowid

def touch_session_end(rid):
    """放映端下线：先记个结束时间；真正判定讲完由清扫任务在 SESSION_GAP 后做。"""
    ex("UPDATE session SET ended=? WHERE room=? AND ended IS NULL", int(time.time()), rid)

def bump_peak(rid, n):
    r = q1("SELECT id, peak FROM session WHERE room=? ORDER BY id DESC LIMIT 1", rid)
    if r and n > (r["peak"] or 0):
        ex("UPDATE session SET peak=? WHERE id=?", n, r["id"])

def current_session(rid):
    r = q1("SELECT id FROM session WHERE room=? ORDER BY id DESC LIMIT 1", rid)
    return r["id"] if r else open_session(rid)


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
        if role == "deck" and not room.socks["deck"]:
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

# ═══════════════════ 管理台 API ═══════════════════
# 门由 Caddy 的 forward_auth 把（复用 MySpace 的 msauth，密码天然同一个）。
# 这里假定「能走到这儿的就是本人」——服务只监听 127.0.0.1，绕不过去。
def csv_escape(v):
    v = "" if v is None else str(v)
    return '"' + v.replace('"', '""') + '"' if any(c in v for c in ',"\n\r') else v

def admin_api(path, qs, body):
    now = int(time.time())

    if path == "/api/admin/overview":
        rooms = []
        for r in qa_("SELECT * FROM room WHERE archived=0 ORDER BY created DESC"):
            live = ROOMS.get(r["id"])
            st = q1("SELECT id,started,ended,peak FROM session WHERE room=? ORDER BY id DESC LIMIT 1", r["id"])
            n = q1("SELECT COUNT(*) c FROM item WHERE session IN (SELECT id FROM session WHERE room=?)", r["id"])["c"]
            ns = q1("SELECT COUNT(*) c FROM session WHERE room=?", r["id"])["c"]
            rooms.append({
                "id": r["id"], "name": r["name"], "created": r["created"],
                "sessions": ns, "items": n,
                "online": {"deck": len(live.socks["deck"]) if live else 0,
                           "remote": len(live.socks["remote"]) if live else 0,
                           "ask": len(live.socks["ask"]) if live else 0} if live else None,
                "wallNow": len(live.questions) if live else 0,
                "closed": bool(live.closed_qa) if live else False,
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
                "items": [{"id": r["id"], "t": r["text"], "ts": r["ts"], "hidden": bool(r["hidden"])} for r in rows]}

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
        live = ROOMS.get(rid)
        if not live: return {"ok": False, "error": "这个房间现在没人连着"}
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
            body_ = "\n".join("%d. %s　`%s`%s" % (i + 1, r["text"], tf(r["ts"]),
                                                  "　（现场已撤下）" if r["hidden"] else "")
                               for i, r in enumerate(rows))
            return ("text/markdown; charset=utf-8", (head + body_ + "\n").encode("utf-8"))
        out = "\ufeff序号,时间,问题,现场是否撤下\n"     # BOM：Excel 打开中文才不乱码
        for i, r in enumerate(rows):
            out += "%d,%s,%s,%s\n" % (i + 1, csv_escape(tf(r["ts"])), csv_escape(r["text"]),
                                      "是" if r["hidden"] else "否")
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
    """放映端下线满 SESSION_GAP 就把那一场封存（ended 已写，这里只做日志和收敛）。"""
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

        if path.startswith("/api/admin/"):
            body = None
            if method == "POST":
                n = int(headers.get("content-length") or 0)
                raw = await reader.readexactly(n) if 0 < n <= 1 << 20 else b""
                try: body = json.loads(raw.decode("utf-8") or "{}")
                except Exception: body = {}
            try:
                r = admin_api(path, qs, body)
            except Exception as e:
                log("管理接口出错", path, repr(e))
                r = {"ok": False, "error": str(e)}
            if isinstance(r, tuple):            # 导出：(content-type, bytes)
                ct, data = r
                fn = "slidesmith-live." + ("md" if "markdown" in ct else "csv")
                await http_reply(writer, "200 OK", data, ct,
                                 'Content-Disposition: attachment; filename="%s"\r\n' % fn)
                return
            await http_reply(writer, "200 OK", json.dumps(r, ensure_ascii=False),
                             "application/json; charset=utf-8"); return

        m = re.match(r"^/(r|q)/([A-Za-z0-9_-]{4,64})$", path)
        if m and method == "GET":
            html = page("remote.html" if m.group(1) == "r" else "ask.html",
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
