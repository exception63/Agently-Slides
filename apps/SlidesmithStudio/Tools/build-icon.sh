#!/usr/bin/env bash
#
# 画图标 → 铺成 macOS 的 AppIcon 图集。
#
#   ./Tools/build-icon.sh
#
# macOS 的 AppIcon 要 7 个尺寸 × 1x/2x 共 10 张。手工导 10 次没人愿意做第二遍，
# 所以从一张 1024 用 sips 缩下来。**master 那张必须是 824/1024 的圆角底板**
# （见 makeicon.swift 里的说明），满幅方块在程序坞里会比邻居大一圈。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPDIR="$(dirname "$HERE")"
SET="$APPDIR/Resources/Assets.xcassets/AppIcon.appiconset"
MASTER="$SET/icon_1024.png"

mkdir -p "$SET"
swift "$HERE/makeicon.swift" "$MASTER"

emit() { sips -z "$1" "$1" "$MASTER" --out "$SET/icon_$1.png" >/dev/null; }
for size in 16 32 64 128 256 512; do emit "$size"; done

cat > "$SET/Contents.json" <<'JSON'
{
  "images" : [
    { "idiom" : "mac", "scale" : "1x", "size" : "16x16",     "filename" : "icon_16.png"   },
    { "idiom" : "mac", "scale" : "2x", "size" : "16x16",     "filename" : "icon_32.png"   },
    { "idiom" : "mac", "scale" : "1x", "size" : "32x32",     "filename" : "icon_32.png"   },
    { "idiom" : "mac", "scale" : "2x", "size" : "32x32",     "filename" : "icon_64.png"   },
    { "idiom" : "mac", "scale" : "1x", "size" : "128x128",   "filename" : "icon_128.png"  },
    { "idiom" : "mac", "scale" : "2x", "size" : "128x128",   "filename" : "icon_256.png"  },
    { "idiom" : "mac", "scale" : "1x", "size" : "256x256",   "filename" : "icon_256.png"  },
    { "idiom" : "mac", "scale" : "2x", "size" : "256x256",   "filename" : "icon_512.png"  },
    { "idiom" : "mac", "scale" : "1x", "size" : "512x512",   "filename" : "icon_512.png"  },
    { "idiom" : "mac", "scale" : "2x", "size" : "512x512",   "filename" : "icon_1024.png" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

echo "✓ AppIcon 图集已生成：$SET"
