import AppKit

enum AgentStatus: String, Decodable {
    case blocked, error, working, done, idle, waiting, unknown

    var isBusy: Bool { self == .working }
}

struct AgentEntry: Equatable {
    let id: String
    let title: String
    let provider: String
    let project: String
    let status: AgentStatus
}

struct UsageEntry: Equatable {
    let id: String
    let name: String
    let status: String
    let usedPercent: Double?
    let windowLabel: String?
}

struct HostMetricEntry: Equatable {
    let id: String
    let name: String
    let status: String
    let sampleState: String
    let cpuPercent: Double?
    let memoryPercent: Double?
    let diskPercent: Double?
    let receiveBytesPerSecond: Double?
    let sendBytesPerSecond: Double?
    let attentionThresholdPercent: Double
    let criticalThresholdPercent: Double
}

struct AgentSnapshot: Equatable {
    var agents: [AgentEntry] = []
    var usage: [UsageEntry] = []
    var hosts: [HostMetricEntry] = []
    var connected = false

    var working: Int { agents.filter { $0.status == .working }.count }
    var errors: Int { agents.filter { $0.status == .error }.count }
    var blocked: Int {
        agents.filter { $0.status == .blocked || $0.status == .error }.count
    }
    var done: Int { agents.filter { $0.status == .done }.count }
}

private struct BBSnapshot: Decodable {
    struct Summary: Decodable {
        let active: Int
        let attention: Int
        let visible: Int
    }

    struct Thread: Decodable {
        let id: String
        let title: String
        let status: String
        let providerId: String
        let project: String
        let unread: Bool
        let attention: String?
    }

    struct Usage: Decodable {
        let id: String
        let name: String
        let status: String
        let usedPercent: Double?
        let windowLabel: String?
    }

    let schemaVersion: Int
    let summary: Summary
    let threads: [Thread]
    let usage: [Usage]?
}

private struct BBHostSnapshot: Decodable {
    struct Thresholds: Decodable {
        let attentionPercent: Double
        let criticalPercent: Double
    }

    struct Host: Decodable {
        let id: String
        let name: String
        let status: String
        let sampleState: String
        let cpuPercent: Double?
        let memoryPercent: Double?
        let diskPercent: Double?
        let receiveBytesPerSecond: Double?
        let sendBytesPerSecond: Double?
    }

    let schemaVersion: Int
    let thresholds: Thresholds
    let hosts: [Host]
}

final class AgentStore {
    var onChange: ((AgentSnapshot) -> Void)?
    private(set) var snapshot = AgentSnapshot()

    private let queue = DispatchQueue(label: "app.getbb.touchbar.store", qos: .utility)
    private let lock = NSLock()
    private var lastGoodSnapshot = AgentSnapshot()
    private var consecutiveFailures = 0
    private var stopped = false
    private static let offlineFailureThreshold = 3

    func start() {
        queue.async { [weak self] in
            while let self, !self.isStopped {
                if let next = Self.fetch(previousHosts: self.lastGoodSnapshot.hosts) {
                    self.consecutiveFailures = 0
                    self.lastGoodSnapshot = next
                    self.publish(next)
                } else {
                    self.consecutiveFailures += 1
                    if self.consecutiveFailures == Self.offlineFailureThreshold {
                        var stale = self.lastGoodSnapshot
                        stale.connected = false
                        self.publish(stale)
                    }
                }
                for _ in 0..<20 where !self.isStopped {
                    Thread.sleep(forTimeInterval: 0.1)
                }
            }
        }
    }

    func stop() {
        lock.lock()
        stopped = true
        lock.unlock()
    }

    private var isStopped: Bool {
        lock.lock()
        defer { lock.unlock() }
        return stopped
    }

    private func publish(_ next: AgentSnapshot) {
        DispatchQueue.main.async { [weak self] in
            guard let self, next != self.snapshot else { return }
            self.snapshot = next
            self.onChange?(next)
        }
    }

    private static func fetch(previousHosts: [HostMetricEntry]) -> AgentSnapshot? {
        guard let data = BBCommand.run(["touchbar", "snapshot"], timeout: 5) else {
            NativeLog.debug("snapshot command returned no data")
            return nil
        }
        guard data.count <= 65_536 else {
            NativeLog.error("snapshot output too large")
            return nil
        }
        guard let payload = try? JSONDecoder().decode(BBSnapshot.self, from: data) else {
            NativeLog.error("snapshot JSON could not be decoded (\(data.count) bytes)")
            return nil
        }
        guard payload.schemaVersion == 1 else {
            NativeLog.error("unsupported snapshot schema \(payload.schemaVersion)")
            return nil
        }

        let entries = payload.threads.map { thread in
            AgentEntry(
                id: thread.id,
                title: thread.title,
                provider: thread.providerId,
                project: thread.project,
                status: status(for: thread)
            )
        }
        let usage = (payload.usage ?? []).map {
            UsageEntry(
                id: $0.id,
                name: $0.name,
                status: $0.status,
                usedPercent: $0.usedPercent,
                windowLabel: $0.windowLabel
            )
        }
        return AgentSnapshot(
            agents: entries,
            usage: usage,
            hosts: fetchHosts(fallback: previousHosts),
            connected: true
        )
    }

    private static func fetchHosts(fallback: [HostMetricEntry]) -> [HostMetricEntry] {
        let enabled = UserDefaults.standard.object(
            forKey: "BBTouchBarShowHostMonitor"
        ) as? Bool ?? true
        guard enabled else {
            return fallback
        }
        guard let data = BBCommand.run(["host-monitor", "snapshot"], timeout: 5),
              data.count <= 65_536,
              let payload = try? JSONDecoder().decode(BBHostSnapshot.self, from: data),
              payload.schemaVersion == 1 else {
            NativeLog.debug("host monitor snapshot unavailable")
            return fallback
        }
        return payload.hosts.map {
            HostMetricEntry(
                id: $0.id,
                name: $0.name,
                status: $0.status,
                sampleState: $0.sampleState,
                cpuPercent: $0.cpuPercent,
                memoryPercent: $0.memoryPercent,
                diskPercent: $0.diskPercent,
                receiveBytesPerSecond: $0.receiveBytesPerSecond,
                sendBytesPerSecond: $0.sendBytesPerSecond,
                attentionThresholdPercent: payload.thresholds.attentionPercent,
                criticalThresholdPercent: payload.thresholds.criticalPercent
            )
        }
    }

    private static func status(for thread: BBSnapshot.Thread) -> AgentStatus {
        if thread.status == "error" { return .error }
        if thread.attention == "input" { return .blocked }
        if thread.status == "active" || thread.status == "stopping" { return .working }
        if thread.status == "waiting" { return .waiting }
        if thread.unread || thread.attention == "unread" { return .done }
        if thread.status == "idle" { return .idle }
        return .unknown
    }

    static func focus(_ entry: AgentEntry) {
        DispatchQueue.global(qos: .userInitiated).async {
            let opened = BBCommand.run(
                ["touchbar", "open", entry.id], timeout: 5
            ) != nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                if opened {
                    NativeLog.info("opened thread \(entry.id) in BB")
                    activateBB()
                } else {
                    NativeLog.error("could not open thread \(entry.id)")
                }
            }
        }
    }

    static func openHostMonitor(
        hostId: String,
        completion: @escaping (Bool) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let opened = BBCommand.run(
                ["host-monitor", "open", hostId], timeout: 5
            ) != nil
            DispatchQueue.main.async {
                if opened { activateBB() }
                completion(opened)
            }
        }
    }

    private static func activateBB() {
        let workspace = NSWorkspace.shared
        if let app = workspace.runningApplications.first(where: {
            $0.bundleIdentifier == "dev.bb.desktop" ||
                $0.localizedName?.caseInsensitiveCompare("bb") == .orderedSame
        }) {
            app.activate(options: [.activateAllWindows])
            NativeLog.info("activated BB for selected thread")
            return
        }
        guard let url = workspace.urlForApplication(
            withBundleIdentifier: "dev.bb.desktop"
        ) else {
            NativeLog.error("BB desktop application was not found")
            return
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        workspace.openApplication(at: url, configuration: configuration) {
            _, error in
            if let error {
                NativeLog.error("could not activate BB: \(error.localizedDescription)")
            }
        }
    }
}

enum BBCommand {
    static func run(_ arguments: [String], timeout: TimeInterval = 1.5) -> Data? {
        guard let executable = NativeConfig.bbExecutable else { return nil }
        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        var environment = ProcessInfo.processInfo.environment
        let fnmNodeBin = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".local/share/fnm/node-versions/v22.22.0/installation/bin").path
        environment["PATH"] = fnmNodeBin + ":/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:" + (environment["PATH"] ?? "")
        environment["HOME"] = FileManager.default.homeDirectoryForCurrentUser.path
        process.environment = environment
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice

        do { try process.run() } catch {
            NativeLog.error("could not launch bb: \(error.localizedDescription)")
            return nil
        }
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.04)
        }
        var timedOut = false
        if process.isRunning {
            NativeLog.error("bb command timed out: \(arguments.first ?? "unknown")")
            timedOut = true
            process.terminate()
        }
        process.waitUntilExit()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        guard process.terminationStatus == 0 else {
            // The BB CLI can leave a helper child alive after writing its JSON.
            // Preserve a complete snapshot even when the wrapper is terminated.
            if timedOut, !data.isEmpty { return data }
            NativeLog.error("bb exited with status \(process.terminationStatus)")
            return nil
        }
        return data
    }
}
