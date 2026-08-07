import Foundation

/// 遥控指令。与 deck 端 pair-client.js 的协议完全一致：{"type":"cmd","action":"next"}
/// 所以手表发出的指令，现有的 deck 和中转一行都不用改就能接。
enum RemoteAction: String, CaseIterable {
    case next, prev, first, last, black, present

    var label: String {
        switch self {
        case .next: return "下一页"
        case .prev: return "上一页"
        case .first: return "首页"
        case .last: return "末页"
        case .black: return "黑屏"
        case .present: return "放映态"
        }
    }
}

/// 连到 Slidesmith 中转（默认云端 Cloudflare Worker，也可指向本机 relay），
/// 以 role=remote 接入某个 room，把指令转给同一 room 里正在放映的 deck。
/// 手表和手机可以同时连同一个 room，互不冲突。
final class RelayClient: NSObject, ObservableObject {
    static let defaultRelay = "https://slidesmith-remote.zly-scu.workers.dev"

    /// 与中转的 WebSocket 是否连着
    @Published private(set) var isConnected = false
    /// 放映端（电脑上的 deck）在不在线 —— 决定了按了到底有没有用
    @Published private(set) var deckPresent = false
    @Published private(set) var statusText = "未配对"
    @Published private(set) var lastError: String?

    private var task: URLSessionWebSocketTask?
    private var urlSession: URLSession!
    private(set) var room: String?
    private(set) var relayBase: String = RelayClient.defaultRelay
    private var wantsConnection = false
    private var reconnectAttempt = 0
    private var pingTimer: Timer?
    /// 连接就绪前排队的指令（含入队时间，过期不补发）
    private var pendingCmds: [(RemoteAction, Date)] = []

    override init() {
        super.init()
        let cfg = URLSessionConfiguration.default
        cfg.waitsForConnectivity = true
        cfg.timeoutIntervalForRequest = 20
        urlSession = URLSession(configuration: cfg)
    }

    // MARK: - 连接

    func connect(room: String, relayBase: String? = nil) {
        guard !room.isEmpty else { return }
        // 已经连着同一个 room 就不重连
        if wantsConnection, self.room == room, let base = relayBase == nil ? self.relayBase : relayBase,
           base == self.relayBase, task != nil, isConnected { return }
        self.room = room
        if let base = relayBase, !base.isEmpty { self.relayBase = base }
        wantsConnection = true
        reconnectAttempt = 0
        openSocket()
    }

    func disconnect() {
        wantsConnection = false
        closeSocket()
        publish { self.isConnected = false; self.deckPresent = false; self.statusText = "已断开" }
    }

    private func openSocket() {
        guard let room = room, wantsConnection else { return }
        closeSocket()

        // http(s) → ws(s)
        var base = relayBase
        if base.hasSuffix("/") { base.removeLast() }
        let wsBase = base.replacingOccurrences(of: "https://", with: "wss://")
                         .replacingOccurrences(of: "http://", with: "ws://")
        guard var comps = URLComponents(string: wsBase + "/ws") else {
            publish { self.lastError = "中转地址无效"; self.statusText = "地址无效" }
            return
        }
        comps.queryItems = [
            URLQueryItem(name: "room", value: room),
            URLQueryItem(name: "role", value: "remote"),
        ]
        guard let url = comps.url else { return }

        publish { self.statusText = "连接中…" }
        let t = urlSession.webSocketTask(with: url)
        task = t
        t.resume()
        receiveLoop()
        startPing()
    }

    private func closeSocket() {
        pingTimer?.invalidate(); pingTimer = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    /// 中转空闲久了可能被中间设备掐断，定期 ping 保活
    private func startPing() {
        pingTimer?.invalidate()
        let timer = Timer(timeInterval: 20, repeats: true) { [weak self] _ in
            self?.task?.sendPing { _ in }
        }
        RunLoop.main.add(timer, forMode: .common)
        pingTimer = timer
    }

    private func scheduleReconnect() {
        guard wantsConnection else { return }
        reconnectAttempt += 1
        let delay = min(Double(reconnectAttempt) * 1.5, 8.0)
        publish { self.isConnected = false; self.deckPresent = false; self.statusText = "重连中…" }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, self.wantsConnection else { return }
            self.openSocket()
        }
    }

    // MARK: - 收

    private func receiveLoop() {
        task?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let err):
                self.publish { self.lastError = err.localizedDescription }
                self.scheduleReconnect()
            case .success(let message):
                switch message {
                case .string(let text): self.handle(text: text)
                case .data(let data): self.handle(text: String(data: data, encoding: .utf8) ?? "")
                @unknown default: break
                }
                self.receiveLoop()
            }
        }
    }

    private func handle(text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }

        // 中转在 joined / peer 两种消息里都带 peers:{deck,remote}
        if type == "joined" || type == "peer" {
            let peers = obj["peers"] as? [String: Any]
            let deck = (peers?["deck"] as? Int) ?? 0
            publish {
                self.isConnected = true
                self.reconnectAttempt = 0
                self.deckPresent = deck > 0
                self.statusText = deck > 0 ? "已连接放映端" : "等待放映端"
                self.lastError = nil
                self.flushPending()   // 补发唤醒期间排队的指令
            }
        }
    }

    // MARK: - 发

    @discardableResult
    func send(_ action: RemoteAction) -> Bool {
        if let task = task, isConnected { return rawSend(action, on: task) }
        // 还没连上（典型：手机 App 刚被手表唤醒，WebSocket 还没建好）。
        // 以前这里直接 return false → **第一条指令被丢掉**，表现为「按了没反应 / 要按两次」。
        // 改为排队，连上后立刻补发；只保留很短时间内的指令，避免久等后突然连翻好几页。
        pendingCmds.append((action, Date()))
        if pendingCmds.count > 4 { pendingCmds.removeFirst() }
        if wantsConnection, task == nil { openSocket() }
        return true
    }

    private func rawSend(_ action: RemoteAction, on task: URLSessionWebSocketTask) -> Bool {
        let payload: [String: Any] = ["type": "cmd", "action": action.rawValue]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else { return false }
        task.send(.string(text)) { [weak self] err in
            if let err = err {
                self?.publish { self?.lastError = err.localizedDescription }
                self?.scheduleReconnect()
            }
        }
        return true
    }

    /// 连接建立后补发刚才排队的指令（只补 4 秒内的，过期的丢弃）
    private func flushPending() {
        guard let task = task, isConnected, !pendingCmds.isEmpty else { return }
        let now = Date()
        let fresh = pendingCmds.filter { now.timeIntervalSince($0.1) < 4 }
        pendingCmds.removeAll()
        for (action, _) in fresh { _ = rawSend(action, on: task) }
    }

    private func publish(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }
}
