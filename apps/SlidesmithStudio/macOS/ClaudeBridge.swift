import Foundation
import Observation

/// app 这一侧的 Claude 客户端。**它连的是 `bridge/claude-bridge.py`，不自己 spawn claude。**
///
/// 换回来的理由是**常驻会话**：每轮重开一个 `claude -p`，冷启动（装 MCP 工具定义、
/// 读 CLAUDE.md）就要十几秒，而且每轮都要付；桥把进程留着、多轮往 stdin 喂，
/// 本机实测第二轮起约 1.5 秒。这个差别不是"快一点"，是"能不能一边编辑一边问"。
///
/// 桥接**不解析、不改写、不注入任何提示词**，把 claude stdout 的每一行 JSON 原样
/// 以 SSE 转过来。所以这个面板和你终端里的 Claude Code 是**同一个东西**：
/// skill、MCP（含 `slidesmith_apply_patch`）、CLAUDE.md、`_memory/` 全部原样生效。
///
/// 桥接的生命周期跟着 app 走：app 起来时拉起它，退出时连常驻会话一起收掉。
/// 不装 launchd、不开机自启——**看不见的常驻才是负担。**
///
/// 这份是 OmniSecretary `app/macOS/ClaudeBridge.swift` 的移植，删掉了它那边
/// 特有的东西（Bonjour 发现、口令、头显设备、听写、闪念库）。留下的每一条注释
/// 都是那边真机上栽出来的，改之前先想清楚。
@MainActor
@Observable
final class ClaudeBridge {

    static let logName = "SlidesmithStudio-claude-bridge"
    private static let residentKey = "smClaudeResident"
    /// 桥自己会在被占时往后顺延，所以客户端也得扫这一段。
    /// 基号见 skill `connect-to-claude` 的 reference/ports.md（各项目至少隔 20，
    /// 否则顺延会撞进邻居的段里）。
    private static let portRange = 8991...9002
    /// 桥在 `/health` 里报的身份。**必须校验**——只认"有个健康的东西答了"的话，
    /// 扫到邻居项目的桥也会当成自己的，而那个 claude 的工作目录是别的仓库：
    /// 表现是"它答得头头是道但全错"，最难查的一类。
    private static let appIdentity = "SlidesmithStudio"

    struct Model: Identifiable, Hashable {
        var id: String
        var label: String
    }

    /// 一次工具调用。
    ///
    /// 以前这里只留一个名字（`["apply_patch"]`），界面上就只能显示「它用了 apply_patch」——
    /// 用户真正想知道的是**它动了哪一页、成没成**。所以 id（用来把结果对上号）、
    /// 目标、状态三样都得留。
    struct ToolCall: Identifiable, Equatable {
        var id: String
        var name: String
        /// 「它动的是什么」：data-id / 文件路径 / 命令。整包参数可能是一整页 HTML，不留。
        var target: String = ""
        var status: Status = .running
        /// 出错时的原因摘要。成功时留空——成功不需要解释。
        var detail: String = ""

        enum Status: Equatable { case running, ok, failed }
    }

    struct Turn: Identifiable {
        let id = UUID()
        var role: Role
        var text: String
        var tools: [ToolCall] = []

        /// `notice` 是面板自己说的话（`/clear` 的回执之类），不进 CLI 的对话历史，
        /// 也不花 token。
        enum Role { case user, assistant, notice }
    }

    /// 上下文与花费。数据来自 `result` 事件——不显示的话，「会不会撑爆」这个问题
    /// 在界面上永远没有答案。
    struct Usage {
        var contextTokens = 0
        var outputTokens = 0
        var costUSD: Double = 0
        var turns = 0
        /// 粗略的"满没满"。Claude Code 到阈值会自动压缩，不会真的爆，
        /// 但你有权提前知道它快压了。
        var fill: Double { min(1, Double(contextTokens) / 180_000) }
    }

    /// 常驻档位 = 桥的 `mode`。**和另外三个旋钮不是一类东西**：模型/力度/放权是
    /// `claude` 进程的启动参数，这个是**桥自己**的策略——它决定那个进程答完之后
    /// 还留不留着。
    ///
    /// | 档 | 行为 | 常驻开销 |
    /// |---|---|---|
    /// | `off` | 每轮一个进程，答完就死 | 零 |
    /// | `onDemand`（默认） | 第一次问才起，空闲 N 分钟自己退 | 只在你用的时候付 |
    /// | `always` | 起来就不退（除非崩） | 一直付 |
    ///
    /// **默认必须是 onDemand。** 理由很具体：`always` 的服务在你忘了它之后还活着，
    /// `onDemand` 的服务在你不用之后自己消失。**看不见的常驻才是负担。**
    /// 而且**闲置回收是 onDemand 独有的**——切到 always 就等于自己认下这笔账
    /// （一个会话连它那套 MCP 副本，实测约 2 GB）。
    enum Resident: String, CaseIterable, Identifiable, Sendable {
        case off, onDemand, always

        var id: String { rawValue }

        var label: String {
            switch self {
            case .off:      "不常驻 · 每次重开"
            case .onDemand: "按需常驻（默认）"
            case .always:   "一直常驻 · 最快"
            }
        }

        var detail: String {
            switch self {
            case .off:      "答完就退，零后台开销。代价是每一句都要等十几秒冷启动。"
            case .onDemand: "第一次问才起，闲够就自己退。用的时候才付钱。"
            case .always:   "起来就不退，问什么都是秒回。**闲着也占着约 2 GB**，退出 app 才释放。"
            }
        }
    }

    /// 推理力度 = CLI 的 `--effort`。**和 model / permission-mode 是同一类东西：
    /// 进程的启动参数，不是每轮参数**——CLI 没有"这一轮临时换力度"这回事，
    /// 换了桥就得换进程（`SessionPool.get` 会据此判断）。
    ///
    /// `nil` = 不传这个 flag，用 CLI 自己的默认值。**默认就该是 nil**：
    /// 写死一个档位等于替用户做了一个他没要求的选择，而且 CLI 以后改默认值时
    /// 这里会悄悄跟不上。
    enum Effort: String, CaseIterable, Identifiable, Sendable {
        case low, medium, high, xhigh, max

        var id: String { rawValue }

        var label: String {
            switch self {
            case .low:    "低 · 最快"
            case .medium: "中"
            case .high:   "高"
            case .xhigh:  "更高"
            case .max:    "最高 · 最慢"
            }
        }
    }

    /// 放权档位 = CLI 的 `--permission-mode`，就是终端里 Shift+Tab 切的那个。
    /// **摆到台面上**：写死的话"它能不能自己跑命令"这件事既看不见也改不了。
    enum Autonomy: String, CaseIterable, Identifiable, Sendable {
        case plan = "plan"
        case ask = "default"
        case edits = "acceptEdits"
        case full = "bypassPermissions"

        var id: String { rawValue }

        var label: String {
            switch self {
            case .plan:  "只读 · 先给方案"
            case .ask:   "谨慎 · 改动都要问"
            case .edits: "改文件免问"
            case .full:  "完全自动 · 含命令行（默认）"
            }
        }

        var detail: String {
            switch self {
            case .plan:  "只看不动手，先出方案给你过目。"
            case .ask:   "每次改动都要确认——但面板弹不出确认框，多半只会失败。"
            case .edits: "改文件不用问，跑命令仍会被挡。"
            case .full:  "文件和命令都放开。改 deck、跑导出、装依赖都能自己完成。"
            }
        }
    }

    // MARK: - 对外状态

    private(set) var turns: [Turn] = []
    private(set) var streamingText = ""
    private(set) var streamingTools: [ToolCall] = []
    private(set) var running = false
    private(set) var connected = false
    private(set) var usage = Usage()
    private(set) var models: [Model] = [Model(id: "sonnet", label: "Sonnet")]
    private(set) var sessions: [[String: Any]] = []
    /// 池子里还活着几个常驻会话。**必须显示出来**——看得见的常驻不是负担，
    /// 看不见的才是。桥是 app 悄悄拉起来的，它的 stdout 没人看。
    var liveSessions: Int { sessions.filter { $0["alive"] as? Bool == true }.count }
    private(set) var resident: Resident = .onDemand
    private(set) var idleMinutes: Double = 10
    private(set) var note: String?
    private(set) var lastError: String?

    /// 磁盘上的历史会话（桥的 /sessions 给的）。翻回去接着聊用。
    struct HistorySession: Identifiable, Equatable {
        var id: String          // session_id
        var title: String
        var updated: Date
        var live: Bool          // 还有常驻进程
    }
    private(set) var history: [HistorySession] = []
    private(set) var loadingHistory = false
    /// 这一轮正在重试第几次（桥转发的 system/api_retry）。0 = 没在重试。
    private(set) var retrying = 0
    /// 已经按了「停这一轮」，正在等它收尾。界面靠它把按钮变成「正在停…」。
    private(set) var interrupting = false

    var model = "sonnet"
    var effort: Effort? {
        didSet { guard oldValue != effort else { return }
                 notice("推理力度已切到「\(effort?.label ?? "默认")」——下一轮生效（换进程）。") }
    }
    var autonomy: Autonomy = .full {
        // 权限档是**进程的启动参数**，改了下一轮桥会换进程。这里只要记住就行。
        didSet { guard oldValue != autonomy else { return }
                 notice("放权档位已切到「\(autonomy.label)」——下一轮生效（换进程）。") }
    }

    private var endpoint: URL?
    private var sessionID: String?
    private var bridgeProcess: Process?
    private var streamTask: Task<Void, Never>?
    /// 正在启动中的那一次。**start() 必须幂等**——app 的生命周期和面板的
    /// `.task` 都会调它，两次并发跑完整流程的结果是：两个都探不到桥、两个都
    /// spawn，第二个撞端口顺延到 8933 变成**没人持有的孤儿进程**（app 只记得
    /// 一个 Process，退出时收不掉它）。这正是"看不见的常驻"。
    private var startTask: Task<Void, Never>?

    // 流式缓冲：逐 token 刷 UI 会把主线程压死，80ms 攒一批。
    private var streamOpen = false
    private var streamChunkBuffer = ""
    private var streamFlushScheduled = false
    private var pendingStreamText: String { streamingText + streamChunkBuffer }

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
        // **先把游荡在外的自家桥收掉，再起一条自己的。**
        //
        // 原来是"探到活的就直接用"。看着省事，代价是**这条桥永远不归 app 所有**：
        // `shutdown()` 只 terminate 自己 spawn 的那个 Process，接来的那条它碰不到。
        // 于是 app 一旦崩过 / 被强制退出，桥就变成 ppid=1 的孤儿活下去，之后每次
        // 启动都只是"又接上了它"，退出时又收不掉——而它名下挂着常驻会话，
        // **一个会话就 2 GB**。
        //
        // 真机实证（2026-08-19，用户机器上的另一个 app）：一条 8 月 14 日留下的
        // 孤儿桥活了五天，挂着 4 个闲置了一小时的会话共 1.47 GB，当天的 app 实例
        // 只是接上去用，退出它一个字节都不会释放。
        //
        // 接管的代价只有一两秒，换来的是**"退出 app＝全部释放"这句话真的成立**。
        await evictStrayBridges()
        guard spawn(root: root) else { return }
        for _ in 0..<60 {
            if await discover() { await applyStoredResident(); return }
            try? await Task.sleep(for: .milliseconds(250))
        }
        note = "Claude 桥 15 秒还没起来。日志：\(RepoLocator.logURL(Self.logName).path)"
    }

    private func spawn(root: URL) -> Bool {
        let script = root.appendingPathComponent("apps/SlidesmithStudio/bridge/claude-bridge.py")
        guard FileManager.default.isReadableFile(atPath: script.path) else {
            note = "找不到 \(script.path)"
            return false
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["python3", script.path]
        process.currentDirectoryURL = root
        process.environment = RepoLocator.childEnvironment()
        if let log = RepoLocator.logHandle(Self.logName) {
            process.standardOutput = log
            process.standardError = log
        }
        do {
            try process.run()
            bridgeProcess = process
            return true
        } catch {
            note = "拉不起 Claude 桥：\(error.localizedDescription)"
            return false
        }
    }

    /// 把端口段里所有**自家**的桥请退位（别人家的一个字不碰）。
    ///
    /// 扫整段而不是只看基号：孤儿也可能是当初顺延上去的。
    private func evictStrayBridges() async {
        for port in Self.portRange {
            let candidate = URL(string: "http://127.0.0.1:\(port)/")!
            guard await health(at: candidate) != nil else { continue }   // health 里已校验 app 身份
            var request = URLRequest(url: candidate.appendingPathComponent("quit"))
            request.httpMethod = "POST"
            request.timeoutInterval = 3
            _ = try? await URLSession.shared.data(for: request)
            note = "收掉了一条游荡在 \(port) 的旧桥接（上次没退干净），正在起新的"
        }
        // 等端口真的放开——桥那边的 shutdown() 是另起线程做的，不是立刻完成。
        try? await Task.sleep(for: .milliseconds(700))
    }

    /// app 退出时调。桥是我们拉起来的，就得由我们收——**连它带常驻会话一起**。
    /// 它接了 SIGTERM 会自己关掉所有常驻的 claude 进程。
    func shutdown() {
        streamTask?.cancel()
        bridgeProcess?.terminate()
        bridgeProcess = nil
        endpoint = nil
        connected = false
    }

    /// 改了 `claude-bridge.py` 之后用。请旧实例退位，再拉一个新的。
    func restart() async {
        if let endpoint {
            var request = URLRequest(url: endpoint.appendingPathComponent("quit"))
            request.httpMethod = "POST"
            request.timeoutInterval = 3
            _ = try? await URLSession.shared.data(for: request)
        }
        bridgeProcess?.terminate()
        bridgeProcess = nil
        endpoint = nil
        connected = false
        try? await Task.sleep(for: .milliseconds(600))
        await start()
    }

    // MARK: - 探测

    @discardableResult
    private func discover() async -> Bool {
        for port in Self.portRange {
            let candidate = URL(string: "http://127.0.0.1:\(port)/")!
            guard let json = await health(at: candidate) else { continue }
            endpoint = candidate
            absorb(health: json)
            connected = true
            note = nil
            return true
        }
        connected = false
        return false
    }

    func refreshStatus() async {
        guard let endpoint, let json = await health(at: endpoint) else {
            connected = false
            return
        }
        absorb(health: json)
        connected = true
    }

    private func health(at base: URL) async -> [String: Any]? {
        var request = URLRequest(url: base.appendingPathComponent("health"))
        request.timeoutInterval = 2
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        // 别人家的桥（或者别的什么恰好也叫 /health 的服务）→ 当没看见，继续扫。
        guard json["app"] as? String == Self.appIdentity else { return nil }
        return json
    }

    private func absorb(health json: [String: Any]) {
        if let raw = json["models"] as? [[String: String]] {
            models = raw.compactMap { entry in
                guard let id = entry["id"] else { return nil }
                return Model(id: id, label: entry["label"] ?? id)
            }
        }
        sessions = (json["sessions"] as? [[String: Any]]) ?? []
        if let mode = json["mode"] as? String, let parsed = Resident(rawValue: mode) { resident = parsed }
        if let idle = json["idle_minutes"] as? Double { idleMinutes = idle }
        if json["ok"] as? Bool == false {
            note = "桥接找不到 claude 可执行文件（\(json["claude"] as? String ?? "?")）"
        }
    }

    /// 改常驻档位。`off` 会顺手把已经起来的都关掉（桥那边做的）。
    func setResident(_ mode: Resident) async {
        guard let endpoint else { return }
        UserDefaults.standard.set(mode.rawValue, forKey: Self.residentKey)
        var request = URLRequest(url: endpoint.appendingPathComponent("config"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["mode": mode.rawValue])
        request.timeoutInterval = 5
        _ = try? await URLSession.shared.data(for: request)
        await refreshStatus()
        notice("常驻档位已切到「\(mode.label)」。" + mode.detail)
    }

    /// **每次桥起来之后都要把用户选的档位推一遍。**
    ///
    /// 桥每次启动都用它自己的默认值（onDemand）——app 退出会把桥连同常驻会话
    /// 一起收掉，所以"上次选的 always"这件事只活在 app 这边。不推的话，
    /// 用户会发现「我明明设了一直常驻，重开 app 又变回按需了」。
    private func applyStoredResident() async {
        guard let saved = UserDefaults.standard.string(forKey: Self.residentKey),
              let mode = Resident(rawValue: saved), mode != .onDemand else { return }
        guard let endpoint else { return }
        var request = URLRequest(url: endpoint.appendingPathComponent("config"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["mode": mode.rawValue])
        request.timeoutInterval = 5
        _ = try? await URLSession.shared.data(for: request)
        await refreshStatus()
    }

    // MARK: - 提问

    func send(_ prompt: String) {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if handleAppCommand(text) { return }
        guard !running else {
            notice("上一轮还在跑。等它答完，或者按「停」。")
            return
        }
        turns.append(Turn(role: .user, text: text))
        beginStreaming()
        streamTask = Task { await self.stream(text) }
    }

    /// 用户在 Studio 里点「发送给 Claude」提交的待办。
    ///
    /// 和手打的一句话走的是同一条路，只是：① 气泡里显示一句人话而不是那一大坨
    /// prompt（里面有整页 HTML，糊在对话框里没人看得下去）；② 用户开了「改前先问我」
    /// 时，明确要求它 `preview=true` 回写。
    func sendStudioRequest(_ request: DeckBridge.Request) {
        guard !running else {
            notice("Studio 提交了一条待办，但上一轮还在跑——等这轮完再点一次发送。")
            return
        }
        let summary = "📋 来自 Studio 的待办：改 \(request.count) 页"
            + (request.confirm ? "（改前先问我）" : "")
        turns.append(Turn(role: .user, text: summary))
        var prompt = request.content
        if request.confirm {
            prompt += "\n\n---\n注意：用户开了「改前先问我」。用 slidesmith_apply_patch 回写时"
                + "**必须把 preview 设为 true**，让 Studio 以「保留/还原」的形式先呈现给他看。"
        }
        beginStreaming()
        streamTask = Task { await self.stream(prompt) }
    }

    /// 叫停当前这一轮，**会话留着**。
    ///
    /// 桥那边走的是 stdin 的控制协议（不是信号）——进程活着、上下文在、
    /// 下一句接着聊。界面上这颗按钮的意思因此是「这轮别跑了」，不是「关掉重来」。
    func interrupt() {
        guard running, !interrupting, let endpoint, let sid = sessionID else { return }
        interrupting = true
        Task {
            var request = URLRequest(url: endpoint.appendingPathComponent("interrupt"))
            request.httpMethod = "POST"
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["session_id": sid])
            _ = try? await URLSession.shared.data(for: request)
        }
        // **故意不 cancel 本地的流。** 中断之后 CLI 会把这一轮正常收尾、照常吐
        // `result`；这时候把 SSE 掐了，那些收尾输出就没人读——而这条连接一断，
        // 桥会把进程丢掉，等于把「保住会话」这件事自己毁了。让它自然收完，
        // 只多等一两秒，状态是对的。
    }

    /// 拉一遍磁盘上的历史会话。
    func loadHistory() async {
        guard let endpoint else { return }
        loadingHistory = true
        defer { loadingHistory = false }
        var request = URLRequest(url: endpoint.appendingPathComponent("sessions"))
        request.timeoutInterval = 20
        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rows = json["sessions"] as? [[String: Any]] else { return }
        history = rows.compactMap { row in
            guard let id = row["session_id"] as? String else { return nil }
            let raw = (row["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return HistorySession(
                id: id,
                title: raw.isEmpty ? "（没有开场白）" : raw,
                updated: Date(timeIntervalSince1970: row["updated"] as? Double ?? 0),
                live: row["live"] as? Bool ?? false)
        }
    }

    /// 翻回某一段历史会话：把它的轮次读进来，之后的对话接着那一段说。
    ///
    /// **不是只把文字贴出来**——`sessionID` 一并换过去，所以下一句是真的接在
    /// 那段上下文后面，claude 那边走 `--resume`。
    func resume(_ session: HistorySession) async {
        guard let endpoint, !running else {
            if running { notice("这一轮还在跑，等它答完再翻历史。") }
            return
        }
        var comps = URLComponents(url: endpoint.appendingPathComponent("history"),
                                  resolvingAgainstBaseURL: false)
        comps?.queryItems = [URLQueryItem(name: "session", value: session.id)]
        guard let url = comps?.url else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rows = json["turns"] as? [[String: Any]] else {
            notice("这段会话读不出来。")
            return
        }
        turns = rows.compactMap { row in
            let role: Turn.Role = (row["role"] as? String == "user") ? .user : .assistant
            let text = row["text"] as? String ?? ""
            let tools = (row["tools"] as? [[String: Any]] ?? []).map { d in
                ToolCall(id: UUID().uuidString,
                         name: (d["name"] as? String ?? "").components(separatedBy: "__").last ?? "",
                         target: d["input"] as? String ?? "",
                         status: .ok)          // 历史里没有结果状态，一律当成跑完了
            }
            if text.isEmpty && tools.isEmpty { return nil }
            return Turn(role: role, text: text, tools: tools)
        }
        sessionID = session.id
        usage = Usage()
        notice("已翻回这段会话（\(turns.count) 轮）。接着说就是续在它后面。")
    }

    private func beginStreaming() {
        streamingText = ""
        streamingTools = []
        streamChunkBuffer = ""
        streamOpen = true
        running = true
        lastError = nil
        retrying = 0
        interrupting = false
    }

    /// POST /chat，把 SSE 逐行喂给 stream-json 解析。桥是原样转发的，
    /// 所以 `handle(_:)` 和终端里那套是同一份语义——**换的是运输方式，不是内容**。
    private func stream(_ text: String) async {
        guard let endpoint else {
            fail("还没连上桥接。")
            return
        }
        var request = URLRequest(url: endpoint.appendingPathComponent("chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // 一轮可能要跑很久（读文件、调 MCP、改 20 页），别让 URLSession 自己掐断。
        request.timeoutInterval = 1800
        var payload: [String: Any] = [
            "prompt": text,
            "model": model,
            "permission_mode": autonomy.rawValue,
        ]
        if let sessionID { payload["session_id"] = sessionID }
        if let effort { payload["effort"] = effort.rawValue }
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                fail("桥接返回了 \((response as? HTTPURLResponse)?.statusCode ?? -1)")
                return
            }
            for try await line in bytes.lines {
                if Task.isCancelled { break }
                guard line.hasPrefix("data: ") else { continue }
                handle(String(line.dropFirst(6)))
            }
        } catch {
            if !Task.isCancelled {
                fail("桥接断了：\(error.localizedDescription)")
                return
            }
        }
        running = false
        finishStreaming()
        await refreshStatus()
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        running = false
        finishStreaming()
        // **进程也要丢。** 客户端走了但 claude 还在跑这一轮，残留输出没人排干——
        // 留着它，下一问会先读到上一问的剩余输出，答案从此永久错位一格。
        // 丢进程不丢磁盘记录，下一句靠 --resume 无缝接上。
        if let endpoint, let sessionID {
            Task {
                var request = URLRequest(url: endpoint.appendingPathComponent("stop"))
                request.httpMethod = "POST"
                request.httpBody = try? JSONSerialization.data(withJSONObject: ["session_id": sessionID])
                _ = try? await URLSession.shared.data(for: request)
            }
        }
    }

    /// 把会话先热好，不占用你的第一句话。冷启动那十几秒躲不掉，
    /// 但**可以藏在你打字的那几秒里**——所以输入框一获得焦点就调它。
    func warmup() async {
        guard let endpoint, !running else { return }
        var request = URLRequest(url: endpoint.appendingPathComponent("warmup"))
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        // **预热的参数必须和真问那一轮完全一致。** 差一个 effort，`SessionPool.get`
        // 就判定"换进程"，刚热好的那个当场被丢掉——白等，而且看不出来。
        var payload: [String: Any] = ["model": model, "permission_mode": autonomy.rawValue]
        if let effort { payload["effort"] = effort.rawValue }
        if let sessionID { payload["session_id"] = sessionID }
        if let effort { payload["effort"] = effort.rawValue }
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        if let sid = json["session_id"] as? String { sessionID = sid }
        await refreshStatus()
    }

    func newConversation() {
        stop()
        sessionID = nil
        turns.removeAll()
        usage = Usage()
        notice("新对话。上一段仍在磁盘上，需要的话可以从终端 `claude --resume` 找回。")
    }

    // MARK: - 面板自己接管的命令

    private func handleAppCommand(_ text: String) -> Bool {
        switch text {
        case "/clear", "/新对话":
            newConversation()
            return true
        case "/诊断":
            Task { await runDiagnosis() }
            return true
        default:
            return false
        }
    }

    private func runDiagnosis() async {
        var lines = ["**桥接诊断**"]
        lines.append("· 端点：\(endpoint?.absoluteString ?? "（没连上）")")
        lines.append("· 会话：\(sessionID ?? "（还没有）")")
        lines.append("· 模型：\(model) · 力度：\(effort?.label ?? "默认") · 放权：\(autonomy.label)")
        if let endpoint, let json = await health(at: endpoint) {
            lines.append("· cwd：\(json["cwd"] as? String ?? "?")")
            lines.append("· claude：\(json["claude"] as? String ?? "?")")
            lines.append("· 常驻档：\(json["mode"] as? String ?? "?") · 池中 \(sessions.count) 个")
        } else {
            lines.append("· ⚠️ /health 问不到")
        }
        if let tail = RepoLocator.logTail(Self.logName, 12) {
            lines.append("\n桥接日志最后几行：\n```\n\(tail)\n```")
        }
        turns.append(Turn(role: .notice, text: lines.joined(separator: "\n")))
    }

    private func notice(_ text: String) {
        turns.append(Turn(role: .notice, text: text))
    }

    private func fail(_ message: String) {
        lastError = message
        appendToLast("\n⚠️ \(message)")
        running = false
        finishStreaming()
    }

    // MARK: - stream-json 解析

    private func handle(_ raw: String) {
        guard !raw.isEmpty,
              let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return }

        switch type {
        case "system":
            if let sid = json["session_id"] as? String { sessionID = sid }
            // 重试要说出来。不说的话表现是「它突然不动了」，而其实是 API 在退避重试。
            if json["subtype"] as? String == "api_retry" {
                retrying = json["attempt"] as? Int ?? 1
            }

        case "user":
            // 工具**结果**回来的时候，角色是 user（一条 tool_result）。以前这一支
            // 根本没接，所以界面上工具永远停在「正在跑」，成没成看不出来。
            guard let message = json["message"] as? [String: Any],
                  let content = message["content"] as? [[String: Any]] else { return }
            for block in content where block["type"] as? String == "tool_result" {
                closeToolCall(id: block["tool_use_id"] as? String ?? "",
                              failed: block["is_error"] as? Bool == true,
                              content: block["content"])
            }

        case "stream_event":
            guard let event = json["event"] as? [String: Any],
                  event["type"] as? String == "content_block_delta",
                  let delta = event["delta"] as? [String: Any],
                  delta["type"] as? String == "text_delta",
                  let piece = delta["text"] as? String else { return }
            appendToLast(piece)

        case "assistant":
            // 工具调用单独列出来——它在改你的 deck，你有权看见它动了什么。
            guard let message = json["message"] as? [String: Any],
                  let content = message["content"] as? [[String: Any]] else { return }
            for block in content where block["type"] as? String == "tool_use" {
                guard let name = block["name"] as? String else { continue }
                noteToolUse(id: block["id"] as? String ?? UUID().uuidString,
                            name: name, input: block["input"] as? [String: Any])
            }
            // **正文兜底。** 平时文字是从 stream_event 的 text_delta 一片片来的；
            // 这里只当那一路没来时的备份：气泡还空着才填，否则会把已显示的再贴一遍。
            // 少了这一条，只要 partial message 因为任何原因没到，界面就是空白——
            // 而模型其实是答了的。
            guard streamOpen,
                  pendingStreamText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else { return }
            let spoken = content
                .filter { $0["type"] as? String == "text" }
                .compactMap { $0["text"] as? String }
                .joined()
            if !spoken.isEmpty { replaceLast(spoken) }

        case "result":
            if let sid = json["session_id"] as? String { sessionID = sid }
            noteUsage(json)
            guard streamOpen,
                  pendingStreamText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else { return }
            if let result = json["result"] as? String, !result.isEmpty {
                replaceLast(result)
                return
            }
            // **出错收场时要说是哪种错。** 只认"result 是字符串"的话，出错那一支
            // 会变成一句「没有返回内容」——它把"出错了"和"根本没跑到"说成了同一件事。
            if json["is_error"] as? Bool == true || json["subtype"] as? String != "success" {
                let subtype = json["subtype"] as? String ?? "未知"
                lastError = "这一轮以错误收场（\(subtype)）。详情看桥接日志："
                    + RepoLocator.logURL(Self.logName).path
            }

        case "bridge":
            // 桥自己的事件。error 必须进错误路径——不解析它，会话复活失败那类故障
            // 就永远以「空白回答」的形态出现，一点线索不留。
            if json["event"] as? String == "error" {
                let message = json["message"] as? String ?? "桥接报了个没有正文的错误"
                lastError = "桥接错误：\(message.prefix(300))"
            }

        default:
            break
        }
    }

    /// 上下文大小 = 这一轮真正喂进模型的 token（新输入 + 命中缓存的历史 +
    /// 新写进缓存的历史）。`--resume` 会把整段对话重放，所以它只增不减，
    /// 直到 Claude Code 自动压缩把它砍下来。
    private func noteUsage(_ json: [String: Any]) {
        if let cost = json["total_cost_usd"] as? Double { usage.costUSD += cost }
        if let turns = json["num_turns"] as? Int { usage.turns = turns }
        guard let raw = json["usage"] as? [String: Any] else { return }
        let input = raw["input_tokens"] as? Int ?? 0
        let cacheRead = raw["cache_read_input_tokens"] as? Int ?? 0
        let cacheWrite = raw["cache_creation_input_tokens"] as? Int ?? 0
        usage.contextTokens = input + cacheRead + cacheWrite
        usage.outputTokens = raw["output_tokens"] as? Int ?? 0
    }

    private func appendToLast(_ piece: String) {
        guard streamOpen else { return }
        streamChunkBuffer += piece
        guard !streamFlushScheduled else { return }
        streamFlushScheduled = true
        Task {
            try? await Task.sleep(for: .milliseconds(80))
            streamFlushScheduled = false
            flushStreamNow()
        }
    }

    private func flushStreamNow() {
        guard !streamChunkBuffer.isEmpty else { return }
        streamingText += streamChunkBuffer
        streamChunkBuffer = ""
    }

    private func replaceLast(_ text: String) {
        guard streamOpen else { return }
        streamChunkBuffer = ""
        streamingText = text
    }

    private func noteToolUse(id: String, name: String, input: [String: Any]?) {
        guard streamOpen else { return }
        // MCP 工具名长得吓人（`mcp__plugin_slidesmith_slidesmith__slidesmith_apply_patch`），
        // 界面上只留最后一段。
        let short = name.components(separatedBy: "__").last ?? name
        guard !streamingTools.contains(where: { $0.id == id }) else { return }
        streamingTools.append(ToolCall(id: id, name: short, target: Self.toolTarget(input)))
        retrying = 0
    }

    /// 工具结果回来了，把对应那条从「正在跑」结掉。
    private func closeToolCall(id: String, failed: Bool, content: Any?) {
        guard let i = streamingTools.firstIndex(where: { $0.id == id }) else { return }
        streamingTools[i].status = failed ? .failed : .ok
        if failed { streamingTools[i].detail = Self.resultGist(content) }
    }

    /// 从工具参数里挑出「它动的是什么」。
    ///
    /// **不能把整包 input 摆出来**——apply_patch 的参数是一整页 HTML，几十 KB，
    /// 糊在对话里既看不懂也把界面撑垮。挑一个有辨识度的字段就够了。
    private static func toolTarget(_ input: [String: Any]?) -> String {
        guard let input else { return "" }
        for key in ["data_id", "dataId", "anchor", "file_path", "path",
                    "command", "pattern", "query", "url", "deck", "prompt"] {
            if let v = input[key] as? String, !v.trimmingCharacters(in: .whitespaces).isEmpty {
                return String(v.trimmingCharacters(in: .whitespaces).prefix(90))
            }
        }
        for key in ["sections", "cues", "notes", "edits", "todos"] {
            if let arr = input[key] as? [Any] { return "\(arr.count) 项" }
            if let dict = input[key] as? [String: Any] { return "\(dict.count) 项" }
        }
        return ""
    }

    /// 失败原因摘要。tool_result 的 content 可能是字符串，也可能是块数组。
    private static func resultGist(_ content: Any?) -> String {
        var text = ""
        if let s = content as? String { text = s }
        else if let blocks = content as? [[String: Any]] {
            text = blocks.compactMap { $0["text"] as? String }.joined(separator: " ")
        }
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\n", with: " ")
        return String(text.prefix(160))
    }

    /// 把流式中的那条提交进 `turns`。**只提交一次**——stop() 和被取消的 stream
    /// 尾巴会各调一次，靠 streamOpen 挡住第二次。
    private func finishStreaming() {
        guard streamOpen else { return }
        streamOpen = false
        interrupting = false
        retrying = 0
        flushStreamNow()
        var text = streamingText
        let tools = streamingTools
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, tools.isEmpty {
            // **失败要自己把线索摆出来**，而不是留一句「没有返回内容」让用户
            // 切去终端 tail 日志——那是把排查成本全转嫁给他。
            text = lastError ?? "这一轮什么都没回来，而且没有捕获到任何错误。"
            if let tail = RepoLocator.logTail(Self.logName, 8) {
                text += "\n\n桥接日志最后几行：\n```\n\(tail)\n```"
            }
            text += "\n\n输入 `/诊断` 把桥接状态和更长的日志一次拉出来。"
        }
        turns.append(Turn(role: .assistant, text: text, tools: tools))
        streamingText = ""
        streamingTools = []
    }
}
