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
    private let pollSignal = DispatchSemaphore(value: 0)
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
                if !self.isStopped {
                    _ = self.pollSignal.wait(timeout: .now() + 2)
                }
            }
        }
    }

    func stop() {
        lock.lock()
        stopped = true
        lock.unlock()
        BBCommand.cancelPolling()
        pollSignal.signal()
    }

    func refreshAfterWake() {
        NativeLog.info("wake detected; refreshing BB connection")
        BBCommand.cancelPolling()
        pollSignal.signal()
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
        guard let data = BBCommand.run(
            ["touchbar", "snapshot"], timeout: 5, polling: true
        ) else {
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
        guard let data = BBCommand.run(
                  ["host-monitor", "snapshot"], timeout: 5, polling: true
              ),
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
            _ = BBCommand.run(["touchbar", "open", entry.id])
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                activateBB()
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
    private final class OutputBuffer: @unchecked Sendable {
        private let lock = NSLock()
        private var data = Data()

        func append(_ chunk: Data) {
            lock.lock()
            let remaining = max(0, 65_537 - data.count)
            if remaining > 0 { data.append(chunk.prefix(remaining)) }
            lock.unlock()
        }

        func snapshot() -> Data {
            lock.lock()
            defer { lock.unlock() }
            return data
        }
    }

    private final class PollingState: @unchecked Sendable {
        private let lock = NSLock()
        private weak var process: Process?

        func set(_ next: Process) {
            lock.lock()
            process = next
            lock.unlock()
        }

        func clear(_ expected: Process) {
            lock.lock()
            if process === expected { process = nil }
            lock.unlock()
        }

        func cancel() {
            lock.lock()
            let current = process
            lock.unlock()
            if let current, current.isRunning { current.terminate() }
        }
    }

    private static let pollingState = PollingState()

    static func cancelPolling() {
        pollingState.cancel()
    }

    static func run(
        _ arguments: [String],
        timeout: TimeInterval = 1.5,
        polling: Bool = false
    ) -> Data? {
        guard let executable = NativeConfig.bbExecutable else { return nil }
        let process = Process()
        let output = Pipe()
        let captured = OutputBuffer()
        let finished = DispatchSemaphore(value: 0)
        let outputClosed = DispatchSemaphore(value: 0)
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
        output.fileHandleForReading.readabilityHandler = { handle in
            let chunk = handle.availableData
            if chunk.isEmpty {
                outputClosed.signal()
                return
            }
            captured.append(chunk)
        }
        process.terminationHandler = { _ in finished.signal() }

        do { try process.run() } catch {
            output.fileHandleForReading.readabilityHandler = nil
            NativeLog.error("could not launch bb: \(error.localizedDescription)")
            return nil
        }
        if polling {
            pollingState.set(process)
        }
        defer {
            if polling { pollingState.clear(process) }
            output.fileHandleForReading.readabilityHandler = nil
        }

        let timedOut = finished.wait(timeout: .now() + timeout) == .timedOut
        if timedOut {
            NativeLog.error("bb snapshot timed out")
            process.terminate()
            if finished.wait(timeout: .now() + 0.5) == .timedOut {
                kill(process.processIdentifier, SIGKILL)
                _ = finished.wait(timeout: .now() + 0.5)
            }
        }
        _ = outputClosed.wait(timeout: .now() + 0.25)
        guard !process.isRunning else {
            NativeLog.error("bb process did not stop after timeout")
            return nil
        }
        let data = captured.snapshot()
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
