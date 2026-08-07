import Foundation
import WatchConnectivity

/// 手机侧：保存配对信息，并把 room 同步给手表。
/// 用 updateApplicationContext —— 它会被系统缓存，手表 App 下次打开也能拿到，
/// 不要求「此刻手表 App 正开着」。再配一发 transferUserInfo 提高送达率。
final class PhoneLinkManager: NSObject, ObservableObject {
    @Published private(set) var pairing: RoomLink?
    @Published private(set) var watchStatusText = "未检测手表"

    override init() {
        super.init()
        pairing = PairingStore.load()
        if WCSession.isSupported() {
            let s = WCSession.default
            s.delegate = self
            s.activate()
        }
    }

    func setPairing(_ link: RoomLink, relay: RelayClient) {
        pairing = link
        PairingStore.save(link)
        relay.connect(room: link.room, relayBase: link.relayBase)
        pushToWatch()
    }

    func clear(relay: RelayClient) {
        pairing = nil
        PairingStore.clear()
        relay.disconnect()
        refreshWatchStatus()
    }

    /// 把 room 推给手表
    func pushToWatch() {
        guard WCSession.isSupported(), let p = pairing else { return }
        let s = WCSession.default
        guard s.activationState == .activated else { return }
        let payload: [String: Any] = ["room": p.room, "relay": p.relayBase]
        try? s.updateApplicationContext(payload)
        s.transferUserInfo(payload)
        refreshWatchStatus()
    }

    private func refreshWatchStatus() {
        guard WCSession.isSupported() else {
            publish { self.watchStatusText = "此设备不支持手表连接" }; return
        }
        let s = WCSession.default
        publish {
            if !s.isPaired { self.watchStatusText = "没有配对的 Apple Watch" }
            else if !s.isWatchAppInstalled { self.watchStatusText = "手表上还没装遥控 App" }
            else if self.pairing != nil { self.watchStatusText = "已同步到手表" }
            else { self.watchStatusText = "手表已就绪，等待配对" }
        }
    }

    private func publish(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }
}

extension PhoneLinkManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        refreshWatchStatus()
        if pairing != nil { pushToWatch() }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
    func sessionWatchStateDidChange(_ session: WCSession) { refreshWatchStatus() }
}
