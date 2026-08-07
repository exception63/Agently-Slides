import SwiftUI

@main
struct SlidesmithRemoteWatchApp: App {
    @StateObject private var relay = RelayClient()
    @StateObject private var link = WatchLinkManager()

    var body: some Scene {
        WindowGroup {
            WatchRemoteView()
                .environmentObject(relay)
                .environmentObject(link)
        }
    }
}
