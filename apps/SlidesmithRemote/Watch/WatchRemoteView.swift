import SwiftUI
import WatchKit

/// 表上的遥控主界面。
/// 布局刻意做成「下大区 = 下一页、上小区 = 上一页」：下一页是最高频动作，给它最大靶区，
/// 抬腕不看表也能盲按；且单击立即响应，没有「等判定双击」的延迟。
/// 另外把「下一页」注册为 primaryAction —— 手垂在身侧做「捏合双击」就能翻页，全程不用抬手。
struct WatchRemoteView: View {
    @EnvironmentObject private var relay: RelayClient
    @EnvironmentObject private var link: WatchLinkManager
    @State private var flash: RemoteAction?

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

    private var statusBar: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(dotColor)
                .frame(width: 7, height: 7)
            Text(relay.statusText)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
        }
        .foregroundStyle(relay.deckPresent ? Color.green : Color.orange)
    }

    private var dotColor: Color {
        if relay.deckPresent { return .green }
        return relay.isConnected ? .orange : .gray
    }

    private var unpairedHint: some View {
        VStack(spacing: 8) {
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 26))
                .foregroundStyle(.orange)
            Text("还没配对")
                .font(.system(size: 15, weight: .semibold))
            Text("用 iPhone 上的 Slidesmith 遥控扫一次电脑上的二维码即可")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxHeight: .infinity)
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
                .fill(tint.opacity(flash == action ? 0.55 : 0.22))
        )
        .foregroundStyle(relay.deckPresent ? Color.white : Color.white.opacity(0.45))
        .animation(.easeOut(duration: 0.12), value: flash)
    }

    /// 发指令 + 触觉反馈。发不出去（没连上/放映端不在）给 failure 震动，避免「按了以为翻了」。
    private func fire(_ action: RemoteAction) {
        let ok = relay.send(action)
        WKInterfaceDevice.current().play(ok ? .click : .failure)
        guard ok else { return }
        flash = action
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
            if flash == action { flash = nil }
        }
    }
}
