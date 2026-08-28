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
import asyncio, base64, hashlib, json, os, pathlib, re, struct, sys, time
from urllib.parse import urlparse, parse_qs, unquote

HOST = os.environ.get("SMRELAY_HOST", "127.0.0.1")
PORT = int(os.environ.get("SMRELAY_PORT", "8092"))
DATA = pathlib.Path(os.environ.get("SMRELAY_DATA", "/var/lib/smrelay"))
ASSETS = pathlib.Path(os.environ.get("SMRELAY_ASSETS", str(pathlib.Path(__file__).parent)))

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
ROLES = ("deck", "remote", "ask", "wall", "host")
ROOM_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
MAX_LEN, MAX_KEEP, MIN_GAP = 200, 300, 4.0     # 单条字数 / 留存条数 / 同设备提交间隔（秒）
MAX_ROOMS = 200

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
            await room.to(("wall", "host"), {"type": "qa-new", "q": item, "total": len(room.questions)})
            await ws.send_json({"type": "qa-ack", "ok": True, "total": len(room.questions)})
            return

        if role == "ask":                        # 控制键只认 host / wall
            return

        if t == "qa-clear":
            room.questions = []; room._save()
            await room.to(("wall", "host"), {"type": "qa-cleared"})
        elif t == "qa-hide" and d.get("id"):
            room.questions = [q for q in room.questions if q["id"] != d["id"]]; room._save()
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


async def ws_session(ws, room_name, role, takeover=False):
    room = room_of(room_name)
    ws.room, ws.role = room, role

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

        if path in ("/", "/health"):
            await http_reply(writer, "200 OK", "ok"); return

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
            await ws_session(WS(reader, writer), room, role, takeover)
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


async def main():
    DATA.mkdir(parents=True, exist_ok=True)
    srv = await asyncio.start_server(handle, HOST, PORT)
    log("smrelay 起在 %s:%d · 数据 %s · 页面 %s" % (HOST, PORT, DATA, ASSETS))
    async with srv:
        await srv.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
