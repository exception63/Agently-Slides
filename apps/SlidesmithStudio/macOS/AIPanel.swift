import SwiftUI

/// 右栏那个 Claude 对话面板。
///
/// 它和"某个云端 AI 助手"看着像，底下完全不是一回事：**这是你本机的 Claude Code**，
/// 工作目录就是 presentsystems 仓库，所以它能用你的 skill、你的 MCP、你的 CLAUDE.md，
/// 能直接把改动推进左边那个 Studio（`slidesmith_apply_patch`），也能跑
/// `/slidesmith:editorial-slides` 这种命令。
///
/// Enter 发送、Shift+Enter 换行。输入框一获得焦点就 warmup——冷启动那十几秒
/// 藏在你打字的时间里。
/// 面板配色。**刻意和 Studio 网页那套 `--sm-*` 令牌对齐**——app 和网页是同一个
/// 产品的两个壳；强调色不一样的话，同一份 deck 在两边看着像两个软件。
enum SMPalette {
    /// 朱红。深色底上朱红发闷，换琥珀——Studio 那边也是这么做的。
    static func accent(_ s: ColorScheme) -> Color {
        s == .dark ? Color(red: 0.941, green: 0.702, blue: 0.290)
                   : Color(red: 0.710, green: 0.251, blue: 0.165)
    }
    /// 强调淡底（用户气泡、选中态）
    static func accentTint(_ s: ColorScheme) -> Color {
        s == .dark ? Color(red: 0.227, green: 0.141, blue: 0.090)
                   : Color(red: 0.984, green: 0.918, blue: 0.902)
    }
    static func accentLine(_ s: ColorScheme) -> Color {
        s == .dark ? Color(red: 0.478, green: 0.290, blue: 0.173)
                   : Color(red: 0.906, green: 0.710, blue: 0.667)
    }
    /// 输入区那块底
    static func field(_ s: ColorScheme) -> Color {
        s == .dark ? Color(white: 0.14) : Color(white: 0.97)
    }
    static func hairline(_ s: ColorScheme) -> Color {
        s == .dark ? Color(white: 0.28) : Color(white: 0.87)
    }
}

struct AIPanel: View {

    @Environment(ClaudeBridge.self) private var claude
    @Environment(DeckBridge.self) private var deck

    @State private var input = ""
    @FocusState private var inputFocused: Bool
    @State private var showHistory = false
    @Environment(\.colorScheme) private var scheme
    /// 发问时要不要把「你正看着哪一页」一起带上。默认带——不带的话
    /// 用户就得每次自己打「第 12 页」，这正是要解决的事。
    @AppStorage("sm.ai.attachSelection") private var attachSelection = true

    struct QuickPrompt: Identifiable {
        var id: String { title }
        var title: String
        var icon: String
        /// 一句话说清它会干什么。**光有标题不够**——「统一视觉」到底会动哪些东西，
        /// 不点一次是不知道的，而这正是让人不敢点的原因。
        var blurb: String
        var prompt: String
    }

    private var quickPrompts: [QuickPrompt] {
        let raw: [(String, String, String, String)] = [
            ("讲讲这份 deck", "text.magnifyingglass", "读一遍，说结构和最弱的三页，不动手", "看一眼我现在 Studio 里开着的这份 deck（用 slidesmith_status 确认是哪份），说说它的结构和你觉得最弱的三页。先别改。"),
            ("统一视觉", "wand.and.rays", "找出排版跑偏的页，逐页说清再改回来",
             "检查当前 deck 每一页的排版一致性：字号层级、留白、对齐、强调色用法。找出跑偏的页，逐页说清问题，再用 slidesmith_apply_patch 改回来。"),
            ("压缩文字", "text.append", "正文超过三行的页改写得更短更有力",
             "当前 deck 里凡是正文超过三行的页，都改写得更短更有力——留观点去铺垫，别丢信息。改完用 slidesmith_apply_patch 回写。"),
            ("配张图", "photo.on.rectangle.angled", "挑最空的一页，画一张贴合内容的矢量图",
             "看看当前 deck 哪一页最需要一张图（空得慌或者概念抽象），画一张贴合内容的内联 SVG 放进去。风格跟着这套皮肤的设计令牌走。"),
            // 手表提词。**硬约束写在 slidesmith_cues 工具自己的说明里**，这里只讲流程——
            // 规则同时抄一份在这里的话，两处迟早各改各的。
            ("一键加提词", "applewatch", "给每一页拟手表上的提词，只填空页",
             """
                给当前 deck 生成 Apple Watch 上的每页提词。

                1. 先 slidesmith_cues 读一遍现状，看清哪些页已经有提词——**那些别动**。
                   如果它说没开 watch mode：读 plugin/slidesmith/skills/slides-presenter-mode/templates/watch-cues.js.template，
                   把 {{CHANNEL}} 全换成它报的 channel，再调一次 slidesmith_cues 把整段放进 enableWatchMode，开好再往下走。
                2. slidesmith_outline 拿目录，再分批用 withHtml 取正文（一次 12–15 页，别一次拉整份，会把上下文撑爆）。
                3. 逐页拟提词，键用返回的 anchor，别自己造。
                4. 每批用 slidesmith_cues 的 set 写回。默认只填空页，**不要传 replace**——用户可能已经手调过。
                5. 全部写完再读一次，确认 missing 和 violations 都空了。

                硬约束在 slidesmith_cues 的工具说明里，一条都不能破。最后告诉我写了多少页、哪几页你拿不准，我在「提词」面板里逐页过。
                """),
        ]
        return raw.map { QuickPrompt(title: $0.0, icon: $0.1, blurb: $0.2, prompt: $0.3) }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            transcript
            Divider()
            composer
        }
        .background(.background)
        // **桥的启动归 app 管，这里只问状态。** 面板也去 start() 的话，两处并发
        // 各起一条，第二条会顺延端口变成孤儿（见 ClaudeBridge.startTask）。
        .task { await claude.refreshStatus() }
    }

    // MARK: - 顶部

    private var header: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(claude.connected ? .green : .orange)
                .frame(width: 7, height: 7)
            Text(claude.connected ? "Claude" : "未连接")
                .font(.system(size: 12.5, weight: .semibold))

            if claude.liveSessions > 0 {
                // **常驻要看得见。** 桥是 app 悄悄拉起来的，它的 stdout 没人看；
                // 界面上一个字都不说的话，"现在有没有东西在后台占着内存"这件事
                // 只能靠猜。
                Text("常驻 \(claude.liveSessions)")
                    .font(.system(size: 10.5))
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(.quinary, in: Capsule())
                    .help("\(claude.liveSessions) 个常驻会话活着（档位：\(claude.resident.label)）。"
                          + "每个连它那套 MCP 副本约 2 GB，退出 app 全部释放。")
            }

            if claude.usage.contextTokens > 0 {
                Text("上下文 \(claude.usage.contextTokens / 1000)k")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .help(String(format: "输出 %d token · 本次会话累计 $%.3f",
                                 claude.usage.outputTokens, claude.usage.costUSD))
            }

            Spacer()

            // 历史会话。**「新对话」以前是单向门**——开了新的，上一段就再也回不去了，
            // 而它其实一直躺在磁盘上。
            Button {
                showHistory = true
                Task { await claude.loadHistory() }
            } label: {
                Image(systemName: "clock.arrow.circlepath").font(.system(size: 12))
            }
            .buttonStyle(.plain)
            .help("翻回之前的会话（接着那段上下文说，不是只把文字贴出来）")

            // 模型和放权档都收进这一个菜单。**别在这一行摆下拉框**——面板可以被
            // 拖到 320pt 窄，一个 92pt 的 Picker 在那里只会显示成「Son」。
            Menu {
                Section("模型") {
                    Picker("模型", selection: Binding(get: { claude.model },
                                                     set: { claude.model = $0 })) {
                        ForEach(claude.models) { model in
                            Text(model.label).tag(model.id)
                        }
                    }
                    .pickerStyle(.inline)
                }
                Section("推理力度（换档＝换进程，下一轮生效）") {
                    Picker("力度", selection: Binding(get: { claude.effort },
                                                     set: { claude.effort = $0 })) {
                        // 「默认」＝不传 `--effort`，用 CLI 自己的默认值。
                        // 这一项必须有：没有它，用户一旦选过就再也回不到"不指定"。
                        Text("默认（跟 CLI）").tag(ClaudeBridge.Effort?.none)
                        ForEach(ClaudeBridge.Effort.allCases) { level in
                            Text(level.label).tag(ClaudeBridge.Effort?.some(level))
                        }
                    }
                    .pickerStyle(.inline)
                }
                Section("常驻档位（桥的策略，立刻生效）") {
                    Picker("常驻", selection: Binding(get: { claude.resident },
                                                     set: { mode in Task { await claude.setResident(mode) } })) {
                        ForEach(ClaudeBridge.Resident.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.inline)
                }
                Section("放权档位（换档＝换进程，下一轮生效）") {
                    Picker("放权", selection: Binding(get: { claude.autonomy },
                                                     set: { claude.autonomy = $0 })) {
                        ForEach(ClaudeBridge.Autonomy.allCases) { level in
                            Text(level.label).tag(level)
                        }
                    }
                    .pickerStyle(.inline)
                }
                Divider()
                Button("新对话") { claude.newConversation() }
                Button("重启桥接") { Task { await claude.restart() } }
                Button("诊断") { claude.send("/诊断") }
            } label: {
                Text(claude.model).font(.system(size: 11))
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .help("模型 · 推理力度 · 常驻档位 · 放权档位")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .popover(isPresented: $showHistory, arrowEdge: .bottom) { historyList }
    }

    // MARK: - 历史会话

    private var historyList: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("历史会话").font(.system(size: 12, weight: .semibold))
                Spacer()
                if claude.loadingHistory { ProgressView().controlSize(.small) }
            }
            .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 6)

            Divider()

            if claude.history.isEmpty && !claude.loadingHistory {
                Text("这个项目下还没有别的会话。")
                    .font(.system(size: 11.5)).foregroundStyle(.secondary)
                    .padding(12)
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(claude.history) { item in
                        Button {
                            showHistory = false
                            Task { await claude.resume(item) }
                        } label: {
                            HStack(alignment: .top, spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title)
                                        .font(.system(size: 12))
                                        .lineLimit(2)
                                        .multilineTextAlignment(.leading)
                                    Text(item.updated.formatted(.relative(presentation: .named)))
                                        .font(.system(size: 10.5))
                                        .foregroundStyle(.tertiary)
                                }
                                Spacer(minLength: 0)
                                if item.live {
                                    Text("常驻")
                                        .font(.system(size: 9.5))
                                        .padding(.horizontal, 5).padding(.vertical, 1)
                                        .background(.quinary, in: Capsule())
                                }
                            }
                            .contentShape(Rectangle())
                            .padding(.horizontal, 12).padding(.vertical, 7)
                        }
                        .buttonStyle(.plain)
                        Divider().opacity(0.4)
                    }
                }
            }
            .frame(maxHeight: 320)
        }
        .frame(width: 330)
    }

    // MARK: - 对话

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if claude.turns.isEmpty && !claude.running {
                        empty
                    }
                    ForEach(claude.turns) { turn in
                        bubble(role: turn.role, text: turn.text, tools: turn.tools)
                            .id(turn.id)
                    }
                    if claude.running {
                        bubble(role: .assistant,
                               text: claude.streamingText.isEmpty ? "思考中…" : claude.streamingText,
                               tools: claude.streamingTools)
                            .id("streaming")
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(14)
            }
            .onChange(of: claude.turns.count) { withAnimation { proxy.scrollTo("bottom") } }
            .onChange(of: claude.streamingText) { proxy.scrollTo("bottom") }
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text("这就是你终端里的 Claude Code")
                    .font(.system(size: 14, weight: .semibold))
                Text("工作目录是 presentsystems 仓库，skill、MCP、CLAUDE.md 全都在。它改的就是左边这份 deck，改完你立刻看得见。")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .lineSpacing(2)
            }

            // 预设做成卡片，每条带一句「它会干什么」。
            // 原来是五条裸蓝链接，看着像调试页，而且不点一次不知道会发生什么。
            VStack(spacing: 6) {
                ForEach(quickPrompts) { q in
                    Button { claude.send(withContext(q.prompt), display: q.title) } label: {
                        HStack(alignment: .top, spacing: 9) {
                            Image(systemName: q.icon)
                                .font(.system(size: 13))
                                .foregroundStyle(SMPalette.accent(scheme))
                                .frame(width: 18, height: 18)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(q.title).font(.system(size: 12.5, weight: .medium))
                                Text(q.blurb)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SMPalette.field(scheme), in: RoundedRectangle(cornerRadius: 9))
                        .overlay(RoundedRectangle(cornerRadius: 9)
                            .strokeBorder(SMPalette.hairline(scheme), lineWidth: 0.5))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func bubble(role: ClaudeBridge.Turn.Role, text: String, tools: [ClaudeBridge.ToolCall]) -> some View {
        switch role {
        case .user:
            HStack {
                Spacer(minLength: 44)
                Text(text)
                    .font(.system(size: 12.5))
                    .lineSpacing(2)
                    .textSelection(.enabled)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 8)
                    .background(SMPalette.accentTint(scheme),
                                in: RoundedRectangle(cornerRadius: 11))
                    .overlay(RoundedRectangle(cornerRadius: 11)
                        .strokeBorder(SMPalette.accentLine(scheme), lineWidth: 0.5))
            }
        case .notice:
            // 面板自己说的话。**要一眼看出「这不是 Claude 说的」**——
            // 以前和正文一样是左对齐灰字，混在一起分不清谁在说话。
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "info.circle")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
                    .padding(.top, 1)
                Text(text)
                    .font(.system(size: 11.5))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 9).padding(.vertical, 6)
            .background(SMPalette.field(scheme), in: RoundedRectangle(cornerRadius: 7))
        case .assistant:
            VStack(alignment: .leading, spacing: 6) {
                if !tools.isEmpty {
                    // **工具调用要看得见。** 它在改你的文件，你有权知道它动了什么、
                    // 动的是哪一页、成没成——只报一个工具名等于什么都没说。
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(tools) { call in toolRow(call) }
                    }
                }
                markdown(text)
                    .font(.system(size: 12.5))
                    .lineSpacing(2.5)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private func toolRow(_ call: ClaudeBridge.ToolCall) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            switch call.status {
            case .running:
                ProgressView().controlSize(.mini).scaleEffect(0.6).frame(width: 11, height: 11)
            case .ok:
                Image(systemName: "checkmark").font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.green).frame(width: 11)
            case .failed:
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.red).frame(width: 11)
            }
            Text(call.name)
                .font(.system(size: 10.5, weight: .medium, design: .monospaced))
                .foregroundStyle(call.status == .failed ? .red : .secondary)
            if !call.target.isEmpty {
                Text(call.target)
                    .font(.system(size: 10.5, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .lineLimit(1).truncationMode(.middle)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(.quinary, in: RoundedRectangle(cornerRadius: 5))
        .help(call.detail.isEmpty ? call.name : call.detail)
    }

    /// 够用的 markdown：粗体、代码、列表符号。**不追求完整**——追求完整就要
    /// 引一个渲染库，而这个面板 95% 的内容是几句人话加一个文件名。
    private func markdown(_ text: String) -> Text {
        if let attributed = try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return Text(attributed)
        }
        return Text(text)
    }

    // MARK: - 输入

    private var composer: some View {
        VStack(spacing: 6) {
            // 正在跑的时候，把「它到哪一步了」摆出来。以前发出去就只剩一个转圈，
            // 卡住和在重试长得一模一样。
            if claude.running {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.mini).scaleEffect(0.7)
                    if claude.interrupting {
                        Text("正在收尾…").font(.system(size: 11)).foregroundStyle(.secondary)
                    } else if claude.retrying > 0 {
                        Text("接口在重试（第 \(claude.retrying) 次）")
                            .font(.system(size: 11)).foregroundStyle(.orange)
                    } else if let last = claude.streamingTools.last(where: { $0.status == .running }) {
                        Text("正在 \(last.name)\(last.target.isEmpty ? "" : " · " + last.target)")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                            .lineLimit(1).truncationMode(.middle)
                    } else {
                        Text("正在思考…").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            }

            // 上下文药丸：你在 Studio 里选的那一页。带不带一起发，点一下就切。
            if let sel = deck.selection {
                Button {
                    attachSelection.toggle()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: attachSelection ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 10))
                        // **药丸得自己说清自己是干什么的。** 只写「第 1 页 · 标题」的话，
                        // 谁也看不出它是「发问时会把这一页带上」，只会以为是个状态显示。
                        Text("带上").font(.system(size: 10.5, weight: .medium)).opacity(0.75)
                        Text(sel.label).font(.system(size: 11)).lineLimit(1)
                    }
                    .foregroundStyle(attachSelection ? SMPalette.accent(scheme) : Color.secondary)
                    .padding(.horizontal, 9).padding(.vertical, 3.5)
                    .background(attachSelection ? SMPalette.accentTint(scheme)
                                                : SMPalette.field(scheme), in: Capsule())
                    .overlay(Capsule().strokeBorder(
                        attachSelection ? SMPalette.accentLine(scheme) : SMPalette.hairline(scheme),
                        lineWidth: 0.5))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
                .help(attachSelection
                      ? "发问时会带上「你正看着第 \(sel.index) 页」，说「这一页」它就懂"
                      : "点一下打开：带上当前页，省得每次打字说第几页")
            }

            if let note = claude.note {
                Text(note)
                    .font(.system(size: 11))
                    .foregroundStyle(.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(alignment: .bottom, spacing: 8) {
                // 预设也得**聊起来之后还够得着**：那几条链接只长在空状态里，
                // 发过一句话就再也点不到了，而「一键加提词」恰恰是聊到一半才想起来的活。
                Menu {
                    ForEach(quickPrompts) { q in
                        Button(q.title) { claude.send(withContext(q.prompt), display: q.title) }
                    }
                } label: {
                    Image(systemName: "wand.and.stars").font(.system(size: 14))
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .frame(width: 20)
                .help("预设：常用的几件活，点一下直接发给 Claude")

                TextField("跟它说要改什么…", text: $input, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12.5))
                    .lineLimit(1...8)
                    .focused($inputFocused)
                    .onSubmit(submit)
                    .onChange(of: inputFocused) { _, focused in
                        // 冷启动藏在打字时间里。见 ClaudeBridge.warmup。
                        if focused { Task { await claude.warmup() } }
                    }

                if claude.running {
                    // **默认是「停这一轮」，不是「掐掉会话」。** 走 stdin 的中断协议，
                    // 进程和上下文都留着，下一句接着聊；`stop()` 那种连进程一起丢的
                    // 重手收进菜单，别让人误按。
                    Button(claude.interrupting ? "停止中…" : "停这轮") { claude.interrupt() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(claude.interrupting)
                        .contextMenu {
                            Button("结束整个会话进程", role: .destructive) { claude.stop() }
                        }
                        .help("叫停这一轮。会话、上下文都留着，接着说就行。\n右键可以彻底结束会话进程。")
                } else {
                    Button {
                        submit()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill").font(.system(size: 18))
                    }
                    .buttonStyle(.plain)
                    .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(8)
            .background(SMPalette.field(scheme), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(
                inputFocused ? SMPalette.accent(scheme).opacity(0.55) : SMPalette.hairline(scheme),
                lineWidth: inputFocused ? 1.5 : 0.5))
            .animation(.easeOut(duration: 0.12), value: inputFocused)
        }
        .padding(10)
    }

    private func submit() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        input = ""
        claude.send(withContext(text), display: text)
    }

    /// 把「你正看着哪一页」贴在问题前面。
    ///
    /// 贴的是**页码 + data-id + 标题**：页码和标题给模型对齐人话（「这一页」），
    /// data-id 是它调 slidesmith_apply_patch 时真正要用的键。
    /// 气泡里显示的仍是用户原话——这行前言是给模型的，不是给人看的。
    private func withContext(_ text: String) -> String {
        guard attachSelection, let sel = deck.selection else { return text }
        return "〔用户此刻在 Studio 里选中的是：第 \(sel.index)/\(sel.total) 页 · "
            + "\(sel.title) · data-id=\(sel.id)。他说「这一页」多半指它。〕\n\n" + text
    }
}
