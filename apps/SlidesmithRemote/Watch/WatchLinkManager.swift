import Foundation
import WatchConnectivity

/// 手表侧的配对信息管理：
///  ① 从 iPhone（扫码那端）拿到 room，存本地；
///  ② 之后手表**直接**连中转，不再依赖手机在不在身边（Ultra 有蜂窝/WiFi）。
///
/// 拿 room 有两条路，缺一不可：
///  - 推：手机 updateApplicationContext / transferUserInfo（手表 App 没开时也能缓存下发）
///  - 拉：手表主动 sendMessage 向手机要（推送错过、或表 App 先开着时的兜底）
final class WatchLinkManager: NSObject, ObservableObject {
    @Published private(set) var pairing: RoomLink?
    /// 给界面显示的诊断信息，配不上时用户和我都能一眼看出卡在哪
    @Published private(set) var diagnostic: String = "准备中…"

    /// 走哪条路把指令送出去
    enum Transport { case phone, direct, none }
    @Published private(set) var transport: Transport = .none
    /// 经手机这条路时，放映端在不在线（由手机回报）
    @Published private(set) var phoneDeckPresent = false
    private var statusTimer: Timer?
    private var unreachableTicks = 0

    private weak var relay: RelayClient?
    private var started = false
    private var pullRetries = 0
    private var retryTimer: Timer?

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
            } else {
                setDiag("此设备不支持与 iPhone 通信")
            }
        }
        connectIfPossible()
        if pairing == nil { requestFromPhone(); startAutoRetry() }
    }

    /// 没配上时自动重试几轮（手机 App 可能刚打开、系统状态刚同步好），不用用户一直点
    private func startAutoRetry() {
        guard retryTimer == nil else { return }
        let t = Timer(timeInterval: 4, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            guard self.pairing == nil else { timer.invalidate(); self.retryTimer = nil; return }
            self.pullRetries += 1
            if self.pullRetries > 15 { timer.invalidate(); self.retryTimer = nil; return }
            self.requestFromPhone()
        }
        RunLoop.main.add(t, forMode: .common)
        retryTimer = t
    }

    /// 手表主动向手机要配对信息（拉）。用户点「重试」也走这里。
    func requestFromPhone() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated else {
            setDiag("正在连接 iPhone…"); return
        }
        // 先看有没有已经下发过的上下文
        let ctx = s.receivedApplicationContext
        if !ctx.isEmpty, apply(context: ctx) { return }

        // 只要「可达」就直接问 —— isCompanionAppInstalled 只当提示，不当拦路条件：
        // 这个标志有时滞后/不准，早期版本拿它做 guard 会导致明明能通也不去问，卡在「未配对」。
        // watch → phone 的 sendMessage 还能把后台的 iPhone App 唤醒，是最有效的一条路。
        if s.isReachable {
            setDiag("正在向 iPhone 索取配对…")
            s.sendMessage(["request": "pairing"], replyHandler: { [weak self] reply in
                guard let self = self else { return }
                if !self.apply(context: reply) {
                    self.setDiag("iPhone 上还没扫码：请先在 iPhone 遥控 App 里扫电脑上的二维码")
                }
            }, errorHandler: { [weak self] err in
                self?.setDiag("向 iPhone 索取失败：\(err.localizedDescription)")
            })
            return
        }

        if !s.isCompanionAppInstalled {
            setDiag("还没检测到 iPhone 上的遥控 App —— 请在 iPhone 上把它打开，再点「重试」")
        } else {
            setDiag("iPhone 没在近旁或 App 没打开 —— 打开 iPhone 上的遥控 App，再点「重试」")
        }
    }

    private func connectIfPossible() {
        guard let p = pairing else { return }
        // 手表自己也试着直连（有 Wi-Fi/蜂窝时能用，作为手机不在身边的兜底）；
        // 但**主路是经 iPhone**——没蜂窝的手表靠蓝牙代理跑 WebSocket 很不可靠。
        relay?.connect(room: p.room, relayBase: p.relayBase)
        startStatusPolling()
    }

    // MARK: - 发指令：手机优先，直连兜底

    /// 返回 true 表示已经把指令送出去了（用于决定触觉反馈是"成功"还是"失败"）
    func send(_ action: RemoteAction) -> Bool {
        let s = WCSession.isSupported() ? WCSession.default : nil
        if let s = s, s.activationState == .activated, s.isReachable {
            s.sendMessage(["cmd": action.rawValue], replyHandler: { [weak self] reply in
                self?.absorb(reply: reply)
            }, errorHandler: { [weak self] _ in
                // 手机这条路突然不行 → 立刻用手表自己的连接补发
                guard let self = self else { return }
                _ = self.relay?.send(action)
                DispatchQueue.main.async { self.transport = (self.relay?.isConnected ?? false) ? .direct : .none }
            })
            DispatchQueue.main.async { self.transport = .phone }
            return true
        }
        // 手机不可达 → 直连
        let ok = relay?.send(action) ?? false
        DispatchQueue.main.async { self.transport = ok ? .direct : .none }
        return ok
    }

    private func absorb(reply: [String: Any]) {
        DispatchQueue.main.async {
            self.phoneDeckPresent = (reply["deck"] as? Bool) ?? false
            self.transport = .phone
            self.unreachableTicks = 0
        }
    }

    /// 定时向手机问状态，好在表上显示绿灯/橙灯（手机在旁时这是最准的一路）
    private func startStatusPolling() {
        guard statusTimer == nil else { return }
        let t = Timer(timeInterval: 3, repeats: true) { [weak self] _ in
            guard let self = self, self.pairing != nil else { return }
            guard WCSession.isSupported() else { return }
            let s = WCSession.default
            guard s.activationState == .activated, s.isReachable else {
                // 蓝牙偶尔抖一下很常见，连续两轮（约 6 秒）都不可达才改状态，
                // 否则会时不时闪出「等待 iPhone 或网络」，看着像坏了其实没事。
                DispatchQueue.main.async {
                    self.unreachableTicks += 1
                    if self.unreachableTicks >= 2, self.transport == .phone {
                        self.transport = (self.relay?.isConnected ?? false) ? .direct : .none
                    }
                }
                return
            }
            DispatchQueue.main.async { self.unreachableTicks = 0 }
            s.sendMessage(["ping": true], replyHandler: { [weak self] reply in
                self?.absorb(reply: reply)
            }, errorHandler: { _ in })
        }
        RunLoop.main.add(t, forMode: .common)
        statusTimer = t
    }

    @discardableResult
    fileprivate func apply(context: [String: Any]) -> Bool {
        guard let room = context["room"] as? String, !room.isEmpty else { return false }
        let base = (context["relay"] as? String) ?? RelayClient.defaultRelay
        let link = RoomLink(relayBase: base, room: room)
        DispatchQueue.main.async {
            self.diagnostic = "已配对 #\(link.shortId)"
            guard link != self.pairing else { return }
            self.pairing = link
            PairingStore.save(link)
            self.connectIfPossible()
        }
        return true
    }

    private func setDiag(_ s: String) {
        DispatchQueue.main.async { self.diagnostic = s }
    }
}

extension WatchLinkManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if let error = error {
            setDiag("连接 iPhone 出错：\(error.localizedDescription)"); return
        }
        // 激活后先吃一次缓存的上下文，没有再主动去要
        let ctx = session.receivedApplicationContext
        if !ctx.isEmpty, apply(context: ctx) { return }
        if pairing == nil { requestFromPhone() }
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

    /// 手机变得可达时，如果还没配上就再要一次
    func sessionReachabilityDidChange(_ session: WCSession) {
        if pairing == nil, session.isReachable { requestFromPhone() }
    }

    func sessionCompanionAppInstalledDidChange(_ session: WCSession) {
        if pairing == nil { requestFromPhone() }
    }
}
