import AppKit

enum NativeConfig {
    static var applicationSupport: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/BBTouchBar", isDirectory: true)
    }

    static var bbExecutable: String? {
        if let explicit = ProcessInfo.processInfo.environment["BB_TOUCHBAR_BB_BIN"],
           FileManager.default.isExecutableFile(atPath: explicit) {
            return explicit
        }
        let pathFile = applicationSupport.appendingPathComponent("bb-path")
        if let configured = try? String(contentsOf: pathFile, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !configured.isEmpty,
           !configured.contains("/.local/state/fnm_multishells/"),
           FileManager.default.isExecutableFile(atPath: configured) {
            return configured
        }
        let environment = ProcessInfo.processInfo.environment["PATH"] ?? ""
        let candidates = ["/usr/local/bin/bb", "/opt/homebrew/bin/bb"]
            + environment.split(separator: ":").map { "\($0)/bb" }
        let found = candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
        if found == nil { NativeLog.info("bb executable not found") }
        return found
    }

    static var debug: Bool {
        ["1", "true", "yes", "on"].contains(
            ProcessInfo.processInfo.environment["BB_TOUCHBAR_DEBUG"]?.lowercased() ?? ""
        )
    }
}

enum NativeLog {
    private static let lock = NSLock()
    private static let handle: FileHandle? = {
        let directory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent("bb-touchbar.log")
        if !FileManager.default.fileExists(atPath: file.path) {
            FileManager.default.createFile(atPath: file.path, contents: nil)
        }
        let handle = try? FileHandle(forWritingTo: file)
        _ = try? handle?.seekToEnd()
        return handle
    }()

    static func info(_ message: String) {
        let line = Data("[bb-touchbar] \(message)\n".utf8)
        lock.lock()
        defer { lock.unlock() }
        FileHandle.standardError.write(line)
        try? handle?.write(contentsOf: line)
    }

    static func debug(_ message: String) {
        if NativeConfig.debug { info(message) }
    }

    static func error(_ message: String) { info("error: \(message)") }
}

enum ProviderIcon {
    private static let files: [String: String] = [
        "claude": "claudecode-color",
        "claudecode": "claudecode-color",
        "claude-code": "claudecode-color",
        "codex": "openai",
        "opencode": "opencode",
        "gemini": "gemini-color",
        "geminicli": "geminicli-color",
        "gemini-cli": "geminicli-color",
        "cursor": "cursor",
        "acp-cursor": "cursor",
        "copilot": "copilot-color",
        "githubcopilot": "githubcopilot",
        "github-copilot": "githubcopilot",
        "grok": "grok",
        "kimi": "kimi-color",
        "kimi-cli": "kimi-color",
        "qwen": "qwen-color",
        "qwen-code": "qwen-color",
        "deepseek": "deepseek-color",
        "openai": "openai",
        "windsurf": "windsurf",
        "cline": "cline",
        "roocode": "roocode",
        "roo-code": "roocode",
        "trae": "trae-color",
        "kiro": "kiro-color",
    ]

    private static var cache: [String: NSImage] = [:]

    static func label(for provider: String) -> String {
        switch provider.lowercased() {
        case "claude-code": return "CLAUDE"
        case "acp-cursor": return "CURSOR"
        case "geminicli", "gemini-cli": return "GEMINI CLI"
        case "githubcopilot", "github-copilot": return "COPILOT"
        case "roocode", "roo-code": return "ROO CODE"
        case "kimi-cli": return "KIMI"
        case "codex": return "CODEX"
        case "gemini": return "GEMINI"
        default: return provider.uppercased()
        }
    }

    static func image(for provider: String) -> NSImage {
        let key = provider.lowercased()
        if let cached = cache[key] { return cached }
        if let slug = files[key],
           let url = Bundle.main.url(forResource: slug, withExtension: "png"),
           let branded = NSImage(contentsOf: url) {
            if key == "codex" {
                let badge = circularChatGPT(branded)
                cache[key] = badge
                return badge
            }
            branded.size = NSSize(width: 22, height: 22)
            cache[key] = branded
            return branded
        }

        let image = generated(provider: key)
        cache[key] = image
        return image
    }

    private static func circularChatGPT(_ source: NSImage) -> NSImage {
        let size = NSSize(width: 22, height: 22)
        let image = NSImage(size: size)
        image.lockFocus()
        NSColor.white.setFill()
        NSBezierPath(ovalIn: NSRect(origin: .zero, size: size)).fill()
        source.draw(
            in: NSRect(x: 4, y: 4, width: 14, height: 14),
            from: .zero,
            operation: .sourceOver,
            fraction: 1
        )
        image.unlockFocus()
        return image
    }

    private static func generated(provider: String) -> NSImage {
        let size: CGFloat = 22
        let image = NSImage(size: NSSize(width: size, height: size))
        image.lockFocus()
        NSColor.systemIndigo.withAlphaComponent(0.9).setFill()
        NSBezierPath(roundedRect: NSRect(x: 0.5, y: 0.5, width: 21, height: 21), xRadius: 6, yRadius: 6).fill()
        let glyph = String(provider.prefix(1)).uppercased() as NSString
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
            .foregroundColor: NSColor.white,
        ]
        let textSize = glyph.size(withAttributes: attributes)
        glyph.draw(at: NSPoint(x: (size - textSize.width) / 2, y: (size - textSize.height) / 2), withAttributes: attributes)
        image.unlockFocus()
        return image
    }
}

enum Spinner {
    static let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    static let interval: TimeInterval = 0.25
    static func frame(_ tick: Int) -> String { frames[tick % frames.count] }
}
