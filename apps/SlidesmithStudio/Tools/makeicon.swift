import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Slidesmith Studio 图标：暗底 + 一张 16:9 的 slide（有标题条和正文线）+ 琥珀色四角星。
//
// 和 SlidesmithRemote 是**一家人但认得出**：同一套底色和琥珀色，同样的 slide 主体；
// 那边压一个右向雪佛龙（＝翻页 / 遥控），这边压一颗星（＝AI 在改这一页 / Studio）。
//
// **macOS 的图标不是满幅方形。** 系统不会替你切圆角——满幅画出来的结果是它在
// 程序坞里比周围每个图标都大一圈、还是个方块。所以按 macOS 的老规矩来：
// 1024 画布里画一个 824×824、圆角 185 的圆角矩形，四周留白透明。
//
// 用法：swift Tools/makeicon.swift out.png
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
let bgTop   = rgb(38, 38, 48)      // 顶部略亮，给一点体积感
let bgBot   = rgb(20, 20, 26)
let amber   = rgb(245, 183, 63)    // #F5B73F —— 和 Remote 同一个琥珀
let slideBg = rgb(255, 255, 255, 0.17)   // 16pt 下的可读性全靠这一档对比，别再调低
let slideLn = rgb(255, 255, 255, 0.46)

// ---- 圆角底板（macOS 规格：824/1024，圆角 185）----
let inset = (S - 824) / 2
let plate = CGRect(x: inset, y: inset, width: 824, height: 824)
let platePath = CGPath(roundedRect: plate, cornerWidth: 185, cornerHeight: 185, transform: nil)
ctx.saveGState()
ctx.addPath(platePath)
ctx.clip()
if let grad = CGGradient(colorsSpace: cs, colors: [bgTop, bgBot] as CFArray, locations: [0, 1]) {
    ctx.drawLinearGradient(grad,
                           start: CGPoint(x: 0, y: plate.maxY),
                           end: CGPoint(x: 0, y: plate.minY),
                           options: [])
}

// ---- 居中的 16:9 slide ----
// 略微偏左下，给右上角那颗星让出位置（不让它压住标题条）。
let sw: CGFloat = 560, sh = sw * 9 / 16
let sr = CGRect(x: S*0.5 - sw*0.5 - 18, y: S*0.5 - sh*0.5 - 26, width: sw, height: sh)
let slidePath = CGPath(roundedRect: sr, cornerWidth: 26, cornerHeight: 26, transform: nil)
ctx.addPath(slidePath); ctx.setFillColor(slideBg); ctx.fillPath()
ctx.addPath(slidePath); ctx.setStrokeColor(slideLn); ctx.setLineWidth(11); ctx.strokePath()

// 标题条用琥珀色实心 —— 小尺寸下这一笔是唯一能认出「这是张有内容的片子」的东西。
ctx.setFillColor(amber)
ctx.fill(CGRect(x: sr.minX + 46, y: sr.midY + 22, width: sw * 0.46, height: 34))
// 两条正文线，逐条变短变淡：暗示排版而不是画满
ctx.setFillColor(slideLn)
ctx.fill(CGRect(x: sr.minX + 46, y: sr.midY - 22, width: sw * 0.60, height: 18))
ctx.fill(CGRect(x: sr.minX + 46, y: sr.midY - 60, width: sw * 0.36, height: 18))

// ---- 右上角那颗四角星（AI）----
// 四角星（不是五角星）在 16pt 下仍然认得出，而且不会和「收藏/评分」混淆。
func star(cx: CGFloat, cy: CGFloat, r: CGFloat, waist: CGFloat, color: CGColor) {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: cx, y: cy + r))
    p.addQuadCurve(to: CGPoint(x: cx + r, y: cy), control: CGPoint(x: cx + waist, y: cy + waist))
    p.addQuadCurve(to: CGPoint(x: cx, y: cy - r), control: CGPoint(x: cx + waist, y: cy - waist))
    p.addQuadCurve(to: CGPoint(x: cx - r, y: cy), control: CGPoint(x: cx - waist, y: cy - waist))
    p.addQuadCurve(to: CGPoint(x: cx, y: cy + r), control: CGPoint(x: cx - waist, y: cy + waist))
    p.closeSubpath()
    ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath()
}
let bigX = sr.maxX - 6, bigY = sr.maxY + 6
// 先用底色描一圈，让星从 slide 边缘「浮」出来（同 Remote 的做法）
star(cx: bigX, cy: bigY, r: 148, waist: 34, color: bgBot)
star(cx: bigX, cy: bigY, r: 122, waist: 26, color: amber)
// 一颗小的做陪衬，构图不至于太单薄
star(cx: bigX + 108, cy: bigY - 112, r: 46, waist: 10, color: bgBot)
star(cx: bigX + 108, cy: bigY - 112, r: 34, waist: 7, color: amber)

ctx.restoreGState()

guard let img = ctx.makeImage() else { fatalError("img") }
let out = URL(fileURLWithPath: CommandLine.arguments[1])
guard let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fatalError("dest")
}
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
print("wrote \(out.path)")
