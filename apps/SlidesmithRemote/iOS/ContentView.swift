import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var relay: RelayClient
    @EnvironmentObject private var link: PhoneLinkManager
    @State private var scanning = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                statusCard

                if link.pairing == nil {
                    Spacer()
                    pairPrompt
                    Spacer()
                } else {
                    remotePad
                    Spacer()
                    footer
                }
            }
            .padding(20)
            .navigationTitle("Slidesmith 遥控")
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
    }

    private var statusCard: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(relay.deckPresent ? Color.green : (relay.isConnected ? Color.orange : Color.gray))
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(relay.statusText).font(.subheadline.weight(.semibold))
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
