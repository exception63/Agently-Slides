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
struct AIPanel: View {

    @Environment(ClaudeBridge.self) private var claude
    @Environment(DeckBridge.self) private var deck

    @State private var input = ""
    @FocusState private var inputFocused: Bool

    private var quickPrompts: [(String, String)] {
        [
            ("讲讲这份 deck", "看一眼我现在 Studio 里开着的这份 deck（用 slidesmith_status 确认是哪份），说说它的结构和你觉得最弱的三页。先别改。"),
            ("统一视觉", "检查当前 deck 每一页的排版一致性：字号层级、留白、对齐、强调色用法。找出跑偏的页，逐页说清问题，再用 slidesmith_apply_patch 改回来。"),
            ("压缩文字", "当前 deck 里凡是正文超过三行的页，都改写得更短更有力——留观点去铺垫，别丢信息。改完用 slidesmith_apply_patch 回写。"),
            ("配张图", "看看当前 deck 哪一页最需要一张图（空得慌或者概念抽象），画一张贴合内容的内联 SVG 放进去。风格跟着这套皮肤的设计令牌走。"),
            // 手表提词。**硬约束写在 slidesmith_cues 工具自己的说明里**，这里只讲流程——
            // 规则同时抄一份在这里的话，两处迟早各改各的。
            ("一键加提词", """
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
                .font(.system(size: 12, weight: .medium))

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
        VStack(alignment: .leading, spacing: 10) {
            Text("这就是你终端里的 Claude Code")
                .font(.system(size: 13, weight: .semibold))
            Text("工作目录是 presentsystems 仓库，skill、MCP、CLAUDE.md 全都在。\n它改的就是左边这份 deck，改完你立刻看得见。")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 6) {
                ForEach(quickPrompts, id: \.0) { title, prompt in
                    Button(title) { claude.send(prompt) }
                        .buttonStyle(.link)
                        .font(.system(size: 12))
                }
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func bubble(role: ClaudeBridge.Turn.Role, text: String, tools: [String]) -> some View {
        switch role {
        case .user:
            HStack {
                Spacer(minLength: 40)
                Text(text)
                    .font(.system(size: 12.5))
                    .textSelection(.enabled)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
            }
        case .notice:
            Text(text)
                .font(.system(size: 11.5))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .assistant:
            VStack(alignment: .leading, spacing: 6) {
                if !tools.isEmpty {
                    // **工具调用要看得见。** 它在改你的文件，你有权知道它动了什么。
                    Text(tools.joined(separator: " · "))
                        .font(.system(size: 10.5, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.quinary, in: RoundedRectangle(cornerRadius: 5))
                }
                markdown(text)
                    .font(.system(size: 12.5))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
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
                    ForEach(quickPrompts, id: \.0) { title, prompt in
                        Button(title) { claude.send(prompt) }
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
                    Button("停") { claude.stop() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
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
            .background(.quinary, in: RoundedRectangle(cornerRadius: 9))
        }
        .padding(10)
    }

    private func submit() {
        let text = input
        input = ""
        claude.send(text)
    }
}
