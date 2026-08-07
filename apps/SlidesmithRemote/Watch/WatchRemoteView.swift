import SwiftUI
import WatchKit

/// 表上的遥控主界面。
/// 布局刻意做成「下大区 = 下一页、上小区 = 上一页」：下一页是最高频动作，给它最大靶区，
/// 抬腕不看表也能盲按；且单击立即响应，没有「等判定双击」的延迟。
/// 另外把「下一页」注册为 primaryAction —— 手垂在身侧做「捏合双击」就能翻页，全程不用抬手。
struct WatchRemoteView: View {
    @EnvironmentObject private var relay: RelayClient
    @EnvironmentObject private var link: WatchLinkManager

    var body: some View {
        VStack(spacing: 6) {
            statusBar

            if link.pairing == nil {
                unpairedHint
            } else {
                // 上一页：小区
                zoneButton(.prev, systemImage: "chevron.up", title: "上一页", minHeight: 44, tint: .gray)

                // 下一页：大区 + 捏合双击主操作
                zoneButton(.next, systemImage: "chevron.down", title: "下一页", minHeight: 96, tint: .orange)
                    .handGestureShortcut(.primaryAction)
            }
        }
        .padding(.horizontal, 6)
        .navigationTitle("Slidesmith")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { link.start(relay: relay) }
    }

    // MARK: - 状态条

    /// 放映端是否在线：经手机那条路由手机回报，直连那条路看自己的连接
    private var deckOnline: Bool {
        link.transport == .phone ? link.phoneDeckPresent : relay.deckPresent
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
        }
        .foregroundStyle(deckOnline ? Color.green : Color.orange)
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
