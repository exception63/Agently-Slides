#!/usr/bin/env python3
"""回归：CLI 自己发起的「孤儿轮次」不能被算成用户下一句的答案。

2026-08-21 真机事故：用户在 app 里说完话，面板**秒回**一段和他无关的旧回复，
他的请求看着像没执行。真相是——之前 Claude 起过一个后台 Bash，任务跑完时 CLI
自己起了一轮（`<task-notification>` → 模型回一句 → 一个 result）。那时没人在读
stdout，这一整轮就躺在管子里；用户下一句进来，`_pump` 第一行读到的就是它，
碰上它的 result 立刻收工。**答案从此永久错位一格**，而且每多一次后台任务错得更远。

跑：  python3 scripts/verify-bridge-orphan.py
"""
import importlib.util, os, pathlib, sys, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
FAKE = ROOT / "scripts/fixtures/fake-claude-stream.py"

checks = []
def ok(name, cond, extra=""):
    checks.append((name, bool(cond), extra))
    print(("✓ " if cond else "✗ ") + name + (f"  — {extra}" if extra else ""))


def load_bridge():
    spec = importlib.util.spec_from_file_location(
        "claude_bridge", ROOT / "apps/SlidesmithStudio/bridge/claude-bridge.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_turn(session, text):
    """跑一轮，返回这一轮 result 里的正文。"""
    out = []
    for line in session.ask(text):
        out.append(line)
    import json
    for line in reversed(out):
        rec = json.loads(line)
        if rec.get("type") == "result":
            return rec.get("result", "")
    return ""


def scenario(label, split):
    os.environ["FAKE_ORPHAN_AFTER"] = "1"
    os.environ["FAKE_ORPHAN_DELAY"] = "0.4"
    os.environ["FAKE_ORPHAN_SPLIT"] = str(split)
    bridge = load_bridge()
    bridge.CLAUDE = sys.executable          # 让 _claude_args 起我们的假 CLI
    real_args = bridge._claude_args
    bridge._claude_args = lambda *a, **k: [sys.executable, str(FAKE)]
    try:
        s = bridge.Session("fake-" + label, "sonnet", "default")
        first = run_turn(s, "第一句")
        ok(f"[{label}] 第一轮拿到自己的答案", first == "ANSWER<第一句>", first)

        # 关键：这段时间里没人读 stdout —— 孤儿轮次就在这时候落进管子。
        # **别把 split 加进来**：split>0 的用意就是让排干发生在它吐一半的时候，
        # 等满了就退化成上一个场景（问过一次，那次这条断言等于没测）。
        time.sleep(1.0)

        second = run_turn(s, "第二句：帮我重画箭头")
        if split:
            ok(f"[{label}] 排干时确实抓到「吐了一半」的那一轮",
               s.orphan_split_seen, f"orphan_split_seen={s.orphan_split_seen}")
        ok(f"[{label}] 第二轮**不是**秒回的孤儿轮次",
           "ORPHAN" not in second, second)
        ok(f"[{label}] 第二轮拿到的是自己的答案",
           second == "ANSWER<第二句：帮我重画箭头>", second)
        ok(f"[{label}] 孤儿轮次被记账（不是静默吞掉）",
           s.orphan_turns >= 1, f"orphan_turns={s.orphan_turns}")
        ok(f"[{label}] 孤儿正文留了存档",
           any("ORPHAN" in t for t in s.snapshot()["orphan_last"]),
           str(s.snapshot()["orphan_last"]))

        third = run_turn(s, "第三句")
        ok(f"[{label}] 第三轮没有跟着错位", third == "ANSWER<第三句>", third)
        s.close()
    finally:
        bridge._claude_args = real_args


# ① 孤儿轮次在两句之间「整轮」落进管子
scenario("整轮落下", 0)
# ② 排干的那一刻它正吐到一半（assistant 到了、result 还没到）
scenario("吐一半", 1.6)

bad = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(bad)}/{len(checks)} 通过")
sys.exit(1 if bad else 0)
