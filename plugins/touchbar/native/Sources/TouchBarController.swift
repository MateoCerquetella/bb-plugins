import AppKit

extension NSTouchBarItem.Identifier {
    static let bbStrip = NSTouchBarItem.Identifier("app.getbb.touchbar.strip")
    static let bbList = NSTouchBarItem.Identifier("app.getbb.touchbar.list")
    static let bbSettingsPanel = NSTouchBarItem.Identifier("app.getbb.touchbar.settings-panel")
    static let bbSettings = NSTouchBarItem.Identifier("app.getbb.touchbar.settings")
    static let bbPriority = NSTouchBarItem.Identifier("app.getbb.touchbar.priority")
    static let bbProject = NSTouchBarItem.Identifier("app.getbb.touchbar.project")
    static let bbDock = NSTouchBarItem.Identifier("app.getbb.touchbar.dock")
    static let bbCarousel = NSTouchBarItem.Identifier("app.getbb.touchbar.carousel")
    static let bbPreviousProject = NSTouchBarItem.Identifier("app.getbb.touchbar.previous-project")
    static let bbNextProject = NSTouchBarItem.Identifier("app.getbb.touchbar.next-project")
    static let bbUsage = NSTouchBarItem.Identifier("app.getbb.touchbar.usage")
    static let bbHostMonitor = NSTouchBarItem.Identifier("app.getbb.touchbar.host-monitor")
    static let bbUsageToggle = NSTouchBarItem.Identifier("app.getbb.touchbar.usage-toggle")
    static let bbHostToggle = NSTouchBarItem.Identifier("app.getbb.touchbar.host-toggle")
    static let bbCodexToggle = NSTouchBarItem.Identifier("app.getbb.touchbar.codex-toggle")
    static let bbClaudeToggle = NSTouchBarItem.Identifier("app.getbb.touchbar.claude-toggle")
    static let bbCursorToggle = NSTouchBarItem.Identifier("app.getbb.touchbar.cursor-toggle")
    static let bbClose = NSTouchBarItem.Identifier("app.getbb.touchbar.close")
    static let bbUnreadAlert = NSTouchBarItem.Identifier("app.getbb.touchbar.unread-alert")
}

private enum SortMode: String {
    case status
    case project
    case dock
    case carousel
}

private enum StatusPalette {
    static func bezel(for status: AgentStatus) -> NSColor {
        switch status {
        case .working: return color(0x34A853)
        case .blocked, .waiting: return color(0xD9911A)
        case .done: return color(0xFF7A00)
        case .error: return color(0xD94B4B)
        case .idle: return color(0xA1A8B3)
        case .unknown: return color(0x69717D)
        }
    }

    static func badge(for status: AgentStatus) -> String {
        switch status {
        case .blocked: return "INPUT"
        case .error: return "ERROR"
        case .working: return "RUN"
        case .done: return "UNREAD"
        case .waiting: return "WAIT"
        case .idle: return "IDLE"
        case .unknown: return "?"
        }
    }

    static func section(for status: AgentStatus) -> String {
        switch status {
        case .blocked: return "NEEDS YOU"
        case .error: return "FAILED"
        case .working: return "ACTIVE"
        case .waiting: return "WAITING"
        case .done: return "UNREAD"
        case .idle: return "IDLE"
        case .unknown: return "OTHER"
        }
    }

    private static func color(_ rgb: Int) -> NSColor {
        NSColor(
            calibratedRed: CGFloat((rgb >> 16) & 0xff) / 255,
            green: CGFloat((rgb >> 8) & 0xff) / 255,
            blue: CGFloat(rgb & 0xff) / 255,
            alpha: 1
        )
    }
}

private final class ProjectInitialBadge: NSView {
    private let initial: String
    private let color: NSColor

    init(initial: String, color: NSColor) {
        self.initial = initial
        self.color = color
        super.init(frame: .zero)
        wantsLayer = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        color.setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 5, yRadius: 5).fill()
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .bold),
            .foregroundColor: NSColor.white,
        ]
        let text = initial as NSString
        let size = text.size(withAttributes: attributes)
        text.draw(
            at: NSPoint(
                x: floor((bounds.width - size.width) / 2),
                y: floor((bounds.height - size.height) / 2)
            ),
            withAttributes: attributes
        )
    }
}

private final class GroupDividerView: NSButton {
    private let statusLabel = NSTextField(labelWithString: "")
    private let projectLabel = NSTextField(labelWithString: "")
    private let compactProject: Bool
    private let compactWidth: CGFloat
    private var projectBadge: ProjectInitialBadge?

    init(
        status: AgentStatus,
        project: String,
        count: Int,
        projectFirst: Bool,
        threadId: String,
        target: AnyObject?,
        action: Selector?
    ) {
        compactProject = projectFirst
        compactWidth = projectFirst
            ? 32
            : 96
        super.init(frame: .zero)
        self.target = target
        self.action = action
        identifier = NSUserInterfaceItemIdentifier(threadId)
        title = ""
        isBordered = false
        let color = projectFirst ? Self.projectColor(project) : StatusPalette.bezel(for: status)
        wantsLayer = true
        layer?.cornerRadius = 5
        layer?.backgroundColor = projectFirst
            ? NSColor.clear.cgColor
            : NSColor(white: 0.08, alpha: 0.98).cgColor
        layer?.borderWidth = projectFirst ? 0 : 1
        layer?.borderColor = color.withAlphaComponent(0.7).cgColor

        statusLabel.stringValue = projectFirst ? "" : StatusPalette.section(for: status)
        statusLabel.font = .monospacedSystemFont(ofSize: 6.5, weight: .bold)
        statusLabel.alignment = .left
        statusLabel.textColor = color
        statusLabel.lineBreakMode = .byTruncatingTail
        projectLabel.stringValue = projectFirst
            ? ""
            : "\(project.uppercased()) · \(count)"
        projectLabel.font = .monospacedSystemFont(
            ofSize: projectFirst ? 7.2 : 7.5,
            weight: .bold
        )
        projectLabel.alignment = .left
        projectLabel.textColor = .white
        projectLabel.lineBreakMode = .byTruncatingTail
        addSubview(statusLabel)
        addSubview(projectLabel)
        if projectFirst {
            let badge = ProjectInitialBadge(
                initial: Self.projectInitials(project),
                color: color
            )
            projectBadge = badge
            addSubview(badge)
        }
        let section = projectFirst ? "Project" : StatusPalette.section(for: status)
        setAccessibilityLabel("\(section), \(project), \(count) threads")
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize {
        NSSize(width: compactWidth, height: 30)
    }

    override func layout() {
        super.layout()
        if compactProject {
            statusLabel.frame = .zero
            projectBadge?.frame = NSRect(x: 5, y: 4, width: 22, height: 22)
            projectLabel.frame = .zero
        } else {
            statusLabel.frame = NSRect(x: 7, y: 16, width: bounds.width - 14, height: 9)
            projectLabel.frame = NSRect(x: 7, y: 4, width: bounds.width - 14, height: 10)
        }
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        guard isEnabled, let action else { return }
        NSApp.sendAction(action, to: target, from: self)
    }

    func setSelected(_ selected: Bool) {
        guard compactProject else { return }
        layer?.borderWidth = selected ? 2 : 0
        layer?.borderColor = selected ? NSColor.white.cgColor : NSColor.clear.cgColor
    }

    private static func projectInitials(_ project: String) -> String {
        guard let token = project.split(whereSeparator: {
            !$0.isLetter && !$0.isNumber
        }).first else { return "?" }
        if token.count <= 2 { return token.uppercased() }
        return String(token.prefix(1)).uppercased()
    }

    static func projectColor(_ project: String) -> NSColor {
        let palette: [NSColor] = [
            .systemBlue, .systemPurple, .systemPink, .systemOrange,
            .systemGreen, .systemTeal, .systemIndigo, .systemRed,
        ]
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in project.lowercased().utf8 {
            hash ^= UInt64(byte)
            hash &*= 0x100000001b3
        }
        return palette[Int(hash % UInt64(palette.count))]
    }
}

private final class ProjectGroupView: NSView {
    private let stack: NSStackView
    private let measuredWidth: CGFloat

    init(views: [NSView]) {
        let nestedStack = NSStackView(views: views)
        nestedStack.orientation = .horizontal
        nestedStack.spacing = 4
        nestedStack.alignment = .centerY
        stack = nestedStack
        measuredWidth = nestedStack.fittingSize.width + 8
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 6
        layer?.borderWidth = 1
        layer?.borderColor = NSColor(white: 0.28, alpha: 0.9).cgColor
        layer?.backgroundColor = NSColor(white: 0.035, alpha: 0.98).cgColor
        layer?.masksToBounds = true
        addSubview(stack)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize {
        NSSize(width: measuredWidth, height: 30)
    }

    override func layout() {
        super.layout()
        stack.frame = NSRect(x: 4, y: 0, width: bounds.width - 8, height: 30)
    }
}

private final class HostMetricCircle: NSView {
    private let title: String
    private let value: String
    private let color: NSColor
    private let progress: Double?

    init(title: String, value: String, color: NSColor, progress: Double?) {
        self.title = title
        self.value = value
        self.color = color
        self.progress = progress
        super.init(frame: .zero)
        setAccessibilityLabel("\(title), \(value)")
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize { NSSize(width: 32, height: 30) }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let ring = NSRect(x: 3, y: 2, width: 26, height: 26)
        color.withAlphaComponent(0.12).setFill()
        NSBezierPath(ovalIn: ring).fill()
        NSColor(white: 0.25, alpha: 1).setStroke()
        let background = NSBezierPath(ovalIn: ring)
        background.lineWidth = 1.5
        background.stroke()

        color.setStroke()
        if let progress {
            let clamped = min(100, max(0, progress))
            let arc = NSBezierPath()
            arc.appendArc(
                withCenter: NSPoint(x: ring.midX, y: ring.midY),
                radius: 13,
                startAngle: 90,
                endAngle: 90 - CGFloat(clamped * 3.6),
                clockwise: true
            )
            arc.lineWidth = 2.5
            arc.lineCapStyle = .round
            arc.stroke()
        } else {
            let outline = NSBezierPath(ovalIn: ring)
            outline.lineWidth = 2
            outline.stroke()
        }

        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 5, weight: .bold),
            .foregroundColor: color,
        ]
        let valueAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedDigitSystemFont(ofSize: 6.5, weight: .semibold),
            .foregroundColor: NSColor.white,
        ]
        drawCentered(title, y: 16, attributes: titleAttributes)
        drawCentered(value, y: 7, attributes: valueAttributes)
    }

    private func drawCentered(
        _ text: String,
        y: CGFloat,
        attributes: [NSAttributedString.Key: Any]
    ) {
        let string = text as NSString
        let size = string.size(withAttributes: attributes)
        string.draw(
            at: NSPoint(x: floor((bounds.width - size.width) / 2), y: y),
            withAttributes: attributes
        )
    }
}

private final class HostMetricView: NSButton {
    private let iconView = NSImageView()
    private let stateLabel = NSTextField(labelWithString: "")
    private let nameLabel = NSTextField(labelWithString: "")
    private let circles: [HostMetricCircle]
    private let measuredWidth: CGFloat

    init(entry: HostMetricEntry, target: AnyObject?, action: Selector?) {
        let connected = entry.status == "connected"
        let cpu = HostMetricCircle(
            title: "C",
            value: Self.percent(entry.cpuPercent),
            color: Self.resourceColor(entry.cpuPercent, entry: entry, connected: connected),
            progress: entry.cpuPercent
        )
        let memory = HostMetricCircle(
            title: "R",
            value: Self.percent(entry.memoryPercent),
            color: Self.resourceColor(entry.memoryPercent, entry: entry, connected: connected),
            progress: entry.memoryPercent
        )
        let disk = HostMetricCircle(
            title: "D",
            value: Self.percent(entry.diskPercent),
            color: Self.resourceColor(entry.diskPercent, entry: entry, connected: connected),
            progress: entry.diskPercent
        )
        let download = HostMetricCircle(
            title: "↓",
            value: Self.rate(entry.receiveBytesPerSecond),
            color: connected ? .systemRed : NSColor(white: 0.4, alpha: 1),
            progress: nil
        )
        let upload = HostMetricCircle(
            title: "↑",
            value: Self.rate(entry.sendBytesPerSecond),
            color: connected ? .systemBlue : NSColor(white: 0.4, alpha: 1),
            progress: nil
        )
        circles = [cpu, memory, disk, download, upload]
        measuredWidth = 82 + circles.reduce(CGFloat(0)) {
            $0 + $1.intrinsicContentSize.width
        } + CGFloat((circles.count - 1) * 2) + 4
        super.init(frame: .zero)
        self.target = target
        self.action = action
        identifier = NSUserInterfaceItemIdentifier(entry.id)
        title = ""
        isBordered = false
        refusesFirstResponder = true
        wantsLayer = true
        layer?.cornerRadius = 7
        layer?.borderWidth = 1
        layer?.borderColor = Self.overallColor(entry).withAlphaComponent(0.75).cgColor
        layer?.backgroundColor = NSColor(white: 0.035, alpha: 0.98).cgColor
        layer?.masksToBounds = true

        iconView.image = NSImage(
            systemSymbolName: "desktopcomputer",
            accessibilityDescription: "Host"
        )
        iconView.contentTintColor = connected ? .systemGreen : .systemRed
        iconView.imageScaling = .scaleProportionallyDown
        stateLabel.stringValue = connected ? "LIVE" : "OFFLINE"
        stateLabel.font = .monospacedSystemFont(ofSize: 5.5, weight: .bold)
        stateLabel.textColor = connected ? .systemGreen : .systemRed
        nameLabel.stringValue = entry.name
        nameLabel.font = .monospacedSystemFont(ofSize: 7, weight: .bold)
        nameLabel.textColor = .white
        nameLabel.lineBreakMode = .byTruncatingTail
        addSubview(iconView)
        addSubview(stateLabel)
        addSubview(nameLabel)
        for circle in circles { addSubview(circle) }
        setAccessibilityLabel(
            "Open \(entry.name) in Host Monitor, \(Self.accessibleMetrics(entry))"
        )
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize { NSSize(width: measuredWidth, height: 30) }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        guard isEnabled, let action else { return }
        let resting = layer?.backgroundColor
        layer?.backgroundColor = NSColor(white: 0.16, alpha: 1).cgColor
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            self?.layer?.backgroundColor = resting
        }
        NSApp.sendAction(action, to: target, from: self)
    }

    override func layout() {
        super.layout()
        iconView.frame = NSRect(x: 6, y: 8, width: 15, height: 15)
        stateLabel.frame = NSRect(x: 25, y: 17, width: 50, height: 7)
        nameLabel.frame = NSRect(x: 25, y: 5, width: 50, height: 10)
        var x: CGFloat = 79
        for circle in circles {
            let width = circle.intrinsicContentSize.width
            circle.frame = NSRect(x: x, y: 0, width: width, height: 30)
            x += width + 2
        }
    }

    private static func percent(_ value: Double?) -> String {
        value.map { "\(Int($0.rounded()))%" } ?? "—"
    }

    private static func rate(_ value: Double?) -> String {
        guard var current = value else { return "—" }
        let units = ["B", "K", "M", "G"]
        var index = 0
        while current >= 1_024, index < units.count - 1 {
            current /= 1_024
            index += 1
        }
        return current >= 10
            ? "\(Int(current.rounded()))\(units[index])"
            : String(format: "%.1f%@", current, units[index])
    }

    private static func resourceColor(
        _ value: Double?,
        entry: HostMetricEntry,
        connected: Bool
    ) -> NSColor {
        guard connected, let value else { return NSColor(white: 0.4, alpha: 1) }
        if value >= entry.criticalThresholdPercent { return .systemRed }
        if value >= entry.attentionThresholdPercent { return .systemOrange }
        return .systemGreen
    }

    private static func overallColor(_ entry: HostMetricEntry) -> NSColor {
        guard entry.status == "connected" else { return .systemRed }
        let peak = [entry.cpuPercent, entry.memoryPercent, entry.diskPercent]
            .compactMap { $0 }
            .max() ?? 0
        return resourceColor(peak, entry: entry, connected: true)
    }

    private static func accessibleMetrics(_ entry: HostMetricEntry) -> String {
        guard entry.status == "connected" else { return "offline" }
        return "CPU \(percent(entry.cpuPercent)), RAM \(percent(entry.memoryPercent)), disk \(percent(entry.diskPercent)), download \(rate(entry.receiveBytesPerSecond)), upload \(rate(entry.sendBytesPerSecond))"
    }
}

private final class UsageRingView: NSView {
    private let percent: Double?
    private let iconView = NSImageView()

    init(entry: UsageEntry) {
        percent = entry.usedPercent
        super.init(frame: .zero)
        let provider = entry.id == "claudeCode" ? "claude-code" : entry.id
        iconView.image = ProviderIcon.image(for: provider)
        iconView.imageScaling = .scaleProportionallyUpOrDown
        iconView.alphaValue = entry.usedPercent == nil ? 0.45 : 1
        iconView.wantsLayer = true
        iconView.layer?.cornerRadius = 12
        iconView.layer?.masksToBounds = true
        iconView.layer?.backgroundColor = entry.id == "cursor"
            ? NSColor.white.cgColor
            : NSColor.clear.cgColor
        addSubview(iconView)
        setAccessibilityLabel(
            entry.usedPercent.map {
                "\(entry.name) \(Int($0.rounded())) percent used"
            } ?? "\(entry.name) unavailable"
        )
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize { NSSize(width: 32, height: 30) }

    override func layout() {
        super.layout()
        iconView.frame = NSRect(x: 4, y: 3, width: 24, height: 24)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let ringRect = NSRect(x: 2, y: 1, width: 28, height: 28)
        NSColor(white: 0.22, alpha: 1).setFill()
        NSBezierPath(ovalIn: ringRect).fill()
        NSColor(white: 0.34, alpha: 1).setStroke()
        let background = NSBezierPath(ovalIn: ringRect)
        background.lineWidth = 3
        background.stroke()

        guard let percent else { return }
        let clamped = min(100, max(0, percent))
        Self.color(for: clamped).setStroke()
        let progress = NSBezierPath()
        progress.appendArc(
            withCenter: NSPoint(x: ringRect.midX, y: ringRect.midY),
            radius: 12.5,
            startAngle: 90,
            endAngle: 90 - CGFloat(clamped * 3.6),
            clockwise: true
        )
        progress.lineWidth = 3
        progress.lineCapStyle = .round
        progress.stroke()
    }

    private static func color(for percent: Double) -> NSColor {
        if percent >= 90 { return .systemRed }
        if percent >= 75 { return .systemOrange }
        return .systemGreen
    }
}

private final class UsageIconStripView: NSView {
    private var rings: [UsageRingView] = []

    override var intrinsicContentSize: NSSize {
        NSSize(width: CGFloat(max(rings.count, 1) * 32), height: 30)
    }

    func update(entries: [UsageEntry], visibility: [String: Bool]) {
        for ring in rings { ring.removeFromSuperview() }
        rings = entries.compactMap { entry in
            guard visibility[entry.id] == true else { return nil }
            return UsageRingView(entry: entry)
        }
        for ring in rings { addSubview(ring) }
        setAccessibilityLabel(
            rings.isEmpty ? "Subscription usage hidden" : "Subscription usage"
        )
        invalidateIntrinsicContentSize()
        frame.size = intrinsicContentSize
        needsLayout = true
        needsDisplay = true
    }

    override func layout() {
        super.layout()
        for (index, ring) in rings.enumerated() {
            ring.frame = NSRect(x: CGFloat(index * 32), y: 0, width: 32, height: 30)
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard rings.isEmpty else { return }
        NSColor(white: 0.35, alpha: 1).setStroke()
        let path = NSBezierPath(ovalIn: NSRect(x: 6, y: 6, width: 18, height: 18))
        path.lineWidth = 2
        path.stroke()
    }
}

private final class SettingsControlButton: NSButton {
    private let fixedWidth: CGFloat
    private let iconView = NSImageView()
    var drawsLightImageTile = false

    init(title: String, width: CGFloat) {
        fixedWidth = width
        super.init(frame: NSRect(x: 0, y: 0, width: width, height: 30))
        self.title = title
        isBordered = false
        refusesFirstResponder = true
        iconView.imageScaling = .scaleProportionallyUpOrDown
        iconView.wantsLayer = true
        iconView.layer?.cornerRadius = 14
        iconView.layer?.masksToBounds = true
        addSubview(iconView)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize { NSSize(width: fixedWidth, height: 30) }

    override func layout() {
        super.layout()
        iconView.image = image
        iconView.isHidden = image == nil
        iconView.layer?.backgroundColor = drawsLightImageTile
            ? NSColor.white.cgColor
            : NSColor.clear.cgColor
        iconView.frame = NSRect(
            x: floor((bounds.width - 28) / 2),
            y: 1,
            width: 28,
            height: 28
        )
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        guard isEnabled, let action else { return }
        NSApp.sendAction(action, to: target, from: self)
    }

    override func draw(_ dirtyRect: NSRect) {
        let fill = bezelColor ?? NSColor(white: 0.18, alpha: 1)
        fill.setFill()
        let shape = NSBezierPath(
            roundedRect: bounds.insetBy(dx: 0, dy: 1),
            xRadius: 6,
            yRadius: 6
        )
        shape.fill()
        NSColor.white.withAlphaComponent(0.16).setStroke()
        shape.lineWidth = 1
        shape.stroke()

        if image == nil {
            let attributes: [NSAttributedString.Key: Any] = [
                .font: font ?? NSFont.monospacedSystemFont(ofSize: 5.8, weight: .bold),
                .foregroundColor: NSColor.white,
            ]
            let string = title as NSString
            let size = string.size(withAttributes: attributes)
            string.draw(
                at: NSPoint(
                    x: floor((bounds.width - size.width) / 2),
                    y: floor((bounds.height - size.height) / 2)
                ),
                withAttributes: attributes
            )
        }
    }
}

private final class CompactNativeButton: NSButton {
    private let fixedWidth: CGFloat

    init(title: String, width: CGFloat) {
        fixedWidth = width
        super.init(frame: NSRect(x: 0, y: 0, width: width, height: 30))
        self.title = title
        refusesFirstResponder = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize { NSSize(width: fixedWidth, height: 30) }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        guard isEnabled, let action else { return }
        NSApp.sendAction(action, to: target, from: self)
    }
}

private final class UnreadAlertButton: NSButton {
    private var bright = true

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        refusesFirstResponder = true
        wantsLayer = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize { NSSize(width: 1_000, height: 30) }

    func update(count: Int) {
        title = count == 1
            ? "✓ AGENT FINISHED — TAP TO VIEW"
            : "✓ \(count) AGENTS FINISHED — TAP TO VIEW"
        setAccessibilityLabel(
            count == 1
                ? "One agent finished with unread results. Tap to view."
                : "\(count) agents finished with unread results. Tap to view."
        )
        needsDisplay = true
    }

    func setPulse(bright: Bool) {
        self.bright = bright
        needsDisplay = true
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        guard isEnabled, let action else { return }
        NSApp.sendAction(action, to: target, from: self)
    }

    override func draw(_ dirtyRect: NSRect) {
        let orange = bright
            ? NSColor(calibratedRed: 1, green: 0.48, blue: 0.02, alpha: 1)
            : NSColor(calibratedRed: 0.58, green: 0.22, blue: 0.01, alpha: 1)
        orange.setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 6, yRadius: 6).fill()
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .heavy),
            .foregroundColor: NSColor.white,
        ]
        let string = title as NSString
        let size = string.size(withAttributes: attributes)
        string.draw(
            at: NSPoint(
                x: max(8, floor((bounds.width - size.width) / 2)),
                y: floor((bounds.height - size.height) / 2)
            ),
            withAttributes: attributes
        )
    }
}

private final class SettingsGroupView: NSView {
    private let sectionTitle: String
    private let sectionTitleWidth: CGFloat
    private let controls: [SettingsControlButton]
    private let measuredWidth: CGFloat

    init(title: String, controls: [SettingsControlButton]) {
        sectionTitle = title
        let titleFont = NSFont.monospacedSystemFont(ofSize: 5.8, weight: .bold)
        let titleWidth = max(
            38,
            ceil((title as NSString).size(withAttributes: [.font: titleFont]).width) + 12
        )
        sectionTitleWidth = titleWidth
        self.controls = controls
        measuredWidth = titleWidth +
            controls.reduce(CGFloat(8)) { $0 + $1.intrinsicContentSize.width } +
            CGFloat(max(controls.count - 1, 0) * 3)
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 6
        layer?.borderWidth = 1
        layer?.borderColor = NSColor(white: 0.30, alpha: 0.9).cgColor
        layer?.backgroundColor = NSColor(white: 0.045, alpha: 0.98).cgColor
        for control in controls { addSubview(control) }
        setAccessibilityLabel("\(title) settings")
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var intrinsicContentSize: NSSize { NSSize(width: measuredWidth, height: 30) }

    override func layout() {
        super.layout()
        var x = sectionTitleWidth + 4
        for control in controls {
            let width = control.intrinsicContentSize.width
            control.frame = NSRect(x: x, y: 0, width: width, height: 30)
            x += width + 3
        }
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        guard let control = controls.first(where: {
            !$0.isHidden && $0.frame.contains(point)
        }) else { return }
        guard let action = control.action else { return }
        NativeLog.info("settings control tapped \(sectionTitle)")
        NSApp.sendAction(action, to: control.target, from: control)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 5.8, weight: .bold),
            .foregroundColor: NSColor(white: 0.68, alpha: 1),
        ]
        let string = sectionTitle as NSString
        let size = string.size(withAttributes: attributes)
        string.draw(
            at: NSPoint(
                x: floor((sectionTitleWidth - size.width) / 2),
                y: floor((bounds.height - size.height) / 2)
            ),
            withAttributes: attributes
        )
    }
}

private final class TouchBarScrollView: NSScrollView {
    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        guard let documentView else { return }
        let point = documentView.convert(event.locationInWindow, from: nil)
        guard let button = deepestButton(in: documentView, at: point),
              let action = button.action else { return }
        NativeLog.info("touch dispatch (button.identifier?.rawValue ?? \"button\")")
        NSApp.sendAction(action, to: button.target, from: button)
    }

    private func deepestButton(in root: NSView, at point: NSPoint) -> NSButton? {
        var match: NSButton?
        var matchArea = CGFloat.greatestFiniteMagnitude
        func visit(_ view: NSView) {
            guard !view.isHidden, view.alphaValue > 0 else { return }
            if let button = view as? NSButton, button.isEnabled {
                let frame = button.convert(button.bounds, to: root)
                if frame.contains(point), frame.width * frame.height < matchArea {
                    match = button
                    matchArea = frame.width * frame.height
                }
            }
            for child in view.subviews { visit(child) }
        }
        visit(root)
        return match
    }

    func scrollPage(_ direction: Int) {
        let distance = max(contentView.bounds.width * 0.72, 140)
        scrollHorizontally(by: CGFloat(direction) * distance)
    }

    override func scrollWheel(with event: NSEvent) {
        let horizontal = abs(event.scrollingDeltaX) >= abs(event.scrollingDeltaY)
            ? event.scrollingDeltaX
            : event.scrollingDeltaY
        guard horizontal != 0 else {
            super.scrollWheel(with: event)
            return
        }
        scrollHorizontally(by: -horizontal * 2)
    }

    private func scrollHorizontally(by delta: CGFloat) {
        guard let documentView else { return }
        let maximum = max(0, documentView.bounds.width - contentView.bounds.width)
        let target = min(max(0, contentView.bounds.origin.x + delta), maximum)
        contentView.scroll(to: NSPoint(x: target, y: 0))
        reflectScrolledClipView(contentView)
    }
}

private final class AgentStatusPill: NSView {
    private var text = ""
    private var color = NSColor.clear

    func update(text: String, color: NSColor) {
        self.text = text
        self.color = color
        setAccessibilityLabel(text)
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let shape = NSBezierPath(
            roundedRect: bounds.insetBy(dx: 0, dy: 1),
            xRadius: 5,
            yRadius: 5
        )
        color.withAlphaComponent(0.88).setFill()
        shape.fill()

        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 5.8, weight: .bold),
            .foregroundColor: NSColor.white,
        ]
        let string = text as NSString
        let size = string.size(withAttributes: attributes)
        string.draw(
            at: NSPoint(
                x: floor((bounds.width - size.width) / 2),
                y: floor((bounds.height - size.height) / 2)
            ),
            withAttributes: attributes
        )
    }
}

private final class AgentButton: NSButton {
    private let iconView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let statusPill = AgentStatusPill()
    private var grouped = false

    init(target: AnyObject?, action: Selector?) {
        super.init(frame: .zero)
        self.target = target
        self.action = action
        title = ""
        isBordered = false
        wantsLayer = true
        layer?.cornerRadius = 7
        layer?.borderWidth = 1
        layer?.masksToBounds = true

        iconView.imageScaling = .scaleProportionallyDown
        iconView.imageFrameStyle = .none
        iconView.wantsLayer = true
        titleLabel.font = .monospacedSystemFont(ofSize: 9.5, weight: .semibold)
        titleLabel.lineBreakMode = .byTruncatingTail
        for view in [iconView, titleLabel, statusPill] { addSubview(view) }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }

    override var intrinsicContentSize: NSSize { NSSize(width: 150, height: 30) }

    override func layout() {
        super.layout()
        iconView.frame = NSRect(x: 6, y: 3, width: 24, height: 24)
        titleLabel.frame = NSRect(
            x: 34,
            y: 8,
            width: bounds.width - 76,
            height: 14
        )
        statusPill.frame = NSRect(x: bounds.width - 39, y: 6, width: 34, height: 18)
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    func setGrouped(_ value: Bool) {
        grouped = value
        layer?.borderWidth = value ? 0.5 : 1
    }

    func update(entry: AgentEntry, primary: String) {
        let color = StatusPalette.bezel(for: entry.status)
        iconView.image = ProviderIcon.image(for: entry.provider)
        let provider = entry.provider.lowercased()
        let needsLightTile = provider == "cursor" || provider == "acp-cursor"
        iconView.layer?.cornerRadius = 12
        iconView.layer?.masksToBounds = true
        iconView.layer?.backgroundColor = needsLightTile
            ? NSColor.white.cgColor
            : NSColor.clear.cgColor
        iconView.layer?.borderWidth = 0
        titleLabel.stringValue = primary
        titleLabel.textColor = .white
        statusPill.update(
            text: StatusPalette.badge(for: entry.status),
            color: color
        )
        layer?.backgroundColor = NSColor(
            white: grouped ? 0.075 : 0.055,
            alpha: 0.96
        ).cgColor
        layer?.borderColor = color.withAlphaComponent(
            grouped ? 0.35 : 0.82
        ).cgColor
        setAccessibilityLabel("\(entry.title), \(entry.project), \(entry.status.rawValue)")
        needsLayout = true
    }
}

struct TouchBarMenuState {
    let layout: String
    let showUsage: Bool
    let showHostMonitor: Bool
    let providerVisibility: [String: Bool]
}

final class TouchBarController: NSObject, NSTouchBarDelegate {
    var onSettingsRequested: (() -> Void)?
    private let store = AgentStore()
    private let stripItem = NSCustomTouchBarItem(identifier: .bbStrip)
    private let stripButton = NSButton(title: "", target: nil, action: nil)
    private let panelItem = NSCustomTouchBarItem(identifier: .bbList)
    private let settingsPanelItem = NSCustomTouchBarItem(identifier: .bbSettingsPanel)
    private let settingsItem = NSCustomTouchBarItem(identifier: .bbSettings)
    private let priorityItem = NSCustomTouchBarItem(identifier: .bbPriority)
    private let projectItem = NSCustomTouchBarItem(identifier: .bbProject)
    private let dockItem = NSCustomTouchBarItem(identifier: .bbDock)
    private let carouselItem = NSCustomTouchBarItem(identifier: .bbCarousel)
    private let previousProjectItem = NSCustomTouchBarItem(identifier: .bbPreviousProject)
    private let nextProjectItem = NSCustomTouchBarItem(identifier: .bbNextProject)
    private let usageItem = NSCustomTouchBarItem(identifier: .bbUsage)
    private let hostMonitorItem = NSCustomTouchBarItem(identifier: .bbHostMonitor)
    private let usageToggleItem = NSCustomTouchBarItem(identifier: .bbUsageToggle)
    private let hostToggleItem = NSCustomTouchBarItem(identifier: .bbHostToggle)
    private let codexToggleItem = NSCustomTouchBarItem(identifier: .bbCodexToggle)
    private let claudeToggleItem = NSCustomTouchBarItem(identifier: .bbClaudeToggle)
    private let cursorToggleItem = NSCustomTouchBarItem(identifier: .bbCursorToggle)
    private let closeItem = NSCustomTouchBarItem(identifier: .bbClose)
    private let unreadAlertItem = NSCustomTouchBarItem(identifier: .bbUnreadAlert)
    private let settingsButton = CompactNativeButton(title: "", width: 34)
    private let priorityButton = SettingsControlButton(title: "PRIORITY", width: 52)
    private let projectButton = SettingsControlButton(title: "PROJECT", width: 48)
    private let dockButton = SettingsControlButton(title: "DOCK", width: 36)
    private let carouselButton = SettingsControlButton(title: "CAROUSEL", width: 54)
    private let previousProjectButton = NSButton(title: "‹", target: nil, action: nil)
    private let nextProjectButton = NSButton(title: "›", target: nil, action: nil)
    private let usageIconsView = UsageIconStripView()
    private let hostMonitorButton = CompactNativeButton(title: "", width: 34)
    private let usageToggleButton = SettingsControlButton(title: "SHOW", width: 38)
    private let hostToggleButton = SettingsControlButton(title: "SHOW", width: 38)
    private let codexToggleButton = SettingsControlButton(title: "", width: 25)
    private let claudeToggleButton = SettingsControlButton(title: "", width: 25)
    private let cursorToggleButton = SettingsControlButton(title: "", width: 25)
    private let closeButton = CompactNativeButton(title: "✕", width: 34)
    private let unreadAlertButton = UnreadAlertButton(frame: .zero)
    private var panelTouchBar: NSTouchBar?
    private weak var panelScrollView: TouchBarScrollView?
    private var panelVisible = false
    private var agentButtons: [String: AgentButton] = [:]
    private var onScreenOrder: [String] = []
    private var spinnerTimer: Timer?
    private var unreadFlashTimer: Timer?
    private var unreadAlertVisible = false
    private var unreadAlertOpenedPanel = false
    private var knownUnreadIds = Set<String>()
    private var unreadFlashBright = true
    private var signalSources: [DispatchSourceSignal] = []
    private var tick = 0
    private var configurationVisible = false
    private var hostViewVisible = false
    private var hostMonitorOpenPending = false
    private var showUsage = UserDefaults.standard.object(
        forKey: "BBTouchBarShowUsage"
    ) as? Bool ?? true
    private var showHostMonitor = UserDefaults.standard.object(
        forKey: "BBTouchBarShowHostMonitor"
    ) as? Bool ?? true
    private var usageProviderVisibility: [String: Bool] = [
        "codex": UserDefaults.standard.object(forKey: "BBTouchBarUsageCodex") as? Bool ?? true,
        "claudeCode": UserDefaults.standard.object(forKey: "BBTouchBarUsageClaude") as? Bool ?? true,
        "cursor": UserDefaults.standard.object(forKey: "BBTouchBarUsageCursor") as? Bool ?? true,
    ]
    private var selectedProject = UserDefaults.standard.string(
        forKey: "BBTouchBarSelectedProject"
    )
    private var sortMode: SortMode = {
        let stored = UserDefaults.standard.string(forKey: "BBTouchBarSortMode") ?? ""
        return SortMode(rawValue: stored) ?? .status
    }()

    private static let barHeight: CGFloat = 30

    func menuState() -> TouchBarMenuState {
        TouchBarMenuState(
            layout: sortMode.rawValue,
            showUsage: showUsage,
            showHostMonitor: showHostMonitor,
            providerVisibility: usageProviderVisibility
        )
    }

    func openFromMenu() {
        if !panelVisible { openPanel() }
    }

    func refreshFromMenu() {
        if panelVisible { closePanel(teardown: true) }
        openPanel()
    }

    func selectLayoutFromMenu(_ rawValue: String) {
        guard let mode = SortMode(rawValue: rawValue) else { return }
        selectSortMode(mode)
    }

    func setUsageVisibilityFromMenu(_ visible: Bool) {
        showUsage = visible
        UserDefaults.standard.set(visible, forKey: "BBTouchBarShowUsage")
        refreshAccessoryLayout()
        schedulePanelRender()
    }

    func setHostVisibilityFromMenu(_ visible: Bool) {
        showHostMonitor = visible
        if !visible { hostViewVisible = false }
        UserDefaults.standard.set(visible, forKey: "BBTouchBarShowHostMonitor")
        refreshAccessoryLayout()
        schedulePanelRender()
    }

    func setProviderVisibilityFromMenu(_ id: String, visible: Bool) {
        let keys = [
            "codex": "BBTouchBarUsageCodex",
            "claudeCode": "BBTouchBarUsageClaude",
            "cursor": "BBTouchBarUsageCursor",
        ]
        guard let defaultsKey = keys[id] else { return }
        usageProviderVisibility[id] = visible
        UserDefaults.standard.set(visible, forKey: defaultsKey)
        updateControlColors()
        updateAccessoryButtons(store.snapshot)
        schedulePanelRender()
    }

    private func refreshAccessoryLayout() {
        updateControlColors()
        updateAccessoryButtons(store.snapshot)
        panelTouchBar?.defaultItemIdentifiers = panelIdentifiers()
    }

    func install() {
        stripButton.target = self
        stripButton.action = #selector(openPanel)
        stripButton.font = .monospacedDigitSystemFont(ofSize: 14, weight: .semibold)
        stripButton.setAccessibilityLabel("BB agents")
        stripButton.frame = NSRect(x: 0, y: 0, width: 88, height: Self.barHeight)
        stripItem.view = stripButton
        configurePanelControls()

        DFRSystemModalShowsCloseBoxWhenFrontMost(false)
        NSTouchBarItem.addSystemTrayItem(stripItem)
        assertStripPresence()

        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didWakeNotification,
                     NSWorkspace.screensDidWakeNotification,
                     NSWorkspace.sessionDidBecomeActiveNotification] {
            center.addObserver(self, selector: #selector(recoverAfterWake), name: name, object: nil)
        }
        installSignalHandlers()
        store.onChange = { [weak self] snapshot in self?.apply(snapshot) }
        store.start()
        apply(store.snapshot)
        NativeLog.info("native Control Strip item installed")
    }

    private func configurePanelControls() {
        settingsButton.target = self
        settingsButton.action = #selector(settingsTapped(_:))
        settingsButton.bezelColor = NSColor(white: 0.18, alpha: 1)
        settingsButton.setAccessibilityLabel("BB Touch Bar settings")
        if let image = NSImage(
            systemSymbolName: "slider.horizontal.3",
            accessibilityDescription: "BB Touch Bar settings"
        ) {
            settingsButton.image = image
            settingsButton.imagePosition = .imageOnly
            settingsButton.imageScaling = .scaleProportionallyDown
            settingsButton.contentTintColor = .white
        } else {
            settingsButton.title = "CFG"
        }

        priorityButton.target = self
        priorityButton.action = #selector(priorityTapped(_:))
        priorityButton.font = .monospacedSystemFont(ofSize: 5.8, weight: .bold)
        projectButton.target = self
        projectButton.action = #selector(projectTapped(_:))
        projectButton.font = .monospacedSystemFont(ofSize: 5.8, weight: .bold)
        dockButton.target = self
        dockButton.action = #selector(dockTapped(_:))
        dockButton.font = .monospacedSystemFont(ofSize: 5.8, weight: .bold)
        carouselButton.target = self
        carouselButton.action = #selector(carouselTapped(_:))
        carouselButton.font = .monospacedSystemFont(ofSize: 5.8, weight: .bold)
        previousProjectButton.target = self
        previousProjectButton.action = #selector(previousProjectTapped(_:))
        previousProjectButton.font = .systemFont(ofSize: 17, weight: .bold)
        nextProjectButton.target = self
        nextProjectButton.action = #selector(nextProjectTapped(_:))
        nextProjectButton.font = .systemFont(ofSize: 17, weight: .bold)
        hostMonitorButton.target = self
        hostMonitorButton.action = #selector(hostMonitorTapped(_:))
        hostMonitorButton.setAccessibilityLabel("Show Host Monitor metrics")
        if let image = NSImage(
            systemSymbolName: "desktopcomputer",
            accessibilityDescription: "Host Monitor"
        ) {
            hostMonitorButton.image = image
            hostMonitorButton.imagePosition = .imageOnly
            hostMonitorButton.imageScaling = .scaleProportionallyDown
            hostMonitorButton.contentTintColor = .white
        } else {
            hostMonitorButton.title = "▣"
        }
        for button in [
            usageToggleButton, hostToggleButton, codexToggleButton,
            claudeToggleButton, cursorToggleButton,
        ] {
            button.font = .monospacedSystemFont(ofSize: 5.8, weight: .bold)
        }
        usageToggleButton.target = self
        usageToggleButton.action = #selector(usageVisibilityTapped(_:))
        hostToggleButton.target = self
        hostToggleButton.action = #selector(hostVisibilityTapped(_:))
        codexToggleButton.target = self
        codexToggleButton.action = #selector(codexVisibilityTapped(_:))
        claudeToggleButton.target = self
        claudeToggleButton.action = #selector(claudeVisibilityTapped(_:))
        cursorToggleButton.target = self
        cursorToggleButton.action = #selector(cursorVisibilityTapped(_:))
        codexToggleButton.image = ProviderIcon.image(for: "codex")
        claudeToggleButton.image = ProviderIcon.image(for: "claude-code")
        cursorToggleButton.image = ProviderIcon.image(for: "cursor")
        for button in [codexToggleButton, claudeToggleButton, cursorToggleButton] {
            button.imagePosition = .imageOnly
            button.imageScaling = .scaleProportionallyDown
        }
        closeButton.target = self
        closeButton.action = #selector(closeTapped(_:))
        closeButton.bezelColor = NSColor(white: 0.18, alpha: 1)
        closeButton.setAccessibilityLabel("Quit BB Touch Bar")
        unreadAlertButton.target = self
        unreadAlertButton.action = #selector(unreadAlertTapped(_:))

        settingsItem.view = settingsButton
        previousProjectItem.view = previousProjectButton
        nextProjectItem.view = nextProjectButton
        usageItem.view = usageIconsView
        hostMonitorItem.view = hostMonitorButton
        closeItem.view = closeButton
        unreadAlertItem.view = unreadAlertButton
        updateControlColors()
    }

    private func updateControlColors() {
        previousProjectButton.setAccessibilityLabel(
            sortMode == .carousel ? "Previous project" : "Scroll left"
        )
        nextProjectButton.setAccessibilityLabel(
            sortMode == .carousel ? "Next project" : "Scroll right"
        )
        settingsButton.bezelColor = configurationVisible
            ? .systemIndigo
            : NSColor(white: 0.18, alpha: 1)
        priorityButton.bezelColor = sortMode == .status
            ? .systemBlue
            : NSColor(white: 0.18, alpha: 1)
        projectButton.bezelColor = sortMode == .project
            ? .systemOrange
            : NSColor(white: 0.18, alpha: 1)
        dockButton.bezelColor = sortMode == .dock
            ? .systemTeal
            : NSColor(white: 0.18, alpha: 1)
        carouselButton.bezelColor = sortMode == .carousel
            ? .systemPurple
            : NSColor(white: 0.18, alpha: 1)
        usageToggleButton.title = showUsage ? "ON" : "OFF"
        usageToggleButton.bezelColor = showUsage ? .systemBlue : NSColor(white: 0.18, alpha: 1)
        hostToggleButton.title = showHostMonitor ? "ON" : "OFF"
        hostToggleButton.bezelColor = showHostMonitor ? .systemGreen : NSColor(white: 0.18, alpha: 1)
        codexToggleButton.bezelColor = usageProviderVisibility["codex"] == true
            ? .systemBlue : NSColor(white: 0.18, alpha: 1)
        claudeToggleButton.bezelColor = usageProviderVisibility["claudeCode"] == true
            ? .systemOrange : NSColor(white: 0.18, alpha: 1)
        cursorToggleButton.bezelColor = usageProviderVisibility["cursor"] == true
            ? .systemPurple : NSColor(white: 0.18, alpha: 1)
        hostMonitorButton.bezelColor = hostViewVisible
            ? .systemGreen : NSColor(white: 0.18, alpha: 1)
    }

    func uninstall() {
        closePanel(teardown: true)
        spinnerTimer?.invalidate()
        spinnerTimer = nil
        stopUnreadFlash()
        store.stop()
        NSWorkspace.shared.notificationCenter.removeObserver(self)
        DFRElementSetControlStripPresenceForIdentifier(.bbStrip, false)
        NSTouchBarItem.removeSystemTrayItem(stripItem)
        NativeLog.info("native Control Strip item removed")
    }

    @objc private func assertStripPresence() {
        DFRElementSetControlStripPresenceForIdentifier(.bbStrip, true)
    }

    @objc private func recoverAfterWake() {
        assertStripPresence()
        store.refreshAfterWake()
    }

    private func installSignalHandlers() {
        for (sig, opens) in [(SIGUSR1, true), (SIGUSR2, false)] {
            signal(sig, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            source.setEventHandler { [weak self] in
                guard let self else { return }
                opens ? self.stripButton.performClick(nil) : self.closePanel()
            }
            source.resume()
            signalSources.append(source)
        }
    }

    private func apply(_ snapshot: AgentSnapshot) {
        syncUnreadAlert(snapshot)
        renderStrip(snapshot)
        updateAccessoryButtons(snapshot)
        if panelVisible, !unreadAlertVisible {
            if !configurationVisible,
               !hostViewVisible,
               snapshot.connected,
               organized(snapshot.agents).map(\.id) == onScreenOrder,
               !snapshot.agents.isEmpty {
                for entry in snapshot.agents { repaint(entry) }
            } else {
                renderPanel(snapshot)
            }
        }
        syncSpinner(snapshot)
    }

    private func syncUnreadAlert(_ snapshot: AgentSnapshot) {
        let unreadIds = Set(
            snapshot.agents.lazy.filter { $0.status == .done }.map(\.id)
        )
        let newUnreadIds = unreadIds.subtracting(knownUnreadIds)
        knownUnreadIds = unreadIds

        if !newUnreadIds.isEmpty {
            presentUnreadAlert(count: unreadIds.count)
        } else if unreadAlertVisible, unreadIds.isEmpty {
            dismissUnreadAlert(showThreads: false)
        } else if unreadAlertVisible {
            unreadAlertButton.update(count: unreadIds.count)
        }
    }

    private func presentUnreadAlert(count: Int) {
        let wasPanelVisible = panelVisible
        if !panelVisible { openPanel() }
        guard let bar = panelTouchBar else { return }
        if !unreadAlertVisible { unreadAlertOpenedPanel = !wasPanelVisible }
        unreadAlertVisible = true
        unreadAlertButton.update(count: count)
        bar.defaultItemIdentifiers = [.bbUnreadAlert]
        startUnreadFlash()
        NativeLog.info("presented unread completion alert for \(count) agent(s)")
    }

    private func startUnreadFlash() {
        stopUnreadFlash()
        unreadFlashBright = true
        unreadAlertButton.setPulse(bright: true)
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else {
            return
        }
        let timer = Timer(timeInterval: 0.55, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.unreadFlashBright.toggle()
            self.unreadAlertButton.setPulse(bright: self.unreadFlashBright)
        }
        RunLoop.main.add(timer, forMode: .common)
        unreadFlashTimer = timer
    }

    private func stopUnreadFlash() {
        unreadFlashTimer?.invalidate()
        unreadFlashTimer = nil
        unreadFlashBright = true
        unreadAlertButton.setPulse(bright: true)
    }

    private func dismissUnreadAlert(showThreads: Bool) {
        guard unreadAlertVisible else { return }
        let shouldCloseAutomaticPanel = unreadAlertOpenedPanel && !showThreads
        unreadAlertVisible = false
        unreadAlertOpenedPanel = false
        stopUnreadFlash()
        if shouldCloseAutomaticPanel {
            closePanel()
            return
        }
        guard panelVisible else { return }
        if showThreads {
            configurationVisible = false
            hostViewVisible = false
        }
        panelTouchBar?.defaultItemIdentifiers = panelIdentifiers()
        renderPanel(store.snapshot)
    }

    private func updateAccessoryButtons(_ snapshot: AgentSnapshot) {
        usageIconsView.update(
            entries: snapshot.usage,
            visibility: usageProviderVisibility
        )
        let connected = snapshot.hosts.filter { $0.status == "connected" }.count
        hostMonitorButton.setAccessibilityLabel(
            snapshot.hosts.isEmpty
                ? "Host Monitor, metrics loading"
                : "Host Monitor, \(connected) of \(snapshot.hosts.count) hosts connected"
        )
    }

    private func syncSpinner(_ snapshot: AgentSnapshot) {
        if snapshot.working > 0, spinnerTimer == nil {
            let timer = Timer(timeInterval: Spinner.interval, repeats: true) { [weak self] _ in
                self?.advanceSpinner()
            }
            RunLoop.main.add(timer, forMode: .common)
            spinnerTimer = timer
        } else if snapshot.working == 0, let timer = spinnerTimer {
            timer.invalidate()
            spinnerTimer = nil
        }
    }

    private func advanceSpinner() {
        tick &+= 1
        renderStrip(store.snapshot)
        if panelVisible {
            for entry in store.snapshot.agents where entry.status.isBusy { repaint(entry) }
        }
    }

    private func renderStrip(_ snapshot: AgentSnapshot) {
        guard snapshot.connected else {
            stripButton.attributedTitle = attributed("⃠ BB", color: .white)
            stripButton.bezelColor = .systemRed
            return
        }
        let spin = Spinner.frame(tick)
        let text: String
        let color: NSColor
        if snapshot.errors > 0 {
            text = "✕ \(snapshot.errors)"
            color = StatusPalette.bezel(for: .error)
        } else if snapshot.blocked > 0 && snapshot.working > 0 {
            text = "⏸\(snapshot.blocked) \(spin)\(snapshot.working)"
            color = StatusPalette.bezel(for: .blocked)
        } else if snapshot.blocked > 0 {
            text = "⏸ \(snapshot.blocked)"
            color = StatusPalette.bezel(for: .blocked)
        } else if snapshot.working > 0 {
            text = "\(spin) \(snapshot.working)"
            color = StatusPalette.bezel(for: .working)
        } else if snapshot.done > 0 {
            text = "✓ \(snapshot.done)"
            color = StatusPalette.bezel(for: .done)
        } else {
            text = "⠿ \(snapshot.agents.count)"
            color = NSColor(white: 0.22, alpha: 1)
        }
        stripButton.attributedTitle = attributed(text, color: .white)
        stripButton.bezelColor = color
    }

    @objc private func openPanel() {
        let bar = NSTouchBar()
        bar.delegate = self
        bar.defaultItemIdentifiers = panelIdentifiers()
        panelTouchBar = bar
        panelVisible = true
        onScreenOrder = []
        renderPanel(store.snapshot)
        NSTouchBar.presentSystemModalTouchBar(
            bar,
            placement: 1,
            systemTrayItemIdentifier: .bbStrip
        )
        assertStripPresence()
    }

    private func panelIdentifiers() -> [NSTouchBarItem.Identifier] {
        var identifiers: [NSTouchBarItem.Identifier] = [
            configurationVisible ? .bbSettingsPanel : .bbList,
        ]
        identifiers.append(.flexibleSpace)
        if !configurationVisible {
            if showUsage { identifiers.append(.bbUsage) }
            if showHostMonitor { identifiers.append(.bbHostMonitor) }
        }
        identifiers.append(contentsOf: [.bbSettings, .bbClose])
        return identifiers
    }

    private func closePanel(teardown: Bool = false) {
        unreadAlertVisible = false
        unreadAlertOpenedPanel = false
        stopUnreadFlash()
        panelVisible = false
        agentButtons.removeAll()
        onScreenOrder = []
        if let bar = panelTouchBar {
            if teardown {
                NSTouchBar.dismissSystemModalTouchBar(bar)
            } else {
                NSTouchBar.minimizeSystemModalTouchBar(bar)
            }
            panelTouchBar = nil
        }
        assertStripPresence()
    }

    @objc private func closeTapped(_ sender: NSButton) {
        NativeLog.info("close control tapped; quitting app")
        NSApp.terminate(nil)
    }

    @objc private func unreadAlertTapped(_ sender: NSButton) {
        NativeLog.info("unread completion alert acknowledged")
        dismissUnreadAlert(showThreads: true)
    }

    @objc private func settingsTapped(_ sender: NSButton) {
        configurationVisible.toggle()
        updateControlColors()
        panelTouchBar?.defaultItemIdentifiers = panelIdentifiers()
        schedulePanelRender()
        NativeLog.info("inline settings \(configurationVisible ? "opened" : "closed")")
    }

    @objc private func priorityTapped(_ sender: NSButton) {
        selectSortMode(.status)
    }

    @objc private func projectTapped(_ sender: NSButton) {
        selectSortMode(.project)
    }

    @objc private func dockTapped(_ sender: NSButton) {
        selectSortMode(.dock)
    }

    @objc private func carouselTapped(_ sender: NSButton) {
        selectSortMode(.carousel)
    }

    @objc private func hostMonitorTapped(_ sender: NSButton) {
        hostViewVisible.toggle()
        updateControlColors()
        schedulePanelRender()
    }

    @objc private func hostTapped(_ sender: NSButton) {
        guard !hostMonitorOpenPending,
              let hostId = sender.identifier?.rawValue,
              store.snapshot.hosts.contains(where: { $0.id == hostId }) else { return }
        hostMonitorOpenPending = true
        AgentStore.openHostMonitor(hostId: hostId) { [weak self] opened in
            guard let self else { return }
            self.hostMonitorOpenPending = false
            if opened {
                NativeLog.info("opened host \(hostId) in BB Host Monitor")
                self.closePanel()
                return
            }
            NativeLog.error("Host Monitor could not open host \(hostId)")
        }
    }

    @objc private func usageVisibilityTapped(_ sender: NSButton) {
        setUsageVisibilityFromMenu(!showUsage)
    }

    @objc private func hostVisibilityTapped(_ sender: NSButton) {
        setHostVisibilityFromMenu(!showHostMonitor)
    }

    @objc private func codexVisibilityTapped(_ sender: NSButton) {
        toggleUsageProvider("codex")
    }

    @objc private func claudeVisibilityTapped(_ sender: NSButton) {
        toggleUsageProvider("claudeCode")
    }

    @objc private func cursorVisibilityTapped(_ sender: NSButton) {
        toggleUsageProvider("cursor")
    }

    private func toggleUsageProvider(_ id: String) {
        let next = usageProviderVisibility[id] != true
        setProviderVisibilityFromMenu(id, visible: next)
    }

    @objc private func previousProjectTapped(_ sender: NSButton) {
        if sortMode == .carousel { moveProject(by: -1) }
        else { panelScrollView?.scrollPage(-1) }
    }

    @objc private func nextProjectTapped(_ sender: NSButton) {
        if sortMode == .carousel { moveProject(by: 1) }
        else { panelScrollView?.scrollPage(1) }
    }

    @objc private func projectDockTapped(_ sender: NSButton) {
        guard let project = sender.identifier?.rawValue else { return }
        selectedProject = project
        UserDefaults.standard.set(project, forKey: "BBTouchBarSelectedProject")
        schedulePanelRender()
    }

    private func moveProject(by offset: Int) {
        let projects = orderedProjects(in: organized(store.snapshot.agents))
        guard !projects.isEmpty else { return }
        let current = selectedProject.flatMap { projects.firstIndex(of: $0) } ?? 0
        let next = (current + offset + projects.count) % projects.count
        selectedProject = projects[next]
        UserDefaults.standard.set(projects[next], forKey: "BBTouchBarSelectedProject")
        schedulePanelRender()
    }

    private func selectSortMode(_ mode: SortMode) {
        sortMode = mode
        hostViewVisible = false
        configurationVisible = false
        UserDefaults.standard.set(sortMode.rawValue, forKey: "BBTouchBarSortMode")
        updateControlColors()
        panelTouchBar?.defaultItemIdentifiers = panelIdentifiers()
        schedulePanelRender()
    }

    private func schedulePanelRender() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.panelVisible else { return }
            self.renderPanel(self.store.snapshot)
        }
    }

    @objc private func agentTapped(_ sender: NSButton) {
        guard let id = sender.identifier?.rawValue,
              let entry = store.snapshot.agents.first(where: { $0.id == id }) else { return }
        AgentStore.focus(entry)
    }

    func touchBar(
        _ touchBar: NSTouchBar,
        makeItemForIdentifier identifier: NSTouchBarItem.Identifier
    ) -> NSTouchBarItem? {
        switch identifier {
        case .bbList: return panelItem
        case .bbSettingsPanel: return settingsPanelItem
        case .bbSettings: return settingsItem
        case .bbPriority: return priorityItem
        case .bbProject: return projectItem
        case .bbDock: return dockItem
        case .bbCarousel: return carouselItem
        case .bbPreviousProject: return previousProjectItem
        case .bbNextProject: return nextProjectItem
        case .bbUsage: return usageItem
        case .bbHostMonitor: return hostMonitorItem
        case .bbUsageToggle: return usageToggleItem
        case .bbHostToggle: return hostToggleItem
        case .bbCodexToggle: return codexToggleItem
        case .bbClaudeToggle: return claudeToggleItem
        case .bbCursorToggle: return cursorToggleItem
        case .bbClose: return closeItem
        case .bbUnreadAlert: return unreadAlertItem
        default: return nil
        }
    }

    private func renderPanel(_ snapshot: AgentSnapshot) {
        agentButtons.removeAll()
        let entries = organized(snapshot.agents)
        onScreenOrder = entries.map(\.id)

        if configurationVisible {
            settingsPanelItem.view = scrollContainer(settingsGroups())
            return
        }

        if hostViewVisible {
            let views: [NSView] = snapshot.hosts.isEmpty
                ? [message("Host metrics are loading…")]
                : snapshot.hosts.map {
                    HostMetricView(
                        entry: $0,
                        target: self,
                        action: #selector(hostTapped(_:))
                    )
                }
            panelItem.view = scrollContainer(views)
            return
        }

        var views: [NSView] = []
        if entries.isEmpty {
            views.append(message(snapshot.connected ? "No BB threads" : "BB is offline"))
        } else {
            if !snapshot.connected {
                views.append(message("Reconnecting…"))
            }
            if sortMode == .status {
                views.append(contentsOf: entries.map { button(for: $0) })
            } else if sortMode == .project {
                views.append(contentsOf: projectGroups(for: entries))
            } else if let project = resolvedProject(in: entries) {
                let projectEntries = entries.filter { $0.project == project }
                if sortMode == .dock {
                    for name in orderedProjects(in: entries) {
                        guard let first = entries.first(where: { $0.project == name }) else {
                            continue
                        }
                        let badge = GroupDividerView(
                            status: first.status,
                            project: name,
                            count: entries.filter { $0.project == name }.count,
                            projectFirst: true,
                            threadId: name,
                            target: self,
                            action: #selector(projectDockTapped(_:))
                        )
                        badge.setSelected(name == project)
                        views.append(badge)
                    }
                } else if let first = projectEntries.first {
                    let badge = GroupDividerView(
                        status: first.status,
                        project: project,
                        count: projectEntries.count,
                        projectFirst: true,
                        threadId: first.id,
                        target: self,
                        action: #selector(agentTapped(_:))
                    )
                    badge.setSelected(true)
                    views.append(badge)
                }
                views.append(contentsOf: projectEntries.map { button(for: $0) })
            }
        }
        panelItem.view = scrollContainer(views)
    }

    private func settingsGroups() -> [NSView] {
        let priority = settingControl(
            title: "PRIORITY", width: 58,
            action: #selector(priorityTapped(_:)),
            selected: sortMode == .status, color: .systemBlue
        )
        let project = settingControl(
            title: "PROJECT", width: 54,
            action: #selector(projectTapped(_:)),
            selected: sortMode == .project, color: .systemOrange
        )
        let dock = settingControl(
            title: "DOCK", width: 42,
            action: #selector(dockTapped(_:)),
            selected: sortMode == .dock, color: .systemTeal
        )
        let carousel = settingControl(
            title: "CAROUSEL", width: 60,
            action: #selector(carouselTapped(_:)),
            selected: sortMode == .carousel, color: .systemPurple
        )
        let usage = settingControl(
            title: showUsage ? "ON" : "OFF", width: 42,
            action: #selector(usageVisibilityTapped(_:)),
            selected: showUsage, color: .systemBlue
        )
        let codex = providerSettingControl(
            provider: "codex", action: #selector(codexVisibilityTapped(_:)),
            selected: usageProviderVisibility["codex"] == true,
            color: .systemBlue
        )
        let claude = providerSettingControl(
            provider: "claude-code", action: #selector(claudeVisibilityTapped(_:)),
            selected: usageProviderVisibility["claudeCode"] == true,
            color: .systemOrange
        )
        let cursor = providerSettingControl(
            provider: "cursor", action: #selector(cursorVisibilityTapped(_:)),
            selected: usageProviderVisibility["cursor"] == true,
            color: .systemPurple
        )
        let host = settingControl(
            title: showHostMonitor ? "ON" : "OFF", width: 42,
            action: #selector(hostVisibilityTapped(_:)),
            selected: showHostMonitor, color: .systemGreen
        )
        return [
            SettingsGroupView(
                title: "FILTERS",
                controls: [priority, project, dock, carousel]
            ),
            SettingsGroupView(
                title: "SUBSCRIPTIONS",
                controls: [usage, codex, claude, cursor]
            ),
            SettingsGroupView(
                title: "HOST MONITOR",
                controls: [host]
            ),
        ]
    }

    private func settingControl(
        title: String,
        width: CGFloat,
        action: Selector,
        selected: Bool,
        color: NSColor
    ) -> SettingsControlButton {
        let button = SettingsControlButton(title: title, width: width)
        button.target = self
        button.action = action
        button.font = .monospacedSystemFont(ofSize: 6.8, weight: .bold)
        button.bezelColor = selected
            ? color
            : NSColor(white: 0.18, alpha: 1)
        return button
    }

    private func providerSettingControl(
        provider: String,
        action: Selector,
        selected: Bool,
        color: NSColor
    ) -> SettingsControlButton {
        let button = settingControl(
            title: "", width: 44, action: action,
            selected: selected, color: color
        )
        button.image = ProviderIcon.image(for: provider)
        button.imagePosition = .imageOnly
        button.imageScaling = .scaleProportionallyDown
        button.drawsLightImageTile = provider == "cursor"
        return button
    }

    private func projectGroups(for entries: [AgentEntry]) -> [NSView] {
        var groups: [NSView] = []
        var index = 0
        while index < entries.count {
            let first = entries[index]
            var end = index + 1
            while end < entries.count && entries[end].project == first.project {
                end += 1
            }
            let projectEntries = Array(entries[index..<end])
            var nested: [NSView] = [GroupDividerView(
                status: first.status,
                project: first.project,
                count: projectEntries.count,
                projectFirst: true,
                threadId: first.id,
                target: self,
                action: #selector(agentTapped(_:))
            )]
            nested.append(contentsOf: projectEntries.map {
                button(for: $0, grouped: true)
            })
            groups.append(ProjectGroupView(views: nested))
            index = end
        }
        return groups
    }

    private func message(_ text: String) -> NSView {
        let label = NSTextField(labelWithString: text)
        label.font = .systemFont(ofSize: 14)
        label.textColor = NSColor(white: 0.62, alpha: 1)
        return label
    }

    private func button(for entry: AgentEntry, grouped: Bool = false) -> NSButton {
        let button = AgentButton(target: self, action: #selector(agentTapped(_:)))
        button.identifier = NSUserInterfaceItemIdentifier(entry.id)
        button.frame.size = NSSize(width: 150, height: Self.barHeight)
        button.setGrouped(grouped)
        agentButtons[entry.id] = button
        paint(button, entry)
        return button
    }

    private func organized(_ entries: [AgentEntry]) -> [AgentEntry] {
        let rank: [AgentStatus: Int] = [
            .error: 0, .blocked: 1, .done: 2, .working: 3,
            .waiting: 4, .idle: 5, .unknown: 6,
        ]
        return entries.sorted {
            let left = rank[$0.status, default: 6]
            let right = rank[$1.status, default: 6]
            let projectOrder = $0.project.localizedCaseInsensitiveCompare($1.project)
            if sortMode == .project || sortMode == .dock || sortMode == .carousel {
                if projectOrder != .orderedSame { return projectOrder == .orderedAscending }
                if left != right { return left < right }
            } else {
                if left != right { return left < right }
            }
            return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
        }
    }

    private func orderedProjects(in entries: [AgentEntry]) -> [String] {
        var seen = Set<String>()
        return entries.compactMap { entry in
            seen.insert(entry.project).inserted ? entry.project : nil
        }
    }

    private func resolvedProject(in entries: [AgentEntry]) -> String? {
        let projects = orderedProjects(in: entries)
        guard !projects.isEmpty else { return nil }
        if let selectedProject, projects.contains(selectedProject) {
            return selectedProject
        }
        selectedProject = projects[0]
        UserDefaults.standard.set(projects[0], forKey: "BBTouchBarSelectedProject")
        return projects[0]
    }

    private func repaint(_ entry: AgentEntry) {
        guard let button = agentButtons[entry.id] else { return }
        paint(button, entry)
    }

    private func paint(_ button: AgentButton, _ entry: AgentEntry) {
        let prefix: String
        switch entry.status {
        case .working: prefix = Spinner.frame(tick) + " "
        case .blocked: prefix = "⏸ "
        case .error: prefix = "✕ "
        case .done: prefix = ""
        case .waiting: prefix = "↻ "
        case .idle, .unknown: prefix = ""
        }
        button.update(entry: entry, primary: prefix + entry.title)
    }

    private func attributed(_ text: String, color: NSColor) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .foregroundColor: color,
            .font: NSFont.monospacedDigitSystemFont(ofSize: 14, weight: .medium),
        ])
    }

    private func scrollContainer(_ views: [NSView]) -> NSView {
        let stack = NSStackView(views: views)
        stack.orientation = .horizontal
        stack.spacing = 5
        stack.alignment = .centerY
        stack.translatesAutoresizingMaskIntoConstraints = true

        let fitting = stack.fittingSize
        let visible = min(max(fitting.width, 100), 850)
        stack.frame = NSRect(
            x: 0,
            y: 0,
            width: max(fitting.width, visible),
            height: Self.barHeight
        )

        let scroll = TouchBarScrollView(frame: NSRect(
            x: 0,
            y: 0,
            width: visible,
            height: Self.barHeight
        ))
        scroll.drawsBackground = false
        scroll.hasHorizontalScroller = false
        scroll.hasVerticalScroller = false
        scroll.horizontalScrollElasticity = .allowed
        scroll.verticalScrollElasticity = .none
        scroll.documentView = stack
        panelScrollView = scroll
        return scroll
    }
}
