import Foundation

/// 把 `deck-info` 里那份 base64 讲稿拆成「锚点 → 纯文本」。
///
/// **为什么要在原生里拆**：iPhone 的讲稿页是 WKWebView 装整页，压根不用拆；
/// 但 **watchOS 没有 WebKit**（`import WebKit` 在 watch SDK 上直接报 no such module），
/// 手表要显示讲稿只能拿纯文本。所以这一层是给手表用的。
///
/// **锚点是作者自定义的，别照 `sm-note-N` 猜**。真讲稿里长这样：
/// ```html
/// <h3 class="sub" id="s1-boom"><span class="slide-tag">SLIDE 04</span>研究背景 · AR 的繁荣</h3>
/// <p>…</p>
/// <p class="cue">这里转折，制造冲突。放慢。</p>
/// ```
/// 一段讲稿 = 从它自己的 `<h3>` 起，到**下一个 `<h3>`** 为止。
/// （`stateFromDom()` 在没有作者锚点时才退回 `sm-note-<i>`，那种情况这里同样能认。）
enum TranscriptNotes {

    static func parse(base64: String) -> [String: String] {
        guard !base64.isEmpty,
              let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
              let html = String(data: data, encoding: .utf8) else { return [:] }
        return parse(html: html)
    }

    static func parse(html: String) -> [String: String] {
        var out: [String: String] = [:]
        for (anchor, chunk) in sections(html: html) {
            let text = plainText(chunk)
            if !text.isEmpty { out[anchor] = text }
        }
        return out
    }

    /// **提词**：锚点 → 该段里作者手打的 `<strong>` 短语。
    ///
    /// 这不是我们现造的概念 —— presenter-mode 的「✦ Keywords 提词」用的就是它：
    /// 副屏按 K 时只高亮**当前板块内**的 `<strong>`（`script-listener.js.template:88`）。
    /// 也就是说提词本来就是**写讲稿时标好的**，不需要在手机上从散文里临时提炼。
    /// 手表要的正是这个：一瞥就够，而不是三四屏散文。
    static func parseCues(base64: String) -> [String: [String]] {
        guard !base64.isEmpty,
              let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
              let html = String(data: data, encoding: .utf8) else { return [:] }
        var out: [String: [String]] = [:]
        for (anchor, chunk) in sections(html: html) {
            let cues = strongs(in: chunk)
            if !cues.isEmpty { out[anchor] = cues }
        }
        return out
    }

    /// 一段讲稿 = 从它自己的 `<h3 id>` 起，到下一个标题为止
    private static func sections(html: String) -> [(String, String)] {
        let ns = html as NSString
        guard let re = try? NSRegularExpression(pattern: "<h[1-6]\\b[^>]*\\bid=\"([^\"]+)\"[^>]*>",
                                                options: [.caseInsensitive]) else { return [] }
        let hits = re.matches(in: html, range: NSRange(location: 0, length: ns.length))
        var out: [(String, String)] = []
        for (i, m) in hits.enumerated() {
            let start = m.range.location
            let end = i + 1 < hits.count ? hits[i + 1].range.location : ns.length
            guard end > start else { continue }
            out.append((ns.substring(with: m.range(at: 1)),
                        ns.substring(with: NSRange(location: start, length: end - start))))
        }
        return out
    }

    private static func strongs(in chunk: String) -> [String] {
        let ns = chunk as NSString
        guard let re = try? NSRegularExpression(pattern: "<strong[^>]*>([\\s\\S]*?)</strong>",
                                                options: [.caseInsensitive]) else { return [] }
        var seen = Set<String>()
        var out: [String] = []
        for m in re.matches(in: chunk, range: NSRange(location: 0, length: ns.length)) {
            let t = plainText(ns.substring(with: m.range(at: 1)))
                .replacingOccurrences(of: "\n", with: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty, !seen.contains(t) else { continue }
            seen.insert(t)
            out.append(t)
        }
        return out
    }

    /// HTML → 纯文本。够用就行，不追求通用：这份讲稿是我们自己的模板生成的。
    static func plainText(_ html: String) -> String {
        var s = html

        // 「SLIDE 04」这种页码角标在表盘上是噪音，先去掉
        s = s.replacingOccurrences(
            of: "<span[^>]*class=\"[^\"]*slide-tag[^\"]*\"[^>]*>[\\s\\S]*?</span>",
            with: "", options: [.regularExpression, .caseInsensitive])
        // 「金句 ·」这类**标签 span**（class="gk" / "n"）后面紧跟正文，不断行的话会粘成
        // 「金句 · 本研究的起点这一刻，触觉的缺席…」。给它补个换行。
        s = s.replacingOccurrences(
            of: "(<span[^>]*class=\"[^\"]*\\b(gk|n)\\b[^\"]*\"[^>]*>[\\s\\S]*?</span>)",
            with: "$1\n", options: [.regularExpression, .caseInsensitive])
        // 整块删掉的：脚本/样式
        s = s.replacingOccurrences(of: "<(script|style)\\b[\\s\\S]*?</\\1>",
                                   with: "", options: [.regularExpression, .caseInsensitive])
        // 块级元素收尾换行，否则整段会挤成一行没法读
        s = s.replacingOccurrences(of: "</(p|div|h[1-6]|li|blockquote|section)>",
                                   with: "\n", options: [.regularExpression, .caseInsensitive])
        s = s.replacingOccurrences(of: "<br\\s*/?>", with: "\n",
                                   options: [.regularExpression, .caseInsensitive])
        s = s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)

        for (k, v) in ["&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"",
                       "&#39;": "'", "&hellip;": "…", "&mdash;": "—", "&ldquo;": "\u{201C}",
                       "&rdquo;": "\u{201D}"] {
            s = s.replacingOccurrences(of: k, with: v)
        }

        s = s.replacingOccurrences(of: "[ \\t]+", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: " *\n *", with: "\n", options: .regularExpression)
        s = s.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
