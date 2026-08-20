import SwiftUI
import WebKit

/// 讲稿页：把网页遥控端（`/r/<room>`）**整页**装进 WKWebView。
///
/// **为什么是 WebView，而不是用 SwiftUI 把讲稿重画一遍**：
/// 讲稿本身就是一份完整的 HTML 文档（一体版 deck 里 base64 存着 `__TXB64__`，
/// 解出来是 `<!DOCTYPE html>…`，带自己的滚动 / 提词监听）。要在原生里渲染它，
/// 无论如何都得有个 WKWebView。既然横竖都要，就别只塞讲稿——把整个 `/r/<room>`
/// 装进来：协议、自动滚到当前页、提词高亮、计时全部免费继承，而且**以后网页端
/// 改什么，这里自动跟上**，不会再出现「原生落后一整代」这种事。
///
/// 代价（已知、可接受）：WebView 里那个页面会自己以 `role=remote` 连一次中转，
/// 于是一个房间里有两个 remote —— 原生的（喂手表页码）+ WebView 的（显示讲稿）。
/// 中转只限制 deck 数量、remote 不限，功能上没问题；只是配对时两条连接会各收到
/// 一份 30–60 KB 的讲稿。先按简单做法上，真机实测嫌费流量再优化。
final class TranscriptWeb: ObservableObject {
    let webView: WKWebView
    private var loadedURL: URL?

    init() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []

        // 网页端自己也有一组「遥控 / 讲稿」分段控件。整页装进来之后，屏幕上就会出现
        // **两组一模一样的开关**（原生一组、网页一组），谁管谁完全看不出来。
        //
        // 分工定死：原生那组说了算——「遥控」用原生的（有触觉反馈、是手表的上游），
        // 「讲稿」把整页交给网页。所以这里做两件事：
        //   ① 进页面前先把网页端记模式的那个 localStorage 键设成 script，
        //      它自己在解析阶段读这个键（remote.html:273）就会直接开在讲稿；
        //   ② 把它那组开关藏掉。
        //
        // 都用注入而不是改 remote.html：改网页要连云端 worker 一起重新部署，
        // 而且**老部署 / 老房间立刻就不一致了**。注入只影响这个 WebView，
        // 网页端将来怎么改都不会被我们带坏；万一它改了 id，这里只是安静失效
        // （退回到两组开关），不会把讲稿弄坏。
        let seed = WKUserScript(
            source: "try{localStorage.setItem('sm-remote-mode','script')}catch(e){}",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        let hideModes = WKUserScript(
            source: "(function(){var s=document.createElement('style');"
                  + "s.textContent='#modes{display:none!important}';"
                  + "document.head&&document.head.appendChild(s);})();",
            injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        cfg.userContentController.addUserScript(seed)
        cfg.userContentController.addUserScript(hideModes)

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        // 讲稿是暗色页面，给个同色底，切过来时不闪白
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
    }

    /// 只在地址**真的变了**时才加载。切标签页不该把讲稿重新拉一遍：
    /// 重载不只是再下 30–60 KB，还会把配对握手整个重走一次（页码要重新问）。
    func load(_ url: URL) {
        guard loadedURL != url else { return }
        loadedURL = url
        webView.load(URLRequest(url: url))
    }

    func reload() {
        if let u = loadedURL { webView.load(URLRequest(url: u)) }
    }
}

struct TranscriptWebView: UIViewRepresentable {
    let web: TranscriptWeb

    func makeUIView(context: Context) -> WKWebView { web.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) { /* 生命周期归 TranscriptWeb 管 */ }
}
