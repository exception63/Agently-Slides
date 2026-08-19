#!/usr/bin/env bash
#
# 把 Slidesmith Studio.app 装到 ~/Applications，让聚焦 / Raycast 有一个**明确的**入口。
#
# 为什么需要这个脚本：构建产物躺在 Xcode 的 DerivedData 里，路径是一串哈希，
# 聚焦搜出来也认不出是哪个。装到 ~/Applications 之后，那一个才是「正式安装的应用」。
#
# **它仍然依赖本仓库。** app 要跑仓库里的两条桥（`packages/cli` 的 deck 桥、
# `apps/SlidesmithStudio/bridge/claude-bridge.py` 的 Claude 桥），那个 claude 的
# 工作目录也必须是仓库根——否则 CLAUDE.md、AGENTS.md、skill 全都不生效。
# 仓库路径在构建时烘进 Info.plist；移动仓库之后用 app 里的
# 「显示 → 选择仓库位置…」重新指一次即可（存 UserDefaults，优先级高于烘进去的）。
#
# 用法：
#   ./scripts/install-studio-app.sh            # Debug（构建快，和日常开发一致）
#   ./scripts/install-studio-app.sh Release    # Release（优化过，启动更快）
set -euo pipefail

CONFIG="${1:-Debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPDIR="$ROOT/apps/SlidesmithStudio"
DEST="$HOME/Applications"

command -v xcodegen >/dev/null || { echo "✗ 没装 xcodegen：brew install xcodegen"; exit 1; }

echo "▸ 重新生成 Xcode 工程……"
(cd "$APPDIR" && xcodegen generate >/dev/null)

echo "▸ 构建 SlidesmithStudio（$CONFIG）……"
(cd "$APPDIR" && xcodebuild -scheme SlidesmithStudio -configuration "$CONFIG" build \
  2>&1 | grep -E "error:|BUILD" | tail -10)

# **产物路径从 xcodebuild 自己嘴里问**，别去猜 DerivedData 的哈希目录名。
BUILT=$(cd "$APPDIR" && xcodebuild -scheme SlidesmithStudio -configuration "$CONFIG" \
        -showBuildSettings 2>/dev/null \
        | awk -F' = ' '/ BUILT_PRODUCTS_DIR/ {print $2; exit}')
APP="$BUILT/Slidesmith Studio.app"

[ -d "$APP" ] || { echo "✗ 没找到产物：$APP"; exit 1; }

mkdir -p "$DEST"
rm -rf "$DEST/Slidesmith Studio.app"
cp -R "$APP" "$DEST/"

echo "✓ 已装到 $DEST/Slidesmith Studio.app"
echo "  仓库：$ROOT"
echo "  日志：~/Library/Logs/SlidesmithStudio-{deck,claude}-bridge.log"
