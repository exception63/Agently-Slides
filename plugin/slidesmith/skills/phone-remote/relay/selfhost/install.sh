#!/bin/bash
# 在服务器上装 / 更新 smrelay。幂等，反复跑安全。
# 用法（在服务器上）：sudo bash /tmp/install.sh
set -euo pipefail
SRC=${SRC:-/tmp/smrelay}
DST=/opt/smrelay

id -u smrelay >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin smrelay
install -d -o root -g root -m 755 "$DST"
install -o root -g root -m 644 "$SRC/smrelay.py" "$SRC/remote.html" "$SRC/ask.html" "$SRC/admin.html" "$DST/"
install -d -o smrelay -g smrelay -m 750 /var/lib/smrelay
install -o root -g root -m 644 "$SRC/smrelay.service" /etc/systemd/system/smrelay.service

# 每日数据快照 → /srv/myspace/files/，由现有的 `myspace sync pull` 顺手带回本地。
# 不另起一套备份体系：多一套就多一处会悄悄坏掉的地方。
install -o root -g root -m 755 "$SRC/smrelay-backup" /usr/local/bin/smrelay-backup
install -o root -g root -m 644 "$SRC/smrelay-backup.service" /etc/systemd/system/smrelay-backup.service
install -o root -g root -m 644 "$SRC/smrelay-backup.timer" /etc/systemd/system/smrelay-backup.timer

python3 -c "import ast;ast.parse(open('$DST/smrelay.py').read())"   # 语法先过，别把坏文件推上线

systemctl daemon-reload
systemctl enable smrelay >/dev/null
systemctl enable --now smrelay-backup.timer >/dev/null
systemctl restart smrelay
sleep 1
systemctl is-active --quiet smrelay && echo "✓ smrelay 已运行" || { journalctl -u smrelay -n 30 --no-pager; exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:8092/health && echo " ← 本机自测通过"

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
