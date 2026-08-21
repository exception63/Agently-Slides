import Foundation
import Observation

/// node 那条桥（`slidesmith serve`）——**Studio 网页和 deck 都活在它上面。**
///
/// ## 为什么由 app 拥有它，而不是让 Claude 拉起
///
/// 老形状是「Claude Code 会话 → MCP 进程 → 它顺手 listen 8765」，桥的命拴在那个
/// 会话身上：会话一关，Studio 立刻失联。app 化之后必须倒过来——**桥的命拴在 app 上**，
/// Claude 只是接上来的客户端之一（见 `packages/bridge/src/remote.ts`）。
///
/// ## 它负责三件事
///
/// 1. 拉起并守着 `slidesmith serve --no-open`（WebView 加载的就是它的 `/`）
/// 2. 每两秒问一次 `/api/status`：Studio 连上没有、现在开着哪份 deck
/// 3. **长轮询 `/api/wait`**——用户在 Studio 里点「发送给 Claude」时，那条请求
///    从这里出来。这一条正是过去要在会话里手挂后台 `curl` 自循环脚本才有的东西，
///    现在由 app 常驻地做，且**每个新会话不用再挂一次**。
@MainActor
@Observable
final class DeckBridge {

    static let port = 8765
    static let logName = "SlidesmithStudio-deck-bridge"

    /// Studio 网页的地址。WebView 加载它。
    let url = URL(string: "http://127.0.0.1:\(port)/")!

    private(set) var running = false
    private(set) var studioConnected = false
    private(set) var deckName: String?
    private(set) var deckPath: URL?
    private(set) var pendingRequests = 0
    private(set) var note: String?

    /// 用户此刻在 Studio 里选中的那一页。Claude 面板拿它当上下文，
    /// 省得每次打字说「第 12 页」。Studio 没连上时是 nil。
    struct Selection: Equatable {
        var index: Int          // 1 起
        var total: Int
        var id: String          // section 的 data-id，给工具用
        var title: String
        var label: String { "第 \(index) 页 · \(title)" }
    }
    private(set) var selection: Selection?

    /// 用户在 Studio 里提交的一条修改请求。`content` 是 Studio 自己组装好的
    /// 完整 prompt（指令 + 该页当前 HTML + 设计令牌 + 输出规范），**一个字都不要改**
    /// ——改写它等于在两个地方各维护一半的提示词。
    struct Request: Identifiable {
        let id: String
        /// 用户开了「改前先问我」：回写时要走 preview，Studio 会以「保留/还原」呈现。
        let confirm: Bool
        let count: Int
        let content: String
    }

    /// 用户在 Studio 里提交了修改请求。app 把它转给 Claude 面板。
    /// **不在这里直接调 ClaudeBridge**：这个类不该知道有 Claude 这回事，
    /// 换个消费者（比如只是弹个通知）不用动它。
    var onRequest: ((Request) -> Void)?

    private var process: Process?
    private var pollTask: Task<Void, Never>?
    private var waitTask: Task<Void, Never>?
    /// 见 ClaudeBridge.startTask —— 同一个理由，同一个坑。
    private var startTask: Task<Void, Never>?

    // MARK: - 生命周期

    func start() async {
        if let startTask { await startTask.value; return }
        let task = Task { await self.reallyStart() }
        startTask = task
        await task.value
        startTask = nil
    }

    private func reallyStart() async {
        guard let root = RepoLocator.shared.root else {
            note = RepoLocator.shared.problem ?? "找不到仓库"
            return
        }
        // 已经有人在这个端口上跑着一条健康的桥（上一次 app 没退干净、或者用户
        // 自己在终端 `slidesmith serve`）→ **直接用它，别抢**。抢的结果是我们
        // 静默退到随机端口，然后 WebView 连的和 Claude 连的是两条桥。
        if await probe() {
            note = "接上了已经在跑的 deck 桥（不是本 app 拉起的，退出时不会关它）"
            running = true
            startPolling()
            return
        }
        guard spawn(root: root) else { return }
        // 等它真的起来再说"好了"。node + tsx 冷启动一两秒，这段时间 WebView
        // 加载会白屏——所以是我们等它，不是让用户对着白屏猜。
        for _ in 0..<60 {
            if await probe() { running = true; note = nil; startPolling(); return }
            try? await Task.sleep(for: .milliseconds(250))
        }
        note = "deck 桥 15 秒还没起来。日志：\(RepoLocator.logURL(Self.logName).path)"
    }

    private func spawn(root: URL) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [
            "node",
            root.appendingPathComponent("node_modules/tsx/dist/cli.mjs").path,
            root.appendingPathComponent("packages/cli/src/index.ts").path,
            "serve", "--no-open", "--port", String(Self.port),
        ]
        process.currentDirectoryURL = root
        process.environment = RepoLocator.childEnvironment()
        if let log = RepoLocator.logHandle(Self.logName) {
            process.standardOutput = log
            process.standardError = log
        }
        do {
            try process.run()
            self.process = process
            return true
        } catch {
            note = "拉不起 deck 桥：\(error.localizedDescription)"
            return false
        }
    }

    /// 重启 deck 桥 —— **连"不是我拉起的那条"也一起换掉**。
    ///
    /// 为什么需要这个：`reallyStart()` 看到 8765 上已经有人在跑就直接接上去（避免和
    /// 用户自己在终端跑的 `slidesmith serve` 抢端口）。代价是——**上一次 app 留下的
    /// 旧桥会一直活着**，退出 app 也收不掉它，因为 app 不持有那个 Process。
    /// 于是改了 `packages/bridge/` 的代码之后，你重装、重启、重新载入全都没用：
    /// 网页是新的（桥每请求重读磁盘上那份 HTML），跑着的桥还是旧的那个进程。
    /// 这条路专门用来把它换掉。
    func restart() async {
        note = "正在重启 deck 桥…"
        pollTask?.cancel(); pollTask = nil
        waitTask?.cancel(); waitTask = nil
        if let process { process.terminate(); self.process = nil }
        else { killWhoeverHoldsPort() }   // 接来的那条：我们没有 Process，只能按端口收
        running = false
        // 等端口真的空出来再拉新的，否则新进程撞到 EADDRINUSE 会静默退到随机端口
        for _ in 0..<40 {
            if await get("api/status", timeout: 1) == nil { break }
            try? await Task.sleep(for: .milliseconds(250))
        }
        await reallyStart()
        if running { note = nil; reloadStudio() }
    }

    private func killWhoeverHoldsPort() {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        p.arguments = ["-c", "lsof -ti tcp:\(Self.port) | xargs -r kill"]
        p.environment = RepoLocator.childEnvironment()
        try? p.run()
        p.waitUntilExit()
    }

    private func reloadStudio() {
        NotificationCenter.default.post(name: .smReloadStudio, object: nil)
    }

    func shutdown() {
        pollTask?.cancel(); pollTask = nil
        waitTask?.cancel(); waitTask = nil
        process?.terminate()
        process = nil
        running = false
    }

    // MARK: - 状态

    @discardableResult
    private func probe() async -> Bool {
        guard let json = await get("api/status") else { return false }
        studioConnected = (json["connected"] as? Int ?? 0) > 0
        deckName = json["deckName"] as? String
        pendingRequests = json["pendingRequests"] as? Int ?? 0
        if let s = json["selection"] as? [String: Any], let i = s["index"] as? Int {
            selection = Selection(index: i, total: s["total"] as? Int ?? 0,
                                  id: s["id"] as? String ?? "",
                                  title: s["title"] as? String ?? "")
        } else {
            selection = nil
        }
        return json["port"] != nil
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.probe()
                try? await Task.sleep(for: .seconds(2))
            }
        }
        startWaiting()
    }

    /// 长轮询用户提交的「AI 待办」。
    ///
    /// **桥那边一有请求就立刻返回**（不是轮询间隔到了才发现），空闲时这条连接
    /// 就挂在那里，不花任何东西。断了就隔两秒重挂——网络是回环，唯一会断的情况
    /// 是桥重启了。
    private func startWaiting() {
        waitTask?.cancel()
        waitTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let batch = await self.waitForRequests()
                for request in batch { self.onRequest?(request) }
                if batch.isEmpty { try? await Task.sleep(for: .seconds(1)) }
            }
        }
    }

    private func waitForRequests() async -> [Request] {
        guard let json = await get("api/wait?timeout=60000", timeout: 75) else { return [] }
        guard let raw = json["requests"] as? [[String: Any]] else { return [] }
        return raw.compactMap { item in
            guard let content = item["content"] as? String, !content.isEmpty else { return nil }
            return Request(id: item["id"] as? String ?? UUID().uuidString,
                           confirm: item["confirm"] as? Bool ?? false,
                           count: item["count"] as? Int ?? 1,
                           content: content)
        }
    }

    // MARK: - 操作

    /// 把一份 deck 推进 Studio。`path` 让导出 PDF/HTML 落在 deck 旁边。
    func open(_ file: URL) async {
        guard let html = try? String(contentsOf: file, encoding: .utf8) else {
            note = "读不了 \(file.lastPathComponent)"
            return
        }
        let name = file.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "deck.html"
        let path = file.path.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        var request = URLRequest(url: url.appendingPathComponent("api/open"))
        request.url = URL(string: url.absoluteString + "api/open?name=\(name)&path=\(path)")
        request.httpMethod = "POST"
        request.setValue("text/html; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(html.utf8)
        request.timeoutInterval = 30
        _ = try? await URLSession.shared.data(for: request)
        deckPath = file
        await probe()
    }

    // MARK: - HTTP

    private func get(_ path: String, timeout: TimeInterval = 5) async -> [String: Any]? {
        guard let target = URL(string: url.absoluteString + path) else { return nil }
        var request = URLRequest(url: target)
        request.timeoutInterval = timeout
        guard let (data, _) = try? await URLSession.shared.data(for: request) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
