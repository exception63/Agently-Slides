#!/bin/bash
# 在服务器上装 / 更新 smrelay。幂等，反复跑安全。
# 用法（在服务器上）：sudo bash /tmp/install.sh
set -euo pipefail
SRC=${SRC:-/tmp/smrelay}
DST=/opt/smrelay

id -u smrelay >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin smrelay
install -d -o root -g root -m 755 "$DST"
install -o root -g root -m 644 "$SRC/smrelay.py" "$SRC/remote.html" "$SRC/ask.html" "$DST/"
install -d -o smrelay -g smrelay -m 750 /var/lib/smrelay
install -o root -g root -m 644 "$SRC/smrelay.service" /etc/systemd/system/smrelay.service

python3 -c "import ast;ast.parse(open('$DST/smrelay.py').read())"   # 语法先过，别把坏文件推上线

systemctl daemon-reload
systemctl enable smrelay >/dev/null
systemctl restart smrelay
sleep 1
systemctl is-active --quiet smrelay && echo "✓ smrelay 已运行" || { journalctl -u smrelay -n 30 --no-pager; exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:8092/health && echo " ← 本机自测通过"

# Caddy：把片段并进去（只在还没有的时候）
if ! grep -q "live.zhouliying.com" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
  # 插在通配符段之前
  python3 - "$SRC/caddy-snippet.conf" <<'PY'
import sys, pathlib
snippet = pathlib.Path(sys.argv[1]).read_text()
p = pathlib.Path("/etc/caddy/Caddyfile")
s = p.read_text()
marker = "*.zhouliying.com, *.03060607.xyz {"
assert marker in s, "找不到通配符段，请手工并入"
p.write_text(s.replace(marker, snippet.rstrip() + "\n\n" + marker, 1))
PY
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    systemctl reload caddy && echo "✓ Caddy 已加载 live.zhouliying.com"
  else
    echo "✗ Caddy 校验不过，已回滚"; cp "$(ls -t /etc/caddy/Caddyfile.bak.* | head -1)" /etc/caddy/Caddyfile; exit 1
  fi
else
  echo "· Caddy 里已有 live.zhouliying.com，跳过"
fi
