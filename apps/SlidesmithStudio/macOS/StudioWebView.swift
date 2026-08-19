import SwiftUI
import WebKit

/// Studio 网页那一块。
///
/// **编辑器内核仍然是那份 HTML，这是有意的，不是将就。** deck 本身就是 HTML——
/// 用浏览器内核渲染它，所见即所得是天然成立的；换成原生控件重画，最后还是得内嵌
/// 一个 WebView 来预览，两套东西还要对齐。21 套皮肤、动画库、图表、导出全部零风险
/// 原样可用。
///
/// 这一层要补的是**浏览器给的、WKWebView 默认没有的那几件事**：
///
/// | Studio 用到的 | WKWebView 默认 | 这里怎么办 |
/// |---|---|---|
/// | `<input type=file>`（导入图片） | **什么都不发生** | `runOpenPanelWith` → NSOpenPanel |
/// | `window.open`（动画库、PDF 预览） | 静默丢弃 | `createWebViewWith` → 独立窗口 |
/// | `alert` / `confirm` | 静默丢弃 | 转成 NSAlert |
/// | `showSaveFilePicker`（另存为） | 没有这个 API | **不用管**——Studio 在 http 环境下走的是 bridge 的 `/api/export-html` |
///
/// 那张表里最容易漏的是第一行：不实现 `runOpenPanelWith`，「导入图片」按钮点下去
/// 一点反应都没有，也不报错。
struct StudioWebView: NSViewRepresentable {

    let url: URL
    /// 每次 +1 就重载。用来在 deck 桥重启后把页面拉回来。
    var reloadToken: Int

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Studio 把草稿写在 localStorage 里（"never-lose-work" 那套）。默认的
        // 持久化 store 就够，但显式写出来省得以后有人改成 nonPersistent 把草稿弄丢。
        config.websiteDataStore = .default()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        // 弹窗（演讲者副屏、动画库、PDF 预览）必须放行。
        // 默认 false 时 WKWebView 只在「有用户手势」的那一瞬放行 window.open，而
        // Studio 的预览是 srcdoc iframe，deck 引擎又常在 setTimeout 里补开/补写
        // 副屏——手势早过期了，表现就是「点了演讲者没反应，也不报错」。
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        // file:// 在 WKWebView 里是**不透明源**：不开这两个，父页拿不到自己开出来的
        // 子窗口的 document，`presenterWindow.document.write(模板)` 会被静默拒绝，
        // 于是窗口开了也是白的。私有 key，但从 WebKit 早期沿用至今，Safari 自己也在用。
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        // Studio 自己管背景色（含深色模式）。给个中性底，免得加载那一瞬间闪白。
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: url))
        context.coordinator.webView = webView
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if context.coordinator.lastReloadToken != reloadToken {
            context.coordinator.lastReloadToken = reloadToken
            webView.load(URLRequest(url: url))
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {

        weak var webView: WKWebView?
        var lastReloadToken = 0
        /// `window.open` 开出来的子窗口。**必须留着强引用**——不留的话窗口一显示
        /// 就被回收，表现是"点动画库闪一下就没了"。
        private var childWindows: [NSWindow] = []

        // MARK: - window.open

        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            let width = windowFeatures.width?.doubleValue ?? 960
            let height = windowFeatures.height?.doubleValue ?? 900
            let child = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height),
                                  configuration: configuration)
            child.uiDelegate = self
            child.navigationDelegate = self

            let window = NSWindow(contentRect: child.frame,
                                  styleMask: [.titled, .closable, .resizable, .miniaturizable],
                                  backing: .buffered, defer: false)
            window.contentView = child
            window.isReleasedWhenClosed = false
            window.title = "Slidesmith"
            window.center()
            window.makeKeyAndOrderFront(nil)
            childWindows.append(window)

            // 返回 nil 会让 WebKit 自己走 navigation；返回这个 child 才是
            // "我接管了这个 window.open"。`navigationAction.request` 为空时
            // （`window.open('')` + document.write，PDF 导出就是这么用的）
            // 不要自己 load，让页面自己写内容。
            if let request = navigationAction.request.url != nil ? navigationAction.request : nil {
                child.load(request)
            }
            return child
        }

        func webViewDidClose(_ webView: WKWebView) {
            childWindows.removeAll { window in
                guard window.contentView === webView else { return false }
                window.close()
                return true
            }
        }

        // MARK: - 文件选择（「导入图片」靠它）

        func webView(_ webView: WKWebView,
                     runOpenPanelWith parameters: WKOpenPanelParameters,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping ([URL]?) -> Void) {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.canChooseDirectories = parameters.allowsDirectories
            panel.canChooseFiles = true
            panel.begin { response in
                completionHandler(response == .OK ? panel.urls : nil)
            }
        }

        // MARK: - alert / confirm / prompt

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping () -> Void) {
            let alert = NSAlert()
            alert.messageText = message
            alert.addButton(withTitle: "好")
            alert.runModal()
            completionHandler()
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping (Bool) -> Void) {
            let alert = NSAlert()
            alert.messageText = message
            alert.addButton(withTitle: "确定")
            alert.addButton(withTitle: "取消")
            completionHandler(alert.runModal() == .alertFirstButtonReturn)
        }

        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                     defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping (String?) -> Void) {
            let alert = NSAlert()
            alert.messageText = prompt
            let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
            field.stringValue = defaultText ?? ""
            alert.accessoryView = field
            alert.addButton(withTitle: "确定")
            alert.addButton(withTitle: "取消")
            completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
        }

        // MARK: - 导航

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // deck 里的外链（署名、参考文献）应该去真正的浏览器，不该把 Studio 顶掉。
            if let url = navigationAction.request.url,
               navigationAction.navigationType == .linkActivated,
               let host = url.host, host != "127.0.0.1", host != "localhost" {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
