import SwiftUI
import WatchKit

/// 表上的遥控主界面。
/// 布局刻意做成「下大区 = 下一页、上小区 = 上一页」：下一页是最高频动作，给它最大靶区，
/// 抬腕不看表也能盲按；且单击立即响应，没有「等判定双击」的延迟。
/// 另外把「下一页」注册为 primaryAction —— 手垂在身侧做「捏合双击」就能翻页，全程不用抬手。
struct WatchRemoteView: View {
    @EnvironmentObject private var relay: RelayClient
    @EnvironmentObject private var link: WatchLinkManager
    @State private var page = 0

    var body: some View {
        Group {
            if link.pairing == nil {
                VStack(spacing: 6) { statusBar; unpairedHint }
                    .padding(.horizontal, 6)
            } else {
                // 左右滑：翻页器 / 讲稿。分成两页而不是挤在一屏，是因为「下一页」的
                // 大靶区不能被压小 —— 那是抬腕不看表也能盲按的前提。
                TabView(selection: $page) {
                    padPage.tag(0)
                    notePage.tag(1)
                }
                .tabViewStyle(.page)
            }
        }
        .navigationTitle("Slidesmith")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { link.start(relay: relay) }
    }

    // MARK: - 第一页：翻页器

    private var padPage: some View {
        VStack(spacing: 6) {
            statusBar
            nextLine
            zoneButton(.prev, systemImage: "chevron.up", title: "上一页", minHeight: 44, tint: .gray)
            zoneButton(.next, systemImage: "chevron.down", title: "下一页", minHeight: 96, tint: .orange)
                .handGestureShortcut(.primaryAction)
        }
        .padding(.horizontal, 6)
    }

    // MARK: - 第二页：讲稿

    /// 当页讲稿。经手机那条路由手机捎来，直连那条路自己从 txb64 里拆。
    private var note: String {
        if link.transport == .phone { return link.phoneNote }
        if let a = deckState?.anchor { return relay.note(for: a) ?? "" }
        return ""
    }

    private var notePage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                if let st = deckState {
                    Text("\(st.pageNo)/\(st.total)" + (st.title.isEmpty ? "" : " · " + st.title))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.orange)
                        .lineLimit(2)
                }
                if note.isEmpty {
                    Text(noteHint)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                } else {
                    // 转表冠滚动。字号给到 15：再小讲台上瞄一眼根本看不清。
                    Text(note)
                        .font(.system(size: 15))
                        .lineSpacing(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 6)
        }
    }

    /// 讲稿为空时说清楚是**哪一环**没到，别只写「暂无讲稿」让人没法排查
    private var noteHint: String {
        if !deckOnline { return "等放映端上线后，讲稿会自动送过来。" }
        if deckState == nil { return "正在向放映端要当前页…" }
        return "这一页没有讲稿。\n（deck 里要写 <aside class=\"notes\">，或用一体版/单文件版讲稿）"
    }

    // MARK: - 状态条

    /// 放映端是否在线：经手机那条路由手机回报，直连那条路看自己的连接
    private var deckOnline: Bool {
        link.transport == .phone ? link.phoneDeckPresent : relay.deckPresent
    }

    /// 页码从哪来：经手机那条路由手机回报，直连那条路直接看自己的连接。
    /// 和 `deckOnline` 用同一个判据，免得出现「灯是绿的、页码是另一条路的」这种错位。
    private var deckState: DeckState? {
        link.transport == .phone ? link.phoneDeckState : relay.deckState
    }

    private var statusBar: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(deckOnline ? Color.green : (link.transport == .none ? Color.gray : Color.orange))
                .frame(width: 7, height: 7)
            Text(statusLine)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            // 页码挤在状态条右端而不是单起一行 —— 表盘高度就那么点，
            // 多一行「3 / 44」会把「下一页」的大靶区压小，那是盲按的命根子。
            if let st = deckState {
                Text("\(st.pageNo)/\(st.total)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
        }
        .foregroundStyle(deckOnline ? Color.green : Color.orange)
    }

    /// 下一张讲什么。讲台上瞄一眼就能接上，比页码还有用。
    /// 没配对 / 放映端没报过页时整行不出现，不占地方。
    private var nextLine: some View {
        Group {
            if let st = deckState, !st.nextTitle.isEmpty {
                Text("› " + st.nextTitle)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// 同时告诉用户「通不通」和「走的哪条路」——排障时一眼看清
    private var statusLine: String {
        switch link.transport {
        case .phone:  return deckOnline ? "已连接 · 经 iPhone" : "等待放映端 · 经 iPhone"
        case .direct: return relay.deckPresent ? "已连接 · 直连" : relay.statusText + " · 直连"
        case .none:   return relay.isConnected ? relay.statusText : "等待 iPhone 或网络…"
        }
    }

    private var unpairedHint: some View {
        ScrollView {
            VStack(spacing: 8) {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 24))
                    .foregroundStyle(.orange)
                Text("还没配对")
                    .font(.system(size: 15, weight: .semibold))
                // 诊断：明确告诉用户卡在哪一步，而不是干瘪的「未配对」
                Text(link.diagnostic)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button {
                    WKInterfaceDevice.current().play(.click)
                    link.requestFromPhone()
                } label: {
                    Label("重试", systemImage: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                }
                .tint(.orange)
                Text("提示：先在 iPhone 上打开遥控 App 并完成扫码，再点重试")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - 翻页区

    private func zoneButton(_ action: RemoteAction, systemImage: String, title: String,
                            minHeight: CGFloat, tint: Color) -> some View {
        Button {
            fire(action)
        } label: {
            VStack(spacing: 2) {
                Image(systemName: systemImage)
                    .font(.system(size: minHeight > 60 ? 30 : 20, weight: .medium))
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
            }
            .frame(maxWidth: .infinity, minHeight: minHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(tint.opacity(0.22))
        )
        .foregroundStyle(deckOnline ? Color.white : Color.white.opacity(0.45))
    }

    /// 只做一件事：把指令发出去。
    /// 刻意**不做**成功动画、不做成功震动 —— 讲课时要的是「按下即翻页」，
    /// 任何多余反馈都是延迟感的来源。只有发不出去时才震一下（failure），
    /// 免得你以为翻了其实没翻。
    private func fire(_ action: RemoteAction) {
        if !link.send(action) {
            WKInterfaceDevice.current().play(.failure)
        }
    }
}
