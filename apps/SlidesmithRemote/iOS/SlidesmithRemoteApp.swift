import SwiftUI

@main
struct SlidesmithRemoteApp: App {
    @StateObject private var relay = RelayClient()
    @StateObject private var link = PhoneLinkManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(relay)
                .environmentObject(link)
                .onAppear {
                    link.relay = relay   // 手表把指令交给手机代发时要用
                    if let p = link.pairing {
                        relay.connect(room: p.room, relayBase: p.relayBase)
                    }
                }
        }
    }
}
