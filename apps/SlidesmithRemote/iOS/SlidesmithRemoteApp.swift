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
                    if let p = link.pairing {
                        relay.connect(room: p.room, relayBase: p.relayBase)
                    }
                }
        }
    }
}
