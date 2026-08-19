#!/usr/bin/env python3
"""Slidesmith Studio.app 的 Claude 桥接 —— 让 app 里那个对话框就是你终端里的 Claude Code。

形状（和 OmniSecretary 的 `bridge/omni-bridge.py` 是同一个，这份是它的移植）：

    Slidesmith Studio.app ──HTTP/SSE──▶ claude-bridge.py ──▶ claude（常驻会话）
                                                              cwd = presentsystems 仓库根

**它不解析、不改写、不注入任何提示词**，把 `claude` stdout 的每一行 JSON 原样以 SSE
转发。所以 app 里那个面板拿到的和终端里一模一样：

- skill 能用（`/slidesmith:editorial-slides`、`/slidesmith:slidesmith` …）
- MCP 能用（`slidesmith_apply_patch` 把改动直接推进 Studio 的 WebView）
- CLAUDE.md / AGENTS.md 生效（工作目录就是本仓库）
- `_memory/`、`packages/` 它直接读得到、改得动

## 和 OmniSecretary 那份的差别

| | OmniSecretary | 这份 |
|---|---|---|
| 监听 | `::` 双栈 + 口令 + Bonjour（头显/手机要连） | **只听回环**——只有本机 app 用它 |
| 设备通道 | DeviceHub / vision_* / phone_* 工具 | 没有。Slidesmith 的"设备"是 WebView，走 node 那条桥 |
| 端口 | 8931 | **8991**（见 skill `connect-to-claude` 的 reference/ports.md） |
| 事实注入 | 时间锚点 + 哪块屏幕 | 时间锚点 + **现在 Studio 里开着哪个 deck** |

常驻/预热/会话池那些是原样搬过来的，包括几条真机上栽出来的坑（正忙时不算闲、
见过的 session id 一律 `--resume`、stderr 必须一直有人读、客户端半路断开要丢进程）。
**改这些之前先去读 OmniSecretary `docs/bridge.md`**，那些注释是事故报告不是装饰。

用法：

    ./apps/SlidesmithStudio/bridge/claude-bridge.py

app 会自己拉起它，退出时连常驻会话一起收掉。
"""
from __future__ import annotations

import datetime
import json
import os
import pathlib
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 脚本在 <repo>/apps/SlidesmithStudio/bridge/ 下，往上三级才是仓库根。
BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BRIDGE_DIR, "..", "..", ".."))
PORT = int(os.environ.get("SLIDESMITH_BRIDGE_PORT", "8991"))
PORT_FILE = os.path.join(BRIDGE_DIR, ".port")

# node 那条桥（deck / Studio）的地址。只用来问"现在开着哪个 deck"，问不到就不贴。
DECK_BRIDGE = os.environ.get("SLIDESMITH_DECK_BRIDGE", "http://127.0.0.1:8765")

# 面板和 app 都弹不出确认框，低档位只是把失败伪装成谨慎。默认放开，档位在 app 里改。
PERMISSION_MODE = os.environ.get("SLIDESMITH_BRIDGE_PERMISSION_MODE", "bypassPermissions")

MODE = os.environ.get("SLIDESMITH_BRIDGE_MODE", "onDemand")      # off | onDemand | always
IDLE_MINUTES = float(os.environ.get("SLIDESMITH_BRIDGE_IDLE_MINUTES", "10"))
# 一轮跑过这么久还没完，按卡死处理照收不误——否则真挂住的会话会永远赖着。
HARD_TURN_LIMIT = float(os.environ.get("SLIDESMITH_BRIDGE_TURN_LIMIT_SECONDS", "1800"))
MAX_SESSIONS = int(os.environ.get("SLIDESMITH_BRIDGE_MAX_SESSIONS", "4"))

INSTANCE_ID = str(uuid.uuid4())[:8]

VALID_EFFORTS = ("low", "medium", "high", "xhigh", "max")


def _clean_effort(raw) -> str | None:
    """空串/None/不认识的一律当"没传"——传个空 `--effort` 给 CLI 是直接报错。"""
    if not isinstance(raw, str):
        return None
    value = raw.strip().lower()
    return value if value in VALID_EFFORTS else None


MODELS = [
    {"id": "fable", "label": "Fable · 叙事、创意向"},
    {"id": "opus", "label": "Opus · 最强，复杂改版/写内容"},
    {"id": "sonnet", "label": "Sonnet · 均衡，日常够用"},
    {"id": "haiku", "label": "Haiku · 最快，批量小活"},
]

CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")

# 预热用的那一句。**要求它一个字回完**——预热是为了把 MCP 工具定义、CLAUDE.md
# 和上下文缓存装好，不是让它说话。
#
# 唯一允许它做的事是把 slidesmith 那几个工具先加载进来：它们在这个 CLI 里是
# 延迟工具（deferred），不先加载的话用户第一句「把第 3 页改成…」会先白花一整轮
# 去 ToolSearch。预热跑在用户打字的那几秒里，这一轮不占他的时间。
SLIDESMITH_TOOL_NAMES = ",".join(
    f"mcp__plugin_slidesmith_slidesmith__{name}"
    for name in ("slidesmith_status", "slidesmith_connect", "slidesmith_get_requests",
                 "slidesmith_apply_patch", "slidesmith_open"))
DEFAULT_PRIME = (
    f"预热：用 ToolSearch 加载 select:{SLIDESMITH_TOOL_NAMES}，"
    "加载完只回「好」一个字。别做任何别的事，别调别的工具。"
)


def _claude_args(model: str, permission_mode: str, prompt: str | None,
                 effort: str | None = None) -> list[str]:
    """常驻和一次性只差一件事：`-p` 后面给不给话。

    给了 → 说完就退；不给、改成 `--input-format stream-json` → 它等 stdin，进程活着。

    `effort` / `model` / `permission_mode` 都是**进程的启动参数，不是每轮参数**：
    CLI 没有"这一轮临时换推理力度"这回事，换了就得换进程（见 `SessionPool.get`）。
    """
    args = [CLAUDE, "-p"]
    if prompt is not None:
        args.append(prompt)
    args += [
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--model", model,
        "--permission-mode", permission_mode,
    ]
    if effort:
        args += ["--effort", effort]
    if prompt is None:
        args += ["--input-format", "stream-json"]
    return args


_WEEKDAY = "一二三四五六日"


def time_anchor() -> str:
    """**每一轮都重新贴。** 常驻会话活得比一天长，只在开头贴一次的话，
    第二天它就在照昨天的日期干活。这一条事实顶得上一整排日期参数。"""
    now = datetime.datetime.now()
    return (f"〔现在〕{now:%Y-%m-%d %H:%M}（周{_WEEKDAY[now.weekday()]}）\n")


def deck_fact() -> str:
    """现在 Studio 里开着哪个 deck、连没连上。**问不到就什么都不贴。**

    和时间锚点是同一类东西：补一条它算不出来的事实，胜过写三套提示词模板。
    没有这一格的话，用户说「把第 3 页的标题改短点」，它得先花一轮去猜是哪份文件。
    """
    try:
        request = urllib.request.Request(f"{DECK_BRIDGE}/api/status")
        with urllib.request.urlopen(request, timeout=1.5) as resp:
            status = json.loads(resp.read(64 * 1024) or b"{}")
    except Exception:                                              # noqa: BLE001
        return ""
    name = status.get("deckName")
    if not name:
        return "〔环境〕用户正开着 Slidesmith Studio.app，但里面还没有打开任何 deck。\n"
    connected = bool(status.get("connected"))
    return ("〔环境〕用户正在 Slidesmith Studio.app 里编辑 deck：**" + str(name) + "**。"
            "改这份 deck 请用 slidesmith_apply_patch 回写（整段 `<section data-id>`），"
            "改完他屏幕上立刻就变；别去猜文件路径、别用 Write 覆盖整份文件。"
            + ("" if connected else "（注意：Studio 当前显示未连接）") + "\n")


def _user_message(text: str) -> str:
    """常驻会话的 stdin 吃的是 stream-json，一行一条用户消息。"""
    return json.dumps({
        "type": "user",
        "message": {"role": "user", "content": [{"type": "text", "text": text}]},
    }, ensure_ascii=False)


class Session:
    """一个活着的 claude 进程 = 一段常驻会话。

    **模型、权限档、effort 都是启动参数，不是每轮参数**——换任何一个都只能换进程。
    所以三个都记在这里；调用方拿着不一样的组合来要同一个 session 时，池子把旧的换掉。
    """

    def __init__(self, session_id: str, model: str, permission_mode: str,
                 effort: str | None = None, resume: bool = False):
        self.id = session_id
        self.model = model
        self.permission_mode = permission_mode
        self.effort = effort
        self.started_at = time.time()
        self.last_used = time.time()
        self.turns = 0
        # 一个进程同一时刻只能跑一轮：stdin 喂第二句时第一句还没吐完，
        # 两轮的输出会在同一个 stdout 上交织，谁也认不出哪行属于哪轮。
        self.lock = threading.Lock()
        self._stderr_tail: list[str] = []
        # 这一轮还在跑吗 / 从什么时候开始跑的。回收线程靠它分辨"闲着"和"正忙着"。
        self.busy = False
        self.turn_began = 0.0

        # **换进程时必须 `--resume` 而不是 `--session-id`。** 那个 id 已经在磁盘上
        # 存在了，拿它去开一段"新"会话会直接失败——表现是会话凭空消失。
        handle = ["--resume", session_id] if resume else ["--session-id", session_id]
        self.proc = subprocess.Popen(
            _claude_args(model, permission_mode, prompt=None, effort=effort) + handle,
            cwd=PROJECT_ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
            env={**os.environ, "CLAUDE_CODE_ENTRYPOINT": "slidesmith-bridge"},
        )
        # stderr 必须有人一直读。管道缓冲区满了写端就会阻塞，
        # 表现出来是"它突然不说话了"，而且看不出任何原因——常驻进程特有的坑。
        threading.Thread(target=self._drain_stderr, daemon=True).start()

    def _drain_stderr(self):
        for line in self.proc.stderr:
            self._stderr_tail.append(line.rstrip())
            del self._stderr_tail[:-40]

    @property
    def alive(self) -> bool:
        return self.proc.poll() is None

    @property
    def idle_for(self) -> float:
        """闲了多久。**一轮还在跑的时候不算闲。**

        OmniSecretary 上真机栽过：一轮跑了九分钟还在干活，闲置回收当场把它杀了，
        用户那边的表现是「问了，然后永远没有回复」。兜底仍保留 HARD_TURN_LIMIT。
        """
        if self.busy:
            stuck = time.time() - self.turn_began
            return stuck if stuck > HARD_TURN_LIMIT else 0.0
        return time.time() - self.last_used

    def ask(self, prompt: str):
        """喂一句，逐行 yield 出 Claude 的 JSON，直到这一轮的 `result`。"""
        with self.lock:
            if not self.alive:
                raise RuntimeError(f"会话已经死了：{self.stderr_tail()}")
            self.last_used = time.time()
            self.busy = True
            self.turn_began = time.time()
            try:
                yield from self._pump(prompt)
            finally:
                self.busy = False
                self.last_used = time.time()

    def _pump(self, prompt: str):
        self.proc.stdin.write(_user_message(prompt) + "\n")
        self.proc.stdin.flush()

        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError(f"会话中途退出：{self.stderr_tail()}")
            line = line.strip()
            if not line:
                continue
            yield line
            # `result` 是一轮的收尾。认它，不认别的——认错了下一轮的输出会被算进这一轮。
            try:
                if json.loads(line).get("type") == "result":
                    break
            except json.JSONDecodeError:
                continue
        self.turns += 1
        self.last_used = time.time()

    def prime(self, prompt: str) -> float:
        """空跑一轮，把结果丢掉。返回耗时。

        **为什么非要真跑一轮**：这个 CLI 不喂输入一个字都不吐，`Popen` 返回 ≠ 它
        准备好了，**没有就绪信号可等**。那几秒不是进程启动，是第一轮真在干活
        （装 MCP 工具定义、读 CLAUDE.md、然后才推理）。只有真走一轮才算热。
        """
        began = time.time()
        for _ in self.ask(prompt):
            pass
        return time.time() - began

    def stderr_tail(self) -> str:
        return "\n".join(self._stderr_tail[-8:]).strip()

    def close(self):
        if self.proc.poll() is None:
            try:
                self.proc.stdin.close()
            except OSError:
                pass
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()

    def snapshot(self) -> dict:
        return {
            "id": self.id, "model": self.model, "alive": self.alive,
            "permission_mode": self.permission_mode, "effort": self.effort,
            "turns": self.turns, "idle_for": round(self.idle_for, 1),
            "age": round(time.time() - self.started_at, 1),
        }


class SessionPool:
    """常驻会话的生命周期。**它不认识 HTTP**——换传输层不用动这里。"""

    def __init__(self, mode: str, idle_minutes: float):
        self.mode = mode
        self.idle_minutes = idle_minutes
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()
        threading.Thread(target=self._reap_loop, daemon=True).start()

    @property
    def resident(self) -> bool:
        return self.mode in ("onDemand", "always")

    @staticmethod
    def _seen_on_disk(session_id: str) -> bool:
        """这个 id 在磁盘上是否已有会话记录。

        resume 与否不能只看内存里的池子——磁盘记录比池子活得久。闲置回收或
        /stop 把会话 pop 掉之后，同一个 id 再走 `--session-id`，claude 会秒退
        `Session ID already in use`（stdout 一个字不吐），表现是那个会话永远
        复活不了。**见过的 id 一律 `--resume`。**
        """
        munged = re.sub(r"[^A-Za-z0-9]", "-", PROJECT_ROOT)
        record = pathlib.Path.home() / ".claude" / "projects" / munged / f"{session_id}.jsonl"
        return record.exists()

    def get(self, session_id: str | None, model: str,
            permission_mode: str = PERMISSION_MODE, effort: str | None = None) -> Session:
        """拿一个能用的常驻会话。没有就起一个；模型/权限档/effort 变了就换一个。"""
        sid = session_id or str(uuid.uuid4())
        victims: list[Session] = []
        with self._lock:
            existing = self._sessions.get(sid)
            if (existing and existing.alive and existing.model == model
                    and existing.permission_mode == permission_mode
                    and existing.effort == effort):
                # 拿到手到开跑之间有条缝，刷一下免得回收线程恰好钻进去
                existing.last_used = time.time()
                return existing
            if existing:
                # 模型/权限档/effort 换了，或者进程死了。**旧的必须先关**——
                # 同一个 id 的旧进程不退，`--resume` 会撞 "already in use"。
                existing.close()
                self._sessions.pop(sid, None)
            # 池子超上限：踢最旧的闲置（正忙的不动）。close 放锁外，别拿着锁等 3 秒。
            if len(self._sessions) >= MAX_SESSIONS:
                idle = sorted((s for s in self._sessions.values() if not s.busy),
                              key=lambda s: s.last_used)
                overflow = len(self._sessions) - MAX_SESSIONS + 1
                for s in idle[:overflow]:
                    victims.append(s)
                    self._sessions.pop(s.id, None)
            session = Session(sid, model, permission_mode, effort=effort,
                              resume=existing is not None or self._seen_on_disk(sid))
            self._sessions[sid] = session
        for s in victims:
            s.close()
            print(f"· 会话 {s.id[:8]} 被挤出池子（上限 {MAX_SESSIONS}），退了", flush=True)
        return session

    def drop(self, session_id: str) -> bool:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.close()
        return session is not None

    def _reap_loop(self):
        while True:
            time.sleep(20)
            limit = self.idle_minutes * 60
            with self._lock:
                # 死会话**任何档都收**；闲置回收才是 onDemand 独有的。
                doomed = [(s, "闲够了" if s.alive else "已经死了")
                          for s in self._sessions.values()
                          if not s.alive
                          or (self.mode == "onDemand" and s.idle_for > limit)]
                for s, _ in doomed:
                    self._sessions.pop(s.id, None)
            for s, why in doomed:
                idle = s.idle_for            # close() 之前取，之后这个数就没意义了
                s.close()
                print(f"· 会话 {s.id[:8]} {why}（闲了 {idle/60:.0f} 分钟），退了", flush=True)

    def snapshot(self) -> dict:
        with self._lock:
            sessions = [s.snapshot() for s in self._sessions.values()]
        return {
            "mode": self.mode,
            "resident": self.resident,
            "idle_minutes": self.idle_minutes,
            "sessions": sessions,
        }

    def close_all(self):
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for s in sessions:
            s.close()


POOL = SessionPool(MODE, IDLE_MINUTES)


class Handler(BaseHTTPRequestHandler):

    protocol_version = "HTTP/1.1"
    # 连上不发数据的对端不能永久占一个线程。只影响 socket 读；
    # SSE 长回答期间我们在读 claude 而不是读 socket，不受影响。
    timeout = 30

    def log_message(self, fmt, *args):  # 静音，别刷屏（我们自己在 do_* 里记）
        pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            self.close_connection = True

    # ---------- 工具 ----------

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length > 8 * 1024 * 1024:      # 按长度无上限一次读入 = 白送的内存放大器
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def _sse_open(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

    def _sse(self, payload: str):
        self.wfile.write(f"data: {payload}\n\n".encode())
        self.wfile.flush()

    def _bridge_event(self, event: str, **fields):
        self._sse(json.dumps({"type": "bridge", "event": event, **fields},
                             ensure_ascii=False))

    # ---------- 路由 ----------

    def do_GET(self):
        print(f"· → {self.path}", flush=True)
        if self.path == "/health":
            self._json({
                "ok": os.path.exists(CLAUDE),
                # **身份必须报出来。** 客户端探端口时不能只看"有个健康的东西答了"——
                # 桥被占会顺延，顺延到邻居的段里就会连上**别的项目**的桥，
                # 那个 claude 的工作目录是另一个仓库，表现是"它答得头头是道但全错"。
                "app": "SlidesmithStudio",
                "instance": INSTANCE_ID,
                "claude": CLAUDE,
                "cwd": PROJECT_ROOT,
                "models": MODELS,
                "permission_mode": PERMISSION_MODE,
                "deck_bridge": DECK_BRIDGE,
                **POOL.snapshot(),
            })
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        print(f"· → {self.path}", flush=True)
        route = {
            "/chat": self._chat,
            "/warmup": self._warmup,
            "/stop": self._stop,
            "/config": self._config,
            "/quit": self._quit,
        }.get(self.path)
        if route is None:
            self._json({"error": "not found"}, 404)
            return
        route()

    def _quit(self):
        """让 app 能把桥接关掉（用来重启）。

        **改了这个脚本必须重启才生效**，而桥接是 app 悄悄拉起来的：没有这个端点，
        用户唯一的办法是去终端里翻进程 `kill`——那不叫开关。
        """
        self._json({"quitting": True})
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def _warmup(self):
        """把会话先热好，不占用用户的第一句话。

        冷启动那几秒躲不掉，但**可以藏在用户打字的那几秒里**：输入框一获得焦点
        就调它，等他打完，进程已经热了。
        """
        body = self._read_body()          # rfile 只能读一次，别在下面重复调
        if not POOL.resident:
            self._json({"warmed": False, "reason": "当前是 off 档，不常驻"})
            return
        model = body.get("model") or "sonnet"
        sid = body.get("session_id")
        prime = body.get("prime") or DEFAULT_PRIME
        perm = body.get("permission_mode") or PERMISSION_MODE
        effort = _clean_effort(body.get("effort"))
        began = time.time()
        try:
            session = POOL.get(sid, model, perm, effort)
            cold = session.turns == 0
            if cold:
                session.prime(prime)
        except Exception as exc:                                   # noqa: BLE001
            self._json({"warmed": False, "error": str(exc)}, 500)
            return
        self._json({
            "warmed": True, "session_id": session.id, "model": session.model,
            "was_cold": cold,
            "took": round(time.time() - began, 3),
        })

    def _stop(self):
        sid = self._read_body().get("session_id", "")
        self._json({"stopped": POOL.drop(sid)})

    def _config(self):
        """改档位 / 改空闲超时。改成 off 会顺手把常驻的都关掉。"""
        body = self._read_body()
        mode = body.get("mode")
        if mode in ("off", "onDemand", "always"):
            POOL.mode = mode
            if mode == "off":
                POOL.close_all()
        if isinstance(body.get("idle_minutes"), (int, float)):
            POOL.idle_minutes = float(body["idle_minutes"])
        self._json(POOL.snapshot())

    def _chat(self):
        body = self._read_body()
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            self._json({"error": "empty prompt"}, 400)
            return
        model = body.get("model") or "sonnet"
        session_id = body.get("session_id") or ""
        perm = body.get("permission_mode") or PERMISSION_MODE
        effort = _clean_effort(body.get("effort"))

        # 两条它算不出来的事实，每轮重贴。`facts=false` 可以关掉（给"原样转发"的场景）。
        if body.get("facts") is False:
            head = ""
        else:
            head = time_anchor() + deck_fact() + "以下是用户说的话：\n"
        prompt = head + prompt

        if POOL.resident:
            self._chat_resident(prompt, model, session_id, perm, effort)
        else:
            self._chat_oneshot(prompt, model, session_id, perm, effort)

    def _chat_resident(self, prompt: str, model: str, session_id: str, perm: str,
                       effort: str | None = None):
        began = time.time()
        try:
            session = POOL.get(session_id or None, model, perm, effort)
        except Exception as exc:                                   # noqa: BLE001
            self._json({"error": f"起会话失败：{exc}"}, 500)
            return

        self._sse_open()
        self._bridge_event("start", session_id=session.id, model=model,
                           permission_mode=perm, resident=True,
                           cold_start=session.turns == 0)
        # `ask` 是生成器，锁在它里面。客户端半路断开时 `for` 会带着异常跳出，
        # **生成器停在原地、锁还攥着**——下一句就永远拿不到这个会话了。
        # 所以显式 close()，别指望 GC 来收。
        turn = session.ask(prompt)
        try:
            for line in turn:
                self._sse(line)
        except (BrokenPipeError, ConnectionResetError):
            # 客户端半路走了，但 claude 还在跑这一轮，残留输出没人排干——留着这个
            # 进程的话，下一问会先读到上一问的剩余输出，答案从此**永久错位一格**
            # （静默给错答案，比不回答危险一个量级）。丢进程不丢磁盘记录，
            # 下一句靠 `--resume` 无缝接上。
            POOL.drop(session.id)
            return
        except Exception as exc:                                   # noqa: BLE001
            POOL.drop(session.id)
            self._bridge_event("error", message=str(exc))
        finally:
            turn.close()
        self._bridge_event("done", took=round(time.time() - began, 3))

    def _chat_oneshot(self, prompt: str, model: str, resume: str, perm: str,
                      effort: str | None = None):
        """off 档：老路子，每轮一个进程。留着是因为它零常驻开销。"""
        session_id = resume or str(uuid.uuid4())
        cmd = _claude_args(model, perm, prompt=prompt, effort=effort)
        cmd += ["--resume", resume] if resume else ["--session-id", session_id]

        self._sse_open()
        self._bridge_event("start", session_id=session_id, model=model,
                           permission_mode=perm, resident=False)
        began = time.time()
        try:
            proc = subprocess.Popen(
                cmd, cwd=PROJECT_ROOT,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, bufsize=1,
                env={**os.environ, "CLAUDE_CODE_ENTRYPOINT": "slidesmith-bridge"},
            )
        except Exception as exc:                                   # noqa: BLE001
            self._bridge_event("error", message=str(exc))
            return
        # stderr 必须一直有人读：--verbose 下超过 64KB 管道就互等死锁。
        stderr_tail: list[str] = []

        def _drain():
            for raw in proc.stderr:
                stderr_tail.append(raw.rstrip())
                del stderr_tail[:-40]

        threading.Thread(target=_drain, daemon=True).start()
        try:
            for line in proc.stdout:
                line = line.strip()
                if line:
                    self._sse(line)
        except (BrokenPipeError, ConnectionResetError):
            proc.terminate()
            return
        if proc.wait() != 0:
            err = "\n".join(stderr_tail[-8:]).strip()[-2000:]
            self._bridge_event("error", message=err or f"claude 退出码 {proc.returncode}")
        self._bridge_event("done", took=round(time.time() - began, 3))


def main():
    if not os.path.exists(CLAUDE):
        print(f"✗ 找不到 claude 可执行文件：{CLAUDE}", file=sys.stderr)
        sys.exit(1)
    if MODE not in ("off", "onDemand", "always"):
        print(f"✗ SLIDESMITH_BRIDGE_MODE 只能是 off / onDemand / always，收到 {MODE}",
              file=sys.stderr)
        sys.exit(1)

    # 分裂脑防线：默认口上已经有实例时，**请它退位、自己接管**（不是自己退出让位）。
    # 理由见 OmniSecretary 的同名段落：一个 HTTP 还应答、但内部已经坏掉的旧实例
    # 会被永久钉在端口上，用户重启 app 都没用。改了脚本本来也就是要让新代码生效。
    try:
        request = urllib.request.Request(f"http://127.0.0.1:{PORT}/quit", method="POST")
        with urllib.request.urlopen(request, timeout=2) as resp:
            resp.read(256)
        print(f"· {PORT} 上原来有个桥接，已请它退位，本实例接管", flush=True)
        # 等它把端口真的放开——`shutdown()` 是另起线程做的，不是立刻完成。
        for _ in range(20):
            time.sleep(0.25)
            probe = socket.socket()
            try:
                probe.settimeout(0.2)
                probe.connect(("127.0.0.1", PORT))
            except OSError:
                break               # 连不上了 = 它退干净了
            finally:
                probe.close()
    except Exception:                                              # noqa: BLE001
        pass    # 没人在跑，或者占着这个口的不是我们的桥接 → 照常绑定/顺延

    # **只听回环。** 和 OmniSecretary 不同，这里没有头显/手机要连——只有本机 app
    # 用它，而它背后是一个能在仓库目录里跑任意命令的 Claude。不开就是最好的鉴权。
    server = None
    port = PORT
    for candidate in range(PORT, PORT + 12):
        try:
            ThreadingHTTPServer.allow_reuse_address = True
            server = ThreadingHTTPServer(("127.0.0.1", candidate), Handler)
            port = candidate
            break
        except OSError:
            continue
    if server is None:
        print(f"✗ {PORT}–{PORT + 11} 全被占用了", file=sys.stderr)
        sys.exit(1)

    # **只有拿到默认口的那个实例才碰 `.port`。** 顺延上去的基本都是临时实例
    # （回归脚本、手工调试），让它们覆盖这条记录只会指错地方。
    owns_port_file = "SLIDESMITH_BRIDGE_PORT" not in os.environ and port == PORT
    if owns_port_file:
        with open(PORT_FILE, "w") as fh:
            fh.write(str(port))

    print(f"✓ Slidesmith Claude 桥接已启动  http://127.0.0.1:{port}", flush=True)
    print(f"  工作目录：{PROJECT_ROOT}")
    print(f"  权限模式：{PERMISSION_MODE}")
    print(f"  deck 桥：{DECK_BRIDGE}")
    print(f"  常驻档位：{MODE}" + (f"（空闲 {IDLE_MINUTES:g} 分钟自动退）"
                                   if MODE == "onDemand" else ""))
    print("  Ctrl-C 退出", flush=True)

    # SIGTERM 也要走收尾，否则被 kill（app 退出时就是）的时候常驻的 claude
    # 会变成孤儿留在系统里。**`shutdown()` 必须另起线程调**——信号处理器跑在
    # 主线程上，而主线程正卡在 `serve_forever()` 里，直接调必死锁。
    signal.signal(
        signal.SIGTERM,
        lambda *_: threading.Thread(target=server.shutdown, daemon=True).start(),
    )

    if MODE == "always":
        session = POOL.get(None, "sonnet")
        print("  预热中…", flush=True)
        print(f"  已预热一个 sonnet 会话（{session.prime(DEFAULT_PRIME):.1f} 秒）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print("\n正在关闭常驻会话…")
        POOL.close_all()
        if owns_port_file:
            try:
                os.remove(PORT_FILE)
            except OSError:
                pass
        print("已停止", flush=True)


if __name__ == "__main__":
    main()
