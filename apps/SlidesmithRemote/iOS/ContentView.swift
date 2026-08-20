import SwiftUI

/// 遥控 / 讲稿 两个模式，和网页端 `/r/<room>` 的分段控件一一对应。
enum RemoteTab: String, CaseIterable, Identifiable {
    case remote = "遥控"
    case transcript = "讲稿"
    var id: String { rawValue }
}

struct ContentView: View {
    @EnvironmentObject private var relay: RelayClient
    @EnvironmentObject private var link: PhoneLinkManager
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var web = TranscriptWeb()
    @State private var scanning = false
    @State private var tab: RemoteTab = .remote
    /// 讲稿页折叠：连分段控件一起收走，整屏留给讲稿
    @State private var collapsed = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                // 讲稿页把顶部状态卡让出来：网页端自己就带一条状态栏，
                // 再叠一张原生的既重复又白占掉小半屏讲稿。
                if !(tab == .transcript && link.pairing != nil) { statusCard }

                if link.pairing == nil {
                    Spacer()
                    pairPrompt
                    Spacer()
                } else {
                    if !(tab == .transcript && collapsed) {
                        Picker("", selection: $tab) {
                            ForEach(RemoteTab.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, tab == .transcript ? 20 : 0)
                    }

                    switch tab {
                    case .remote:
                        deckStateBar
                        remotePad
                        Spacer()
                        footer
                    case .transcript:
                        transcriptPane
                    }
                }
            }
            .padding(.horizontal, tab == .transcript && link.pairing != nil ? 0 : 20)
            .padding(.vertical, 20)
            .navigationTitle("Slidesmith 遥控")
            // 讲稿页把导航栏整条藏掉。那条大标题在遥控页是招牌，在讲稿页纯粹是浪费——
            // 它一个人就吃掉约四分之一屏，而讲稿恰恰是越多越好。
            .toolbar(isTranscript ? .hidden : .visible, for: .navigationBar)
            .sheet(isPresented: $scanning) {
                QRScannerView(
                    onFound: { found in
                        link.setPairing(found, relay: relay)
                        scanning = false
                    },
                    onCancel: { scanning = false }
                )
                .ignoresSafeArea()
                .overlay(alignment: .bottom) {
                    Text("对准电脑上「手机遥控」弹出的二维码")
                        .font(.footnote)
                        .padding(10)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 40)
                }
            }
        }
        // 屏幕常亮：讲到一半手机自动锁屏是真实事故。只在「配上了 + App 在前台」时
        // 关掉休眠，退到后台立刻恢复系统默认，免得把用户的电池白白烧穿。
        .onChange(of: scenePhase) { _, _ in updateIdleTimer() }
        .onChange(of: link.pairing) { _, _ in updateIdleTimer() }
        .onAppear { updateIdleTimer() }
    }

    /// 现在是不是在「讲稿」页（且已配对）
    private var isTranscript: Bool { tab == .transcript && link.pairing != nil }

    private func updateIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = (scenePhase == .active && link.pairing != nil)
    }

    // MARK: - 顶部状态

    private var statusCard: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(relay.deckPresent ? Color.green : (relay.isConnected ? Color.orange : Color.gray))
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(relay.evictedNotice ?? relay.statusText).font(.subheadline.weight(.semibold))
                Text(link.watchStatusText).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if let p = link.pairing {
                Text("#\(p.shortId)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    /// 现在讲到第几页 · 下一张是什么。以前手机是个「瞎按的遥控器」，这一条是补的第一块。
    private var deckStateBar: some View {
        Group {
            if let st = relay.deckState {
                VStack(spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(st.pageNo)")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundStyle(.orange)
                        Text("/ \(st.total)")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        if st.remaining > 0 {
                            Text("还剩 \(st.remaining) 张")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if !st.title.isEmpty {
                        Text(st.title)
                            .font(.subheadline.weight(.medium))
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if !st.nextTitle.isEmpty {
                        Text("下一张：\(st.nextTitle)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(14)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    private var pairPrompt: some View {
        VStack(spacing: 14) {
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 54))
                .foregroundStyle(.orange)
            Text("扫码配对").font(.title3.weight(.semibold))
            Text("在电脑上打开导出的 slides，点左下角「📱 手机遥控」→ 选连接方式 → 用这里扫二维码。\n因为二维码是固定的，一份 slides 只需扫这一次。")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button { scanning = true } label: {
                Label("开始扫码", systemImage: "camera.viewfinder")
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
        }
    }

    // MARK: - 讲稿

    private var transcriptPane: some View {
        TranscriptWebView(web: web)
            .ignoresSafeArea(edges: .bottom)
            // 折叠开关浮在讲稿右上角。收起后分段控件也一起没了，所以这个按钮是
            // 回到「遥控」页的唯一入口 —— 半透明但不能真的看不见。
            .overlay(alignment: .topTrailing) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { collapsed.toggle() }
                } label: {
                    Image(systemName: collapsed ? "chevron.down" : "chevron.up")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Color.black.opacity(0.55), in: Circle())
                        .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                }
                .padding(.trailing, 10)
                .padding(.top, 8)
            }
            .onAppear {
                if let p = link.pairing, let u = URL(string: p.phoneURL) { web.load(u) }
            }
            .onChange(of: link.pairing) { _, p in
                if let p = p, let u = URL(string: p.phoneURL) { web.load(u) }
            }
    }

    // MARK: - 遥控

    private var remotePad: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                padButton(.prev, "chevron.left", height: 120)
                padButton(.next, "chevron.right", height: 120, prominent: true)
            }
            HStack(spacing: 12) {
                padButton(.first, "backward.end", height: 56)
                padButton(.last, "forward.end", height: 56)
                padButton(.black, "square.fill", height: 56)
            }
        }
    }

    private func padButton(_ action: RemoteAction, _ icon: String,
                           height: CGFloat, prominent: Bool = false) -> some View {
        Button {
            if relay.send(action) {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } else {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: prominent ? 30 : 20, weight: .medium))
                Text(action.label).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, minHeight: height)
        }
        .buttonStyle(.bordered)
        .tint(prominent ? .orange : .gray)
        .disabled(!relay.deckPresent)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if !relay.deckPresent {
                Text("放映端还没上线：在电脑上打开这份 slides 并点「手机遥控」")
                    .font(.caption).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            HStack {
                Button("重新配对") { scanning = true }
                Spacer()
                Button("同步到手表") { link.pushToWatch() }
                Spacer()
                Button("清除", role: .destructive) { link.clear(relay: relay) }
            }
            .font(.footnote)
        }
    }
}
