import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Slidesmith Remote 图标：暗底 + 一张微微透视的「slide」+ 琥珀色右向雪佛龙。
// 小尺寸（表盘 ~44pt）也要认得出，所以元素少、对比强。
let S: CGFloat = 1024
let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8,
                          bytesPerRow: 0, space: cs,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    fatalError("ctx")
}

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: cs, components: [r/255, g/255, b/255, a])!
}
let bg      = rgb(23, 23, 30)      // #17171E
let amber   = rgb(245, 183, 63)    // #F5B73F
let slideBg = rgb(255, 255, 255, 0.10)
let slideLn = rgb(255, 255, 255, 0.30)

// 背景（App 图标必须不透明、无圆角，系统自己切圆角/圆形）
ctx.setFillColor(bg)
ctx.fill(CGRect(x: 0, y: 0, width: S, height: S))

// 居中的 16:9 slide —— 暗示「幻灯片」
let sw: CGFloat = 620, sh = sw * 9 / 16
let sr = CGRect(x: S*0.5 - sw*0.5, y: S*0.5 - sh*0.5, width: sw, height: sh)
let slidePath = CGPath(roundedRect: sr, cornerWidth: 30, cornerHeight: 30, transform: nil)
ctx.addPath(slidePath); ctx.setFillColor(slideBg); ctx.fillPath()
ctx.addPath(slidePath); ctx.setStrokeColor(slideLn); ctx.setLineWidth(12); ctx.strokePath()
// slide 里两条文字线（放左侧，给右边的雪佛龙留位置）
ctx.setFillColor(slideLn)
ctx.fill(CGRect(x: sr.minX + 56, y: sr.midY + 26, width: sw * 0.40, height: 22))
ctx.fill(CGRect(x: sr.minX + 56, y: sr.midY - 30, width: sw * 0.26, height: 22))

// 琥珀色右向雪佛龙 —— 「下一页」，主视觉，压在 slide 上偏右
let cx = S*0.5 + 150, cy = S*0.5, arm: CGFloat = 128
func chevron(width: CGFloat, color: CGColor) {
    ctx.setStrokeColor(color)
    ctx.setLineWidth(width)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.move(to: CGPoint(x: cx - arm*0.60, y: cy + arm))
    ctx.addLine(to: CGPoint(x: cx + arm*0.60, y: cy))
    ctx.addLine(to: CGPoint(x: cx - arm*0.60, y: cy - arm))
    ctx.strokePath()
}
chevron(width: 128, color: bg)      // 先描一圈底色，让它从 slide 上「浮」出来
chevron(width: 84, color: amber)

guard let img = ctx.makeImage() else { fatalError("img") }
let out = URL(fileURLWithPath: CommandLine.arguments[1])
guard let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fatalError("dest")
}
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
print("wrote \(out.path)")
