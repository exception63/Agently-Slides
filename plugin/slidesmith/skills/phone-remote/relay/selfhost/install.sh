#!/bin/bash
# 在服务器上装 / 更新 smrelay。幂等，反复跑安全。
# 用法（在服务器上）：sudo bash /tmp/install.sh
set -euo pipefail
SRC=${SRC:-/tmp/smrelay}
DST=/opt/smrelay

id -u smrelay >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin smrelay
install -d -o root -g root -m 755 "$DST"
install -o root -g root -m 644 "$SRC/smrelay.py" "$SRC/remote.html" "$SRC/ask.html" \
        "$SRC/admin.html" "$SRC/survey.html" "$DST/"
install -d -o smrelay -g smrelay -m 750 /var/lib/smrelay
install -o root -g root -m 644 "$SRC/smrelay.service" /etc/systemd/system/smrelay.service

# 每日数据快照 → /srv/myspace/files/，由现有的 `myspace sync pull` 顺手带回本地。
# 不另起一套备份体系：多一套就多一处会悄悄坏掉的地方。
install -o root -g root -m 755 "$SRC/smrelay-backup" /usr/local/bin/smrelay-backup
install -o root -g root -m 644 "$SRC/smrelay-backup.service" /etc/systemd/system/smrelay-backup.service
install -o root -g root -m 644 "$SRC/smrelay-backup.timer" /etc/systemd/system/smrelay-backup.timer

# AI / 脚本用的 API 令牌。第一次装时随机生成，之后**不覆盖**（覆盖了 Mac 上那份就失效）。
# root:smrelay 0640 —— 服务读得到，别人读不到。要换令牌：删掉这个文件再跑一次 install.sh。
install -d -o root -g smrelay -m 750 /etc/smrelay
if [ ! -s /etc/smrelay/token ]; then
  head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-40 > /etc/smrelay/token
  chown root:smrelay /etc/smrelay/token
  chmod 640 /etc/smrelay/token
  echo "· 新建了 API 令牌"
fi

python3 -c "import ast;ast.parse(open('$DST/smrelay.py').read())"   # 语法先过，别把坏文件推上线

systemctl daemon-reload
systemctl enable smrelay >/dev/null
systemctl enable --now smrelay-backup.timer >/dev/null
systemctl restart smrelay
sleep 1
systemctl is-active --quiet smrelay && echo "✓ smrelay 已运行" || { journalctl -u smrelay -n 30 --no-pager; exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:8092/health && echo " ← 本机自测通过"

# 令牌自测：拿真令牌打一次 /api/agent/whoami，装完就知道这道门通不通
TOK=$(cat /etc/smrelay/token)
if curl -fsS --max-time 5 -H "Authorization: Bearer $TOK" http://127.0.0.1:8092/api/agent/whoami | grep -q '"ok": *true'; then
  echo "✓ API 令牌门通过"
else
  echo "✗ API 令牌门不通 —— 看 journalctl -u smrelay -n 30"; exit 1
fi

# Caddy：把片段并进去（只在还没有的时候）
# Caddy 片段每次都按最新的**替换**（不是"有就跳过"）——认证规则改了必须跟上，
# 跳过等于让带删除按钮的管理台继续裸奔。
cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
if true; then
  python3 - "$SRC/caddy-snippet.conf" <<'PY'
import sys, pathlib, re
snippet = pathlib.Path(sys.argv[1]).read_text().rstrip()
p = pathlib.Path("/etc/caddy/Caddyfile")
s = p.read_text()
# 先把旧的 live 块整段摘掉（从 "live.zhouliying.com {" 到配平的右花括号）
i = s.find("live.zhouliying.com {")
if i >= 0:
    d, j = 0, i
    while j < len(s):
        if s[j] == "{": d += 1
        elif s[j] == "}":
            d -= 1
            if d == 0: break
        j += 1
    s = (s[:i] + s[j + 1:]).replace("\n\n\n\n", "\n\n")
marker = "*.zhouliying.com, *.03060607.xyz {"
assert marker in s, "找不到通配符段，请手工并入"
p.write_text(s.replace(marker, snippet + "\n\n" + marker, 1))
PY
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    systemctl reload caddy && echo "✓ Caddy 已加载 live.zhouliying.com"
  else
    echo "✗ Caddy 校验不过，已回滚"; cp "$(ls -t /etc/caddy/Caddyfile.bak.* | head -1)" /etc/caddy/Caddyfile; exit 1
  fi
fi

echo
echo "════════ 配到 Mac 上（只用做一次）════════"
# 只报指纹，不打明文 —— 装机日志、终端回滚、录屏、会话记录都会留下这一行，
# 而这个令牌能删掉用户所有房间和答卷。要用的时候现取，别让它到处躺着。
echo "  当前令牌指纹 sha256:$(sha256sum /etc/smrelay/token | cut -c1-12)"
echo "  在服务器上取：sudo cat /etc/smrelay/token"
echo "  然后在 Mac 上：node <slidesmith>/skills/live/scripts/smlive.mjs setup --token <令牌>"
echo "  （已经配过就不用再配 —— 令牌文件存在时 install.sh 不会覆盖它）"
echo "════════════════════════════════════════"
