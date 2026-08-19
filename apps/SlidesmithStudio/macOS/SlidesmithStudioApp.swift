import SwiftUI
import UniformTypeIdentifiers

/// Slidesmith Studio —— 一个 Mac 原生窗口里同时装下「编辑 deck」和「跟 Claude 说话」。
///
/// ```
/// ┌────────────────────────────────┬──────────────┐
/// │  Studio（WKWebView）           │  Claude 面板 │
/// │  ← deck 桥 8765（app 拉起）    │  ← Claude 桥 │
/// └────────────────────────────────┴──────8932────┘
///        ▲                                  │
///        └──── slidesmith_apply_patch ──────┘
///              （claude 的 MCP 以客户端模式接上 8765）
/// ```
///
/// **两条桥的命都拴在这个 app 上**：起来时拉起，退出时收掉。不装 launchd、
/// 不开机自启——看不见的常驻才是负担。
@main
struct SlidesmithStudioApp: App {

    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var deck = DeckBridge()
    @State private var claude = ClaudeBridge()
    @State private var locator = RepoLocator.shared
    /// **面板开着还是收着要记住。** @State 每次启动都回到默认值，于是"我上次
    /// 明明把它收起来了"和"它自己没出来"在界面上长得一模一样，分不出是哪个。
    @AppStorage("smShowAI") private var showAI = true

    var body: some Scene {
        WindowGroup {
            RootView(showAI: $showAI)
                .environment(deck)
                .environment(claude)
                .environment(locator)
                .frame(minWidth: 1100, minHeight: 700)
                .task {
                    // 两条桥并行起。deck 桥快（node），Claude 桥慢（python + 探端口），
                    // 串起来的话用户要多对着空窗口等一秒。
                    delegate.deck = deck
                    delegate.claude = claude
                    deck.onRequest = { [weak claude] request in
                        // Studio 里点「发送给 Claude」→ 直接进这个面板。
                        // **这一条替掉了过去每个会话都要手挂一次的后台 curl 自循环。**
                        claude?.sendStudioRequest(request)
                    }
                    async let a: Void = deck.start()
                    async let b: Void = claude.start()
                    _ = await (a, b)
                }
        }
        .defaultSize(width: 1500, height: 940)
        .commands { menuCommands }
    }

    @CommandsBuilder
    private var menuCommands: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("打开 deck…") { openDeck() }
                .keyboardShortcut("o")
        }
        CommandGroup(after: .toolbar) {
            Button("显示 / 隐藏 Claude 面板") { showAI.toggle() }
                .keyboardShortcut("a", modifiers: [.command, .shift])
            Button("重新载入 Studio") { NotificationCenter.default.post(name: .smReloadStudio, object: nil) }
                .keyboardShortcut("r")
            Divider()
            Button("选择仓库位置…") { chooseRepo() }
            Button("打开桥接日志") {
                NSWorkspace.shared.open(RepoLocator.logURL(ClaudeBridge.logName))
                NSWorkspace.shared.open(RepoLocator.logURL(DeckBridge.logName))
            }
        }
    }

    private func openDeck() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.html]
        panel.allowsMultipleSelection = false
        panel.message = "选一份契约 HTML deck（#deck > .slide[data-id]）"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task { await deck.open(url) }
    }

    private func chooseRepo() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.message = "选 presentsystems 仓库根目录"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        if locator.choose(url) {
            Task { await deck.start(); await claude.start() }
        }
    }
}

extension Notification.Name {
    static let smReloadStudio = Notification.Name("sm.reload.studio")
}

/// **app 退出时必须把两条桥都收掉。** 不收的话，node 和 python3（以及 python3
/// 拉起的那些常驻 claude）会变成孤儿留在系统里——那正是"我不知道什么东西还在
/// 后台跑"的来源。
final class AppDelegate: NSObject, NSApplicationDelegate {
    @MainActor var deck: DeckBridge?
    @MainActor var claude: ClaudeBridge?

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        MainActor.assumeIsolated {
            claude?.shutdown()
            deck?.shutdown()
        }
    }
}

// MARK: - 根视图

struct RootView: View {

    @Environment(DeckBridge.self) private var deck
    @Environment(ClaudeBridge.self) private var claude
    @Environment(RepoLocator.self) private var locator

    @Binding var showAI: Bool
    @State private var reloadToken = 0

    var body: some View {
        Group {
            if locator.root == nil {
                missingRepo
            } else {
                HSplitView {
                    // **Studio 那边要 maxWidth: .infinity。** 不给的话 HSplitView 会
                    // 直接把右栏顶到它的 maxWidth，编辑区被挤到 Studio 自己的响应式
                    // 断点以下（顶栏按钮换行、三列变挤）——一打开就显得坏了。
                    studioPane
                        .frame(minWidth: 720, maxWidth: .infinity)
                    if showAI {
                        AIPanel()
                            .frame(minWidth: 300, idealWidth: 380, maxWidth: 520)
                    }
                }
            }
        }
        .toolbar { toolbarContent }
        .navigationTitle(deck.deckName ?? "Slidesmith Studio")
        .onReceive(NotificationCenter.default.publisher(for: .smReloadStudio)) { _ in
            reloadToken += 1
        }
    }

    @ViewBuilder
    private var studioPane: some View {
        if deck.running {
            StudioWebView(url: deck.url, reloadToken: reloadToken)
        } else {
            VStack(spacing: 10) {
                ProgressView()
                Text(deck.note ?? "正在启动 deck 桥…")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var missingRepo: some View {
        VStack(spacing: 12) {
            Image(systemName: "questionmark.folder").font(.system(size: 36)).foregroundStyle(.secondary)
            Text("找不到 presentsystems 仓库").font(.headline)
            Text(locator.problem ?? "")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
            Text("这个 app 和仓库是绑在一起的：它要跑仓库里的 deck 桥和 Claude 桥，\n那个 Claude 的工作目录也必须是仓库根，否则 CLAUDE.md 和 skill 都不生效。")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            HStack(spacing: 6) {
                Circle()
                    .fill(deck.studioConnected ? .green : (deck.running ? .orange : .red))
                    .frame(width: 7, height: 7)
                Text(deck.deckName ?? "未打开 deck")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .help(deck.studioConnected ? "Studio 已连上 deck 桥" : "Studio 还没连上")
        }
        ToolbarItem {
            Button {
                showAI.toggle()
            } label: {
                Image(systemName: showAI ? "sidebar.trailing" : "sparkles")
            }
            .help(showAI ? "收起 Claude 面板" : "展开 Claude 面板")
        }
    }
}
