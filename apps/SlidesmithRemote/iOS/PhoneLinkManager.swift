import Foundation
import WatchConnectivity

/// 手机侧：保存配对信息，并把 room 同步给手表。
/// 三条路都走，任何一条通就行：
///  - updateApplicationContext：系统缓存最新状态，手表 App 下次打开也拿得到
///  - transferUserInfo：排队投递，可靠但可能有延迟
///  - 回应手表的主动索取（replyHandler）：手表那边点「重试」时的即时通道
final class PhoneLinkManager: NSObject, ObservableObject {
    @Published private(set) var pairing: RoomLink?
    @Published private(set) var watchStatusText = "未检测手表"

    /// 手表把指令交给手机代发时要用到 —— 手表（尤其没蜂窝的）自己连长连接不可靠，
    /// 走「手表→蓝牙→iPhone→云中转」这条路才稳。
    weak var relay: RelayClient?

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

    /// 把 room 推给手表。三管齐下，并把失败原因显示出来。
    func pushToWatch() {
        guard WCSession.isSupported() else {
            publish { self.watchStatusText = "此设备不支持手表连接" }; return
        }
        guard let p = pairing else { refreshWatchStatus(); return }
        let s = WCSession.default
        guard s.activationState == .activated else {
            publish { self.watchStatusText = "正在连接手表…" }; return
        }
        let payload: [String: Any] = ["room": p.room, "relay": p.relayBase]

        var problems: [String] = []
        do { try s.updateApplicationContext(payload) }
        catch { problems.append(error.localizedDescription) }
        s.transferUserInfo(payload)
        if s.isReachable {
            s.sendMessage(payload, replyHandler: nil, errorHandler: { _ in })
        }

        publish {
            if !s.isPaired { self.watchStatusText = "没有配对的 Apple Watch" }
            else if !s.isWatchAppInstalled { self.watchStatusText = "手表上还没装遥控 App" }
            else if problems.isEmpty { self.watchStatusText = "已同步到手表 #\(p.shortId)" }
            else { self.watchStatusText = "同步手表失败：\(problems.joined(separator: " / "))" }
        }
    }

    private func refreshWatchStatus() {
        guard WCSession.isSupported() else {
            publish { self.watchStatusText = "此设备不支持手表连接" }; return
        }
        let s = WCSession.default
        publish {
            if s.activationState != .activated { self.watchStatusText = "正在连接手表…" }
            else if !s.isPaired { self.watchStatusText = "没有配对的 Apple Watch" }
            else if !s.isWatchAppInstalled { self.watchStatusText = "手表上还没装遥控 App" }
            else if let p = self.pairing { self.watchStatusText = "已同步到手表 #\(p.shortId)" }
            else { self.watchStatusText = "手表已就绪，等待配对" }
        }
    }

    private func publish(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }

    /// 回给手表的状态包。
    ///
    /// **为什么走「手表来问、手机回答」而不是 updateApplicationContext 推**：
    /// 手表本来就每 3 秒 ping 一次手机（`WatchLinkManager.startStatusPolling`），
    /// 按键时的 reply 也顺路带回来。搭这条现成的车有两个好处：
    ///  ① 不用做节流 —— 频率由手表定，翻页再快也不会把通道打爆；
    ///  ② reply 永远是**当下**的状态，不像 applicationContext 那样会被系统合并/延迟。
    ///
    /// 只带三个字段。**别把 txb64 讲稿也塞进来** —— 手表屏幕根本塞不下，
    /// 白白把 WCSession 的消息体挤爆。
    private func statusPayload(ok: Bool, haveAnchor: String = "") -> [String: Any] {
        var p: [String: Any] = ["ok": ok,
                                "deck": relay?.deckPresent ?? false,
                                "conn": relay?.isConnected ?? false]
        if let st = relay?.deckState {
            p["idx"] = st.slideIdx      // 0 基，与协议一致；手表显示时再 +1
            p["total"] = st.total
            p["next"] = st.nextTitle
            p["title"] = st.title
            p["anchor"] = st.anchor
            // 当页讲稿正文。**只在手表还没有这一页时才捎** —— 手表每 3 秒 ping 一次，
            // 一段讲稿几百到两千字，每次都塞进蓝牙这条管子是纯浪费。
            // 手表在 ping 里报自己手上是哪一页（have），一样就不发。
            if haveAnchor != st.anchor {
                if let note = relay?.note(for: st.anchor), !note.isEmpty { p["note"] = note }
                p["cue"] = relay?.cue(for: st.anchor) ?? []
            }
        }
        return p
    }

    private func pairingPayload() -> [String: Any] {
        guard let p = pairing else { return [:] }
        return ["room": p.room, "relay": p.relayBase]
    }
}

extension PhoneLinkManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        refreshWatchStatus()
        if pairing != nil { pushToWatch() }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
    func sessionWatchStateDidChange(_ session: WCSession) {
        refreshWatchStatus()
        if pairing != nil { pushToWatch() }
    }
    func sessionReachabilityDidChange(_ session: WCSession) {
        if pairing != nil, session.isReachable { pushToWatch() }
    }

    /// 手表来消息：① 代发遥控指令 ② 查状态 ③ 要配对信息
    func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async {
            // ① 代发指令：手表按了键 → 由手机的 WebSocket 发给中转
            if let raw = message["cmd"] as? String, let action = RemoteAction(rawValue: raw) {
                // 手机自己可能还没连上（刚被唤醒）——先确保连接再发
                if let p = self.pairing, self.relay?.isConnected != true {
                    self.relay?.connect(room: p.room, relayBase: p.relayBase)
                }
                let ok = self.relay?.send(action) ?? false
                replyHandler(self.statusPayload(ok: ok, haveAnchor: (message["have"] as? String) ?? ""))
                return
            }
            // ② 查状态（手表定时 ping，用来显示绿灯/橙灯）
            if message["ping"] != nil {
                if let p = self.pairing, self.relay?.isConnected != true {
                    self.relay?.connect(room: p.room, relayBase: p.relayBase)
                }
                replyHandler(self.statusPayload(ok: true, haveAnchor: (message["have"] as? String) ?? ""))
                return
            }
            // ③ 要配对信息
            replyHandler(self.pairingPayload())
        }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {}
}
