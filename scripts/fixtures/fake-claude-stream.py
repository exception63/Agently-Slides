#!/usr/bin/env python3
"""假 `claude`，只讲 stream-json 那套协议 —— 给 verify-bridge-orphan.py 当被试。

它专门复现真 CLI 的一个行为：**会自己发起没有用户输入的轮次**（后台任务跑完时
harness 塞一条 task-notification 进去，模型回一句，照样吐一整轮加一个 result）。
真 CLI 上要凑出这个时机得跑一个慢的后台命令再等它，慢且随机；这里直接按秒安排。

环境变量：
  FAKE_ORPHAN_AFTER   第几轮结束后放一个孤儿轮次（默认 1；0 = 不放）
  FAKE_ORPHAN_DELAY   那之后隔几秒放（默认 0.4）
  FAKE_ORPHAN_SPLIT   >0 则孤儿轮次的 assistant 和 result 之间再隔这么久
                      （模拟「排干时它正吐到一半」）
"""
import json, os, sys, threading, time

ORPHAN_AFTER = int(os.environ.get("FAKE_ORPHAN_AFTER", "1"))
ORPHAN_DELAY = float(os.environ.get("FAKE_ORPHAN_DELAY", "0.4"))
ORPHAN_SPLIT = float(os.environ.get("FAKE_ORPHAN_SPLIT", "0"))

# **一次只跑一轮，锁要罩住整轮。** 真 CLI 有个输入队列（transcript 里那对
# `queue-operation enqueue/dequeue` 就是它），孤儿轮次和用户那句永远是先后关系，
# 绝不会两轮的行在 stdout 上交织。锁只罩单行 emit 的话，这个假货会吐出真 CLI
# 吐不出来的顺序，然后拿它去"测"出一个根本不存在的 bug。
_turn = threading.Lock()


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def turn(text):
    with _turn:
        emit({"type": "assistant",
              "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}})
        if ORPHAN_SPLIT and text.startswith("ORPHAN"):
            time.sleep(ORPHAN_SPLIT)     # 这一轮吐到一半就停住，模拟"排干时它正说着"
        emit({"type": "result", "subtype": "success", "is_error": False, "result": text})


emit({"type": "system", "subtype": "init", "session_id": "fake"})

n = 0
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        rec = json.loads(line)
    except json.JSONDecodeError:
        continue
    if rec.get("type") != "user":       # control_request 之类的忽略
        continue
    content = rec["message"]["content"]
    text = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
    n += 1
    turn("ANSWER<" + text.strip().splitlines()[-1][:40] + ">")
    if ORPHAN_AFTER and n == ORPHAN_AFTER:
        threading.Timer(ORPHAN_DELAY, turn, args=("ORPHAN-BACKGROUND-NOTICE",)).start()
