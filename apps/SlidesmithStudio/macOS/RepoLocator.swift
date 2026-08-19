import Foundation
import Observation

/// presentsystems 仓库在哪。
///
/// **这个 app 和仓库是绑在一起的，不是可以单独拷走的成品。** 它要跑仓库里的
/// `packages/cli`（node 那条 deck 桥）和 `apps/SlidesmithStudio/bridge/claude-bridge.py`
/// （Claude 那条桥），而那个 claude 的工作目录也必须是仓库根——不然 CLAUDE.md、
/// AGENTS.md、`_memory/` 全都不生效，它就变成一个"什么都不知道的 Claude"。
///
/// 找法三级：**用户选过的 > 编译时烘进去的 > 老地方**。第一条让换机器/移仓库时
/// 有救；第二条让开发机上开箱即用；第三条是最后的兜底。
/// 每一级都要**验证过**才算数——见 `looksLikeRepo`。
@MainActor
@Observable
final class RepoLocator {

    static let shared = RepoLocator()

    private static let defaultsKey = "SMRepoRoot"

    private(set) var root: URL?
    /// 没找到时给用户看的话。**要说清楚缺了什么**，而不是一句"配置错误"。
    private(set) var problem: String?

    private init() { root = Self.locate(&problemStorage); problem = problemStorage }

    private var problemStorage: String?

    /// 用户在设置里另选一个目录。选完立刻验证，不合格不写进去——
    /// 存一个坏路径的后果是下次启动直接坏掉，而用户已经忘了自己选过。
    @discardableResult
    func choose(_ url: URL) -> Bool {
        guard Self.looksLikeRepo(url) else {
            problem = "「\(url.lastPathComponent)」里没有 packages/cli/src/index.ts，不像是 presentsystems 仓库。"
            return false
        }
        UserDefaults.standard.set(url.path, forKey: Self.defaultsKey)
        root = url
        problem = nil
        return true
    }

    // MARK: - 定位

    private static func locate(_ problem: inout String?) -> URL? {
        var tried: [String] = []

        for candidate in candidates() {
            if looksLikeRepo(candidate) { return candidate }
            tried.append(candidate.path)
        }
        problem = "找不到 presentsystems 仓库。试过：\n" + tried.map { "· \($0)" }.joined(separator: "\n")
            + "\n用「文件 → 选择仓库位置…」指给它。"
        return nil
    }

    private static func candidates() -> [URL] {
        var out: [URL] = []
        if let saved = UserDefaults.standard.string(forKey: defaultsKey) {
            out.append(URL(fileURLWithPath: (saved as NSString).expandingTildeInPath))
        }
        // 编译时烘进 Info.plist 的那条（project.yml 的 SM_REPO_ROOT = $(SRCROOT)/../..）。
        // 它带着 `/../..` 没化简过，standardized 一下再用，否则打印出来没法看。
        if let baked = Bundle.main.object(forInfoDictionaryKey: "SMRepoRoot") as? String,
           !baked.isEmpty, baked != "$(SM_REPO_ROOT)" {
            out.append(URL(fileURLWithPath: baked).standardizedFileURL)
        }
        out.append(FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("同步空间/Claude Projects/SlidesHTML/presentsystems"))
        return out
    }

    /// 判据是**这个 app 真正要用到的那几个文件在不在**，不是目录名对不对。
    /// 名字对、内容缺，比整个目录不存在更难查。
    private static func looksLikeRepo(_ url: URL) -> Bool {
        let must = [
            "packages/cli/src/index.ts",
            "studio/slidesmith-studio.html",
            "apps/SlidesmithStudio/bridge/claude-bridge.py",
        ]
        return must.allSatisfy {
            FileManager.default.isReadableFile(atPath: url.appendingPathComponent($0).path)
        }
    }

    // MARK: - 子进程环境

    /// 从 Finder 启动的 app 只有一个很短的 PATH，而我们要找 `node`、`python3`、
    /// `claude`，claude 自己还要调 `git` / `rg`。**这一条不补，双击 app 就是起不来、
    /// 从 Xcode 跑就正常**——最典型的"只有你机器上不行"。
    ///
    /// 顺手把调试器塞进来的那些抹掉：从 Xcode 运行时环境里带着
    /// `DYLD_INSERT_LIBRARIES`（主线程检查器）、指向 DerivedData 的
    /// `DYLD_FRAMEWORK_PATH`、一串 `__XCODE_` / `__XPC_DYLD_`。它们会原样传给
    /// node/python3——那是和 Xcode 毫无关系的进程，不该继承任何一条。
    static func childEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        let home = NSHomeDirectory()
        let extra = [
            "\(home)/.local/bin",
            "\(home)/.hermes/node/bin",
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin", "/bin", "/usr/sbin", "/sbin",
        ]
        env["PATH"] = (extra + [env["PATH"] ?? ""]).joined(separator: ":")
        for key in env.keys where key.hasPrefix("DYLD_") || key.hasPrefix("__XCODE_")
            || key.hasPrefix("__XPC_") || key == "NSUnbufferedIO"
            || key == "OS_ACTIVITY_DT_MODE" {
            env.removeValue(forKey: key)
        }
        return env
    }

    /// 日志落文件，不丢 nullDevice——**丢掉等于"它为什么没起来"这件事不存在任何记录**，
    /// 而那正是用户唯一能拿到的线索。写文件同时也躲开了"管道缓冲区满会卡死子进程"那个坑。
    /// 涨太大就砍前半截：保新不保旧，查问题看的永远是最近那一段。
    static func logHandle(_ name: String) -> FileHandle? {
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs")
        let url = dir.appendingPathComponent("\(name).log")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int,
           size > 4 * 1024 * 1024, let data = try? Data(contentsOf: url) {
            try? data.suffix(1024 * 1024).write(to: url, options: .atomic)
        }
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        guard let handle = try? FileHandle(forWritingTo: url) else { return nil }
        handle.seekToEndOfFile()
        let stamp = ISO8601DateFormatter().string(from: Date())
        handle.write(Data("\n===== \(name) 启动 \(stamp) =====\n".utf8))
        return handle
    }

    static func logURL(_ name: String) -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/\(name).log")
    }

    /// 日志末尾几行。失败的时候要自己把线索摆出来，而不是让用户去终端 tail。
    static func logTail(_ name: String, _ lines: Int = 8) -> String? {
        guard let data = try? Data(contentsOf: logURL(name)),
              let text = String(data: data.suffix(64 * 1024), encoding: .utf8) else { return nil }
        let tail = text.split(separator: "\n").suffix(lines).joined(separator: "\n")
        return tail.isEmpty ? nil : tail
    }
}
