import AppKit

private enum LoginStartup {
    private static var launchAgents: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents", isDirectory: true)
    }

    static var plist: URL {
        launchAgents.appendingPathComponent("app.getbb.touchbar.native.plist")
    }

    static var isEnabled: Bool {
        FileManager.default.fileExists(atPath: plist.path)
    }

    static func setEnabled(_ enabled: Bool) throws {
        if !enabled {
            if isEnabled { try FileManager.default.removeItem(at: plist) }
            return
        }
        guard let executable = Bundle.main.executableURL else {
            throw CocoaError(.fileNoSuchFile)
        }
        try FileManager.default.createDirectory(
            at: launchAgents,
            withIntermediateDirectories: true
        )
        let payload: [String: Any] = [
            "Label": "app.getbb.touchbar.native",
            "ProgramArguments": [executable.path],
            "RunAtLoad": true,
            "ProcessType": "Interactive",
        ]
        let data = try PropertyListSerialization.data(
            fromPropertyList: payload,
            format: .xml,
            options: 0
        )
        try data.write(to: plist, options: .atomic)
    }
}

final class MenuBarController: NSObject, NSMenuDelegate {
    private let touchBarController: TouchBarController
    private let statusItem: NSStatusItem
    private let menu = NSMenu()

    init(touchBarController: TouchBarController) {
        self.touchBarController = touchBarController
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()
        menu.delegate = self
        statusItem.menu = menu
        if let button = statusItem.button {
            let image = NSImage(
                systemSymbolName: "rectangle.and.hand.point.up.left.fill",
                accessibilityDescription: "BB Touch Bar"
            )
            image?.isTemplate = true
            button.image = image
            button.title = image == nil ? "BB" : ""
            button.setAccessibilityLabel("BB Touch Bar settings")
        }
        rebuildMenu()
    }

    deinit {
        NSStatusBar.system.removeStatusItem(statusItem)
    }

    func showMenu() {
        rebuildMenu()
        NSApp.activate(ignoringOtherApps: true)
        guard let button = statusItem.button else { return }
        menu.popUp(
            positioning: nil,
            at: NSPoint(x: button.bounds.midX, y: button.bounds.minY),
            in: button
        )
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        rebuildMenu()
    }

    private func rebuildMenu() {
        let state = touchBarController.menuState()
        menu.removeAllItems()
        menu.addItem(item(
            "Open Touch Bar",
            action: #selector(openTouchBar),
            symbol: "rectangle.and.hand.point.up.left.fill"
        ))
        menu.addItem(item(
            "Refresh Touch Bar",
            action: #selector(refreshTouchBar),
            symbol: "arrow.clockwise"
        ))
        let openAtLogin = item(
            "Open at Login",
            action: #selector(toggleOpenAtLogin),
            symbol: "power"
        )
        openAtLogin.state = LoginStartup.isEnabled ? .on : .off
        menu.addItem(openAtLogin)
        menu.addItem(.separator())

        menu.addItem(section("LAYOUT FILTER"))
        for option in [
            ("Priority", "status", "line.3.horizontal.decrease.circle"),
            ("Projects", "project", "square.grid.2x2"),
            ("Dock", "dock", "dock.rectangle"),
            ("Carousel", "carousel", "rectangle.3.group"),
        ] {
            let row = item(option.0, action: #selector(selectLayout), symbol: option.2)
            row.representedObject = option.1
            row.state = state.layout == option.1 ? .on : .off
            menu.addItem(row)
        }
        menu.addItem(.separator())

        menu.addItem(section("SUBSCRIPTIONS"))
        let showUsage = item(
            "Show usage rings",
            action: #selector(toggleUsage),
            symbol: "chart.pie"
        )
        showUsage.state = state.showUsage ? .on : .off
        menu.addItem(showUsage)
        for provider in [
            ("Codex / ChatGPT", "codex", "codex"),
            ("Claude Code", "claudeCode", "claude-code"),
            ("Cursor", "cursor", "cursor"),
            ("DeepSeek", "deepseek", "deepseek"),
        ] {
            let row = item(provider.0, action: #selector(toggleProvider))
            row.representedObject = provider.1
            row.image = ProviderIcon.image(for: provider.2)
            row.state = state.providerVisibility[provider.1] == true ? .on : .off
            row.isEnabled = state.showUsage
            menu.addItem(row)
        }
        menu.addItem(.separator())

        menu.addItem(section("HOST MONITOR"))
        let showHost = item(
            "Show host button",
            action: #selector(toggleHost),
            symbol: "desktopcomputer"
        )
        showHost.state = state.showHostMonitor ? .on : .off
        menu.addItem(showHost)
        menu.addItem(.separator())
        menu.addItem(item("Quit BB Touch Bar", action: #selector(quit), symbol: "power"))
    }

    private func section(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func item(
        _ title: String,
        action: Selector,
        symbol: String? = nil
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        if let symbol {
            item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)
        }
        return item
    }

    @objc private func openTouchBar() {
        touchBarController.openFromMenu()
    }

    @objc private func refreshTouchBar() {
        touchBarController.refreshFromMenu()
    }

    @objc private func selectLayout(_ sender: NSMenuItem) {
        guard let layout = sender.representedObject as? String else { return }
        touchBarController.selectLayoutFromMenu(layout)
    }

    @objc private func toggleUsage() {
        let state = touchBarController.menuState()
        touchBarController.setUsageVisibilityFromMenu(!state.showUsage)
    }

    @objc private func toggleProvider(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        let current = touchBarController.menuState().providerVisibility[id] == true
        touchBarController.setProviderVisibilityFromMenu(id, visible: !current)
    }

    @objc private func toggleHost() {
        let state = touchBarController.menuState()
        touchBarController.setHostVisibilityFromMenu(!state.showHostMonitor)
    }

    @objc private func toggleOpenAtLogin() {
        do {
            try LoginStartup.setEnabled(!LoginStartup.isEnabled)
        } catch {
            NativeLog.error("could not update login startup: \(error.localizedDescription)")
        }
        rebuildMenu()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
