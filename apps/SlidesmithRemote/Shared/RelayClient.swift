import Foundation
import CryptoKit

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

/// 放映端每翻一页推来的状态。字段名与 deck 端 `pair-client.js` 的 `stateFromDom()` 一一对应。
///
/// **`slideIdx` 是 0 基的**——网页遥控端显示时统一 `+1`（`remote.html:202`）。
/// 别在解析这一层偷偷改基数，否则和网页端、和 `jump` 指令的页码就对不上了。
struct DeckState: Equatable {
    var slideIdx = 0
    var total = 0
    var title = ""
    var prevTitle = ""
    var nextTitle = ""
    /// 这一页在讲稿里对应的锚点（作者自定义，如 `s1-boom`）。手表靠它取当页讲稿。
    var anchor = ""

    /// 给人看的页码（1 基）
    var pageNo: Int { slideIdx + 1 }
    var pageLabel: String { total > 0 ? "\(pageNo) / \(total)" : "\(pageNo)" }
    /// 还剩几张（手表上「还有多少」比「第几页」更有用）
    var remaining: Int { max(0, total - pageNo) }
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
    /// 放映端当前页码 / 标题。手表靠它显示「3 / 44 · 下一张…」，iPhone 遥控页也显示。
    @Published private(set) var deckState: DeckState?
    /// deck 的文档标题（`deck-info` 里带来）
    @Published private(set) var deckTitle = ""
    /// 被中转判定「另一个窗口接管了这个房间」时的提示；正常情况下一直是 nil。
    @Published private(set) var evictedNotice: String?
    /// 放映端给这个房间设了遥控密码，但我们还没通过 —— iOS 界面据此弹输入框。
    @Published private(set) var needsPasscode = false
    @Published private(set) var passcodeNotice: String?
    /// 讲稿：锚点 → 纯文本。**只有手表用**（watchOS 没 WebKit，渲染不了 HTML）；
    /// iPhone 的讲稿页是 WebView 装整页，不看这里。
    @Published private(set) var notes: [String: String] = [:]

    /// 提词：锚点 → 作者在讲稿里手打的 <strong> 短语。手表主要看这个。
    @Published private(set) var cues: [String: [String]] = [:]

    /// 取某一页的讲稿正文
    func note(for anchor: String) -> String? {
        guard !anchor.isEmpty else { return nil }
        return notes[anchor]
    }

    /// 取某一页的提词
    func cue(for anchor: String) -> [String] {
        guard !anchor.isEmpty else { return [] }
        return cues[anchor] ?? []
    }

    private var task: URLSessionWebSocketTask?
    private var urlSession: URLSession!
    private(set) var room: String?
    private(set) var relayBase: String = RelayClient.defaultRelay
    private var wantsConnection = false
    private var reconnectAttempt = 0
    private var pingTimer: Timer?
    /// 连接就绪前排队的指令（含入队时间，过期不补发）
    private var pendingCmds: [(RemoteAction, Date)] = []
    /// 向放映端要一次当前状态（`need-info`）的重试定时器
    private var infoTimer: Timer?
    private var infoTries = 0
    /// 放映端有没有回过 deck-info（回过就说明讲稿这事有结论了，哪怕它没带讲稿）
    private var gotDeckInfo = false
    private static let parseQueue = DispatchQueue(label: "sm.transcript.parse", qos: .utility)

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
        publish {
            self.isConnected = false; self.deckPresent = false; self.statusText = "已断开"
            self.deckState = nil; self.evictedNotice = nil
            self.needsPasscode = false; self.passcodeNotice = nil
        }
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
        // 遥控密码：deck 设了密码时，中转要求同一个 sha256("slidesmith-remote:" + 密码)。
        // 没设密码的 deck 不带这个参数，行为和以前完全一样。
        var items = [
            URLQueryItem(name: "room", value: room),
            URLQueryItem(name: "role", value: "remote"),
        ]
        if let h = Self.storedPassHash(room: room) { items.append(URLQueryItem(name: "pass", value: h)) }
        comps.queryItems = items
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
        stopInfoRequests()
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

    // MARK: - 遥控密码

    /// 密码 → sha256("slidesmith-remote:" + 密码) 十六进制。和网页端、Studio 用的是同一个盐。
    static func passHash(_ code: String) -> String {
        let d = SHA256.hash(data: Data(("slidesmith-remote:" + code).utf8))
        return d.map { String(format: "%02x", $0) }.joined()
    }
    private static func passKey(_ room: String) -> String { "sm-pass-" + room }
    static func storedPassHash(room: String) -> String? {
        let v = UserDefaults.standard.string(forKey: passKey(room))
        return (v?.isEmpty == false) ? v : nil
    }
    /// 存下这个房间的密码哈希并重连。存哈希不存明文。
    func submitPasscode(_ code: String, room: String, relayBase: String? = nil) {
        UserDefaults.standard.set(Self.passHash(code), forKey: Self.passKey(room))
        publish { self.needsPasscode = false; self.passcodeNotice = nil }
        self.room = nil                      // 强制重开连接（connect 里有"同房间且已连上就跳过"的短路）
        connect(room: room, relayBase: relayBase)
    }
    /// 用户把密码弹窗划掉了：收起提示，但不重连（他可以稍后再点连接）。
    func clearPasscodePrompt() {
        publish { self.needsPasscode = false }
    }
    func forgetPasscode(room: String) {
        UserDefaults.standard.removeObject(forKey: Self.passKey(room))
    }

    private func handle(text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }

        switch type {
        // 中转在 joined / peer 两种消息里都带 peers:{deck,remote}
        case "joined", "peer":
            let peers = obj["peers"] as? [String: Any]
            let deck = (peers?["deck"] as? Int) ?? 0
            publish {
                self.isConnected = true
                self.reconnectAttempt = 0
                self.deckPresent = deck > 0
                self.statusText = deck > 0 ? "已连接放映端" : "等待放映端"
                self.lastError = nil
                self.flushPending()   // 补发唤醒期间排队的指令
                if deck > 0 {
                    self.evictedNotice = nil
                    // 放映端在线但我们还不知道它翻到第几页 —— 去要一次。
                    if self.deckState == nil || !self.gotDeckInfo { self.startInfoRequests() }
                } else {
                    // 放映端下线了，页码立刻作废：手表上留着「3 / 44」比空着更误导人。
                    self.deckState = nil
                    self.stopInfoRequests()
                    // 讲稿不清：同一份 deck 重连回来还是那份，留着能少拉一次 30–60 KB。
                    // 但要把「问过了」的标记复位，换了 deck 才会重新去要。
                    self.gotDeckInfo = false
                }
            }

        // 每翻一页推一次，几十字节
        case "state":
            guard let st = Self.parseState(obj["state"]) else { return }
            publish { self.deckState = st; self.stopInfoRequestsIfDone() }

        // 配对时推一次。**txb64（讲稿全文，30–60 KB）故意不解析**——原生这层用不上它，
        // 讲稿是「讲稿」标签页里的 WebView 直接渲染网页端那一套。这里只要标题和随包
        // 带来的 state：deck 只在**翻页时**才推 state，中途接进来不问就一直是空的。
        case "deck-info":
            let title = (obj["title"] as? String) ?? ""
            let st = Self.parseState(obj["state"])
            let txb64 = (obj["txb64"] as? String) ?? ""
            // 作者定稿的提词表（presenter-mode 开了 watch mode 才有）。
            // **有它就以它为准** —— 那是逐页校验过的；运行时从讲稿抠 <strong> 只是兜底，
            // 因为 <strong> 在讲稿里同时担着「阅读强调」和「口播提词」两个角色，
            // 实测一份 45 页真讲稿里抠出来的约三分之一不合规（太长 / 是结构标签）。
            let authored: [String: [String]]? = (obj["cues"] as? [String: Any]).map { raw in
                var out: [String: [String]] = [:]
                for (k, v) in raw {
                    guard let arr = v as? [Any] else { continue }
                    let items = arr.compactMap { $0 as? String }
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                    if !items.isEmpty { out[k] = items }
                }
                return out
            }
            publish {
                if !title.isEmpty { self.deckTitle = title }
                if let st = st { self.deckState = st }
                self.gotDeckInfo = true
                if let a = authored, !a.isEmpty { self.cues = a }
                self.stopInfoRequestsIfDone()
            }
            // 30–60 KB 的 HTML 正则拆解，别放主线程 —— 手表上尤其明显。
            guard !txb64.isEmpty else {
                publish { self.notes = [:]; if authored == nil { self.cues = [:] } }
                return
            }
            let needParseCues = (authored?.isEmpty ?? true)
            Self.parseQueue.async { [weak self] in
                let parsed = TranscriptNotes.parse(base64: txb64)
                let cued = needParseCues ? TranscriptNotes.parseCues(base64: txb64) : nil
                self?.publish {
                    self?.notes = parsed
                    if let cued = cued { self?.cues = cued }
                }
            }

        // 中转只把 evicted 发给**被顶掉的那个 deck**（relay.mjs:105 / worker.mjs:55），
        // 遥控端正常收不到。留这个分支是防御性的：万一以后中转改成也通知遥控端，
        // 界面不至于继续显示「已连接」还往空房间发指令。
        // 中转说「要密码」/「错太多次了」——存的哈希作废，让界面弹输入框。
        case "auth-required", "auth-locked":
            let reason = obj["reason"] as? String
            let wait = obj["wait"] as? Int
            let left = obj["left"] as? Int
            if let r = room { forgetPasscode(room: r) }
            wantsConnection = false          // 别再自动重连——拿着作废的哈希重试只会一直被拒
            closeSocket()
            publish {
                self.isConnected = false; self.deckPresent = false
                self.needsPasscode = true
                if type == "auth-locked" {
                    self.passcodeNotice = "密码错太多次，请 \(wait ?? 60) 秒后再试"
                } else if reason == "bad" {
                    self.passcodeNotice = "密码不对" + (left.map { "，还可以试 \($0) 次" } ?? "")
                } else {
                    self.passcodeNotice = "这份 slides 设了遥控密码"
                }
                self.statusText = "需要遥控密码"
            }

        case "evicted":
            publish {
                self.deckPresent = false
                self.deckState = nil
                self.evictedNotice = "这份 slides 的另一个窗口接管了遥控"
                self.statusText = "放映端已被另一个窗口接管"
                self.stopInfoRequests()
            }

        default:
            break
        }
    }

    /// 把 `state` 对象解析成 DeckState。JSON 数字过来是 NSNumber，`as? Int` 能直接吃。
    private static func parseState(_ any: Any?) -> DeckState? {
        guard let d = any as? [String: Any], let idx = d["slideIdx"] as? Int else { return nil }
        var st = DeckState()
        st.slideIdx = max(0, idx)
        st.total = (d["total"] as? Int) ?? 0
        st.title = (d["title"] as? String) ?? ""
        st.prevTitle = (d["prevTitle"] as? String) ?? ""
        st.nextTitle = (d["nextTitle"] as? String) ?? ""
        st.anchor = (d["anchor"] as? String) ?? ""
        return st
    }

    // MARK: - 问一次「你现在第几页」

    /// 协议里没有「只要状态」的请求，只有 `need-info`（会连讲稿一起推回来）。
    /// 所以这里**一拿到状态就停**，并且封顶重试次数——网页端那种「每 2 秒问到手为止」
    /// 是因为它真的要讲稿；原生只要几十字节的页码，不值得反复把 30–60 KB 拉回来。
    private func startInfoRequests() {
        guard infoTimer == nil, wantsConnection else { return }
        infoTries = 0
        requestInfo()
        let t = Timer(timeInterval: 2, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            self.infoTries += 1
            let wantMore = (self.deckState == nil) || !self.gotDeckInfo
            guard self.wantsConnection, wantMore, self.deckPresent, self.infoTries < 8 else {
                timer.invalidate(); self.infoTimer = nil; return
            }
            self.requestInfo()
        }
        RunLoop.main.add(t, forMode: .common)
        infoTimer = t
    }

    private func stopInfoRequests() {
        infoTimer?.invalidate()
        infoTimer = nil
    }

    /// 页码和讲稿两样都有结论了才停。
    /// 手表要讲稿，所以不能像最初那样「拿到 state 就收工」——那样 txb64 永远等不到。
    private func stopInfoRequestsIfDone() {
        if deckState != nil, gotDeckInfo { stopInfoRequests() }
    }

    private func requestInfo() {
        guard let task = task, isConnected else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: ["type": "need-info"]),
              let text = String(data: data, encoding: .utf8) else { return }
        task.send(.string(text)) { _ in }
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
