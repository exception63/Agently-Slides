import Foundation

/// 扫到的配对信息。deck 的二维码编的是：https://<中转>/r/<room>
/// 因为 Studio 导出时把 room 固定烘进了 HTML，所以一份 deck 只需扫这一次，永久有效。
struct RoomLink: Equatable {
    let relayBase: String   // 例：https://slidesmith-remote.zly-scu.workers.dev
    let room: String

    /// 从扫码结果解析。既接受完整 URL，也接受直接给的 room 字符串。
    init?(scanned raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        if let url = URL(string: text), let scheme = url.scheme, scheme.hasPrefix("http"),
           let host = url.host {
            // 路径形如 /r/<room>
            let parts = url.path.split(separator: "/").map(String.init)
            guard parts.count >= 2, parts[parts.count - 2] == "r" else { return nil }
            let room = parts[parts.count - 1]
            guard Self.isValidRoom(room) else { return nil }
            var base = "\(scheme)://\(host)"
            if let port = url.port { base += ":\(port)" }
            self.relayBase = base
            self.room = room
            return
        }

        // 退路：直接扫到 / 输入了一个 room
        guard Self.isValidRoom(text) else { return nil }
        self.relayBase = RelayClient.defaultRelay
        self.room = text
    }

    init(relayBase: String, room: String) {
        self.relayBase = relayBase
        self.room = room
    }

    static func isValidRoom(_ s: String) -> Bool {
        guard s.count >= 4, s.count <= 64 else { return false }
        return s.allSatisfy { $0.isHexDigit || $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
    }

    var phoneURL: String { "\(relayBase)/r/\(room)" }
    /// 给人看的短标识（room 太长，界面上只显示前 6 位）
    var shortId: String { String(room.prefix(6)) }
}

/// 本地持久化配对信息。手表和手机各存一份，配对后各自都能独立连中转。
enum PairingStore {
    private static let roomKey = "sm.room"
    private static let relayKey = "sm.relay"

    static func save(_ link: RoomLink) {
        let d = UserDefaults.standard
        d.set(link.room, forKey: roomKey)
        d.set(link.relayBase, forKey: relayKey)
    }

    static func load() -> RoomLink? {
        let d = UserDefaults.standard
        guard let room = d.string(forKey: roomKey), !room.isEmpty else { return nil }
        let relay = d.string(forKey: relayKey) ?? RelayClient.defaultRelay
        return RoomLink(relayBase: relay, room: room)
    }

    static func clear() {
        let d = UserDefaults.standard
        d.removeObject(forKey: roomKey)
        d.removeObject(forKey: relayKey)
    }
}
