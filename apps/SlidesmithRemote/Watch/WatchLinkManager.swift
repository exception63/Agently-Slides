import Foundation
import WatchConnectivity

/// 手表侧的配对信息管理：
///  ① 从 iPhone（扫码那端）接收 room，存本地；
///  ② 之后手表**直接**连中转，不再依赖手机在不在身边（Ultra 有蜂窝/WiFi）。
final class WatchLinkManager: NSObject, ObservableObject {
    @Published private(set) var pairing: RoomLink?

    private weak var relay: RelayClient?
    private var started = false

    override init() {
        super.init()
        pairing = PairingStore.load()
    }

    func start(relay: RelayClient) {
        self.relay = relay
        if !started {
            started = true
            if WCSession.isSupported() {
                let s = WCSession.default
                s.delegate = self
                s.activate()
            }
        }
        connectIfPossible()
    }

    private func connectIfPossible() {
        guard let p = pairing else { return }
        relay?.connect(room: p.room, relayBase: p.relayBase)
    }

    fileprivate func apply(context: [String: Any]) {
        guard let room = context["room"] as? String, !room.isEmpty else { return }
        let base = (context["relay"] as? String) ?? RelayClient.defaultRelay
        let link = RoomLink(relayBase: base, room: room)
        DispatchQueue.main.async {
            guard link != self.pairing else { return }
            self.pairing = link
            PairingStore.save(link)
            self.connectIfPossible()
        }
    }
}

extension WatchLinkManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        // 激活后立刻取一次已同步过来的上下文（手机可能在表 App 没开时就发过了）
        let ctx = session.receivedApplicationContext
        if !ctx.isEmpty { apply(context: ctx) }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(context: applicationContext)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        apply(context: userInfo)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        apply(context: message)
    }
}
