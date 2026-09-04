import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const companion = join(root, "companion");

test("BetterTouchTool preset is global, persistent, bounded, and action-safe", () => {
  const preset = JSON.parse(
    readFileSync(join(companion, "BB-Agent-Monitor.bttpreset"), "utf8"),
  ) as {
    BTTPresetName: string;
    BTTPresetContent: Array<{
      BTTAppBundleIdentifier: string;
      BTTTriggers: Array<{
        BTTTriggerType: number;
        BTTTriggerConfig: Record<string, unknown>;
        BTTActionsToExecute: Array<Record<string, unknown>>;
      }>;
    }>;
  };

  assert.equal(preset.BTTPresetName, "BB Agent Monitor");
  assert.equal(preset.BTTPresetContent.length, 1);
  const global = preset.BTTPresetContent[0]!;
  assert.equal(global.BTTAppBundleIdentifier, "BT.G");
  assert.equal(global.BTTTriggers.length, 4);
  for (const trigger of global.BTTTriggers) {
    assert.equal(trigger.BTTTriggerType, 642);
    assert.equal(trigger.BTTTriggerConfig.BTTTouchBarAlwaysShowButton, 1);
    assert.equal(trigger.BTTTriggerConfig.BTTTouchBarScriptUpdateInterval, 2);
    assert.match(
      String(trigger.BTTTriggerConfig.BTTTouchBarShellScriptString),
      /BBTouchBar\/bb-touchbar" card/u,
    );
    assert.equal(trigger.BTTActionsToExecute.length, 1);
    assert.equal(trigger.BTTActionsToExecute[0]?.BTTPredefinedActionType, 206);
    assert.match(
      String(trigger.BTTActionsToExecute[0]?.BTTShellTaskActionScript),
      /open-card [0-2]/u,
    );
    assert.doesNotMatch(
      String(trigger.BTTActionsToExecute[0]?.BTTShellTaskActionScript),
      /\bstop\b/u,
    );
  }
});

test("companion scripts are POSIX-shell parseable and avoid eval", () => {
  for (const name of ["bb-touchbar.sh", "install.sh"]) {
    const path = join(companion, name);
    execFileSync("/bin/sh", ["-n", path]);
    assert.doesNotMatch(readFileSync(path, "utf8"), /\beval\b/u);
  }
  const installer = readFileSync(join(companion, "install.sh"), "utf8");
  assert.match(installer, /BetterTouchTool\/Plugins/u);
  assert.match(installer, /BBTouchBar\.swift/u);
  assert.match(installer, /Compile & Load/u);
  assert.match(installer, /--preset/u);
});

test("Swift source plugin renders native status cards with safe BB actions", () => {
  const source = readFileSync(join(companion, "BBTouchBar.swift"), "utf8");
  assert.match(source, /BTT-Plugin-Type: TouchBar/u);
  assert.match(source, /BTTPluginInterface/u);
  assert.match(source, /process\.executableURL/u);
  assert.match(source, /process\.arguments = arguments/u);
  assert.match(source, /\["touchbar", "open", threadId\]/u);
  assert.match(source, /Date\(\) < deadline/u);
  assert.match(source, /AgentCardView/u);
  assert.match(source, /BBStripButton/u);
  assert.match(source, /func touchBarButton\(\) -> NSButton\?/u);
  assert.match(source, /func touchBarViewController\(\) -> NSViewController\? \{ nil \}/u);
  assert.match(source, /class func configurationFormItems/u);
  assert.match(source, /\[AnyHashable: Any\]/u);
  assert.match(source, /override func mouseDown/u);
  assert.match(source, /badgeField/u);
  assert.match(source, /accentLayer/u);
  assert.match(source, /BB Agent Monitor/u);
  assert.match(source, /RUN/u);
  assert.match(source, /IDLE/u);
  assert.match(source, /INPUT/u);
  assert.match(source, /Application Support\/BBTouchBar\/bb-path/u);
  assert.match(source, /thread\.providerId\.uppercased\(\)/u);
  assert.doesNotMatch(source, /DFRFoundation|TouchBarServer|\/bin\/(?:ba|z)?sh/u);
});

test("package includes every companion and excludes a frontend entry", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    bb: Record<string, unknown>;
    files: string[];
  };
  assert.equal(manifest.bb.app, undefined);
  assert.ok(manifest.files.includes("companion/"));
  assert.ok(manifest.files.includes("native/"));
  assert.ok(manifest.files.includes("assets/"));
});

test("native app owns the Control Strip and fullscreen panel without physical stop", () => {
  const native = join(root, "native");
  for (const script of [
    "build.sh",
    "install.sh",
    "run.sh",
    "uninstall.sh",
    "package.sh",
    "homebrew-install.sh",
    "homebrew-uninstall.sh",
    "test-homebrew.sh",
  ]) {
    execFileSync("/bin/bash", ["-n", join(native, script)]);
  }

  const header = readFileSync(join(native, "Sources/BBTouchBarPrivate.h"), "utf8");
  const controller = readFileSync(join(native, "Sources/TouchBarController.swift"), "utf8");
  const model = readFileSync(join(native, "Sources/AgentModel.swift"), "utf8");
  const support = readFileSync(join(native, "Sources/Support.swift"), "utf8");
  const menuBar = readFileSync(join(native, "Sources/MenuBarController.swift"), "utf8");
  const main = readFileSync(join(native, "Sources/main.swift"), "utf8");
  const build = readFileSync(join(native, "build.sh"), "utf8");
  const installer = readFileSync(join(native, "install.sh"), "utf8");
  const packager = readFileSync(join(native, "package.sh"), "utf8");
  const brewInstaller = readFileSync(join(native, "homebrew-install.sh"), "utf8");
  const brewUninstaller = readFileSync(join(native, "homebrew-uninstall.sh"), "utf8");
  const cask = readFileSync(
    join(root, "..", "..", "Casks", "bb-touch-bar.rb"),
    "utf8",
  );

  assert.match(header, /addSystemTrayItem/u);
  assert.match(header, /presentSystemModalTouchBar/u);
  assert.match(controller, /DFRElementSetControlStripPresenceForIdentifier/u);
  assert.match(controller, /dismissSystemModalTouchBar/u);
  assert.match(controller, /minimizeSystemModalTouchBar/u);
  assert.doesNotMatch(controller, /SummaryButton|labelWithString: "BB"/u);
  assert.match(controller, /hasHorizontalScroller = false/u);
  assert.match(controller, /GroupDividerView/u);
  assert.match(controller, /projectEntries\.map/u);
  assert.match(controller, /project\.localizedCaseInsensitiveCompare/u);
  assert.doesNotMatch(controller, /detailLabel|ProviderIcon\.label\(for: entry\.provider\)/u);
  assert.match(controller, /ProjectInitialBadge/u);
  assert.match(controller, /case \.done: return "UNREAD"/u);
  assert.match(controller, /enum SortMode/u);
  assert.match(controller, /BBTouchBarSortMode/u);
  assert.match(controller, /settingsTapped/u);
  assert.match(controller, /slider\.horizontal\.3/u);
  assert.match(controller, /schedulePanelRender/u);
  assert.match(controller, /DispatchQueue\.main\.async/u);
  assert.match(controller, /inline settings/u);
  assert.match(controller, /configurationVisible\.toggle\(\)/u);
  assert.match(controller, /providerSettingControl/u);
  assert.match(controller, /controls: \[priority, project, dock, carousel\]/u);
  assert.doesNotMatch(controller, /controls: \[priorityButton, projectButton/u);
  assert.doesNotMatch(controller, /⚙/u);
  assert.match(controller, /priorityTapped/u);
  assert.match(controller, /projectTapped/u);
  assert.match(controller, /dockTapped/u);
  assert.match(controller, /carouselTapped/u);
  assert.match(controller, /previousProjectTapped/u);
  assert.match(controller, /nextProjectTapped/u);
  assert.match(controller, /projectDockTapped/u);
  assert.match(controller, /BBTouchBarSelectedProject/u);
  assert.match(controller, /private final class GroupDividerView: NSButton/u);
  assert.match(controller, /private final class ProjectGroupView: NSView/u);
  assert.match(controller, /projectGroups\(for: entries\)/u);
  assert.match(controller, /button\(for: \$0, grouped: true\)/u);
  assert.match(controller, /threadId: first\.id/u);
  assert.match(controller, /compactWidth/u);
  assert.match(controller, /compactWidth = projectFirst\s*\? 32/su);
  assert.match(controller, /action: #selector\(agentTapped/u);
  assert.match(controller, /bounds\.contains\(point\) \? self : nil/u);
  assert.match(controller, /NSApp\.sendAction\(action, to: target, from: self\)/u);
  assert.match(controller, /close control tapped; quitting app/u);
  assert.match(controller, /closeButton\.setAccessibilityLabel\("Quit BB Touch Bar"\)/u);
  assert.match(
    controller,
    /@objc private func closeTapped[\s\S]*?NSApp\.terminate\(nil\)/u,
  );
  assert.match(controller, /static let bbUnreadAlert/u);
  assert.match(controller, /private final class UnreadAlertView: NSView/u);
  assert.match(controller, /private let button = NSButton\(title: "", target: nil, action: nil\)/u);
  assert.match(controller, /NSSize\(width: 1_000, height: 30\)/u);
  assert.match(controller, /0\.48, blue: 0\.02/u);
  assert.match(controller, /AGENT FINISHED — TAP TO DISMISS/u);
  assert.match(controller, /func syncUnreadAlert/u);
  assert.match(controller, /unreadIds\.subtracting\(knownUnreadIds\)/u);
  assert.match(controller, /bar\.defaultItemIdentifiers = \[\.bbUnreadAlert\]/u);
  assert.match(controller, /Timer\(timeInterval: 0\.55, repeats: true\)/u);
  assert.match(controller, /accessibilityDisplayShouldReduceMotion/u);
  assert.match(controller, /unread alert touch dispatched/u);
  assert.match(controller, /unreadAlertView\.configure/u);
  assert.match(controller, /#selector\(unreadAlertTapped\(_:\)\)/u);
  assert.match(controller, /NSClickGestureRecognizer\(target: target, action: action\)/u);
  assert.match(controller, /recognizer\.allowedTouchTypes = \[\.direct\]/u);
  assert.match(controller, /guard unreadAlertVisible else \{ return \}/u);
  assert.match(controller, /func beginUnreadAlertTransition/u);
  assert.match(controller, /CABasicAnimation\(keyPath: "transform\.scale\.x"\)/u);
  assert.match(controller, /expansion\.fromValue = 0\.06/u);
  assert.match(controller, /CABasicAnimation\(keyPath: "opacity"\)/u);
  assert.match(controller, /entrance\.duration = duration/u);
  assert.match(controller, /CAMediaTimingFunction\(name: \.easeOut\)/u);
  assert.match(controller, /forKey: "unread-center-expansion"/u);
  assert.match(controller, /asyncAfter\(deadline: \.now\(\) \+ duration\)/u);
  assert.match(controller, /dismissUnreadAlert\(showThreads: false\)/u);
  assert.doesNotMatch(controller, /AgentStore\.focus\(firstUnread\)/u);
  assert.match(controller, /case \.bbUnreadAlert: return unreadAlertItem/u);
  assert.match(controller, /projectInitials/u);
  assert.match(controller, /provider == "cursor" \|\| provider == "acp-cursor"/u);
  assert.match(controller, /\.error: 0, \.blocked: 1, \.done: 2, \.working: 3/u);
  assert.match(controller, /static let bbSettings/u);
  assert.match(controller, /static let bbSettingsPanel/u);
  assert.match(controller, /static let bbClose/u);
  assert.match(controller, /static let bbDock/u);
  assert.match(controller, /static let bbProject/u);
  assert.match(controller, /static let bbCarousel/u);
  assert.match(controller, /case \.bbSettings: return settingsItem/u);
  assert.match(controller, /case \.bbSettingsPanel: return settingsPanelItem/u);
  assert.match(controller, /case \.bbClose: return closeItem/u);
  assert.match(controller, /case \.bbDock: return dockItem/u);
  assert.match(controller, /case \.bbProject: return projectItem/u);
  assert.match(controller, /case \.bbCarousel: return carouselItem/u);
  assert.match(controller, /identifiers\.append\(\.flexibleSpace\)/u);
  assert.doesNotMatch(controller, /PanelRootView|CompactControlButton/u);
  assert.match(controller, /compactWidth = projectFirst\s*\? 32/su);
  assert.match(controller, /projectLabel\.frame = \.zero/u);
  assert.match(controller, /NSBezierPath\(roundedRect: bounds/u);
  assert.match(controller, /projectColor/u);
  assert.match(controller, /0xcbf29ce484222325/u);
  assert.match(controller, /projectLabel\.stringValue = projectFirst/u);
  assert.match(controller, /project\.uppercased\(\)/u);
  assert.match(controller, /StatusPalette/u);
  assert.match(model, /\["touchbar", "snapshot"\]/u);
  assert.match(model, /timeout: 5/u);
  assert.match(model, /offlineFailureThreshold = 3/u);
  assert.match(model, /lastGoodSnapshot/u);
  assert.match(model, /stale\.connected = false/u);
  assert.match(model, /func refreshAfterWake\(\)/u);
  assert.match(model, /BBCommand\.cancelPolling\(\)/u);
  assert.match(model, /pollSignal\.wait\(timeout: \.now\(\) \+ 2\)/u);
  assert.match(model, /readabilityHandler/u);
  assert.match(model, /finished\.wait\(timeout: \.now\(\) \+ timeout\)/u);
  assert.doesNotMatch(model, /readDataToEndOfFile/u);
  assert.match(controller, /#selector\(recoverAfterWake\)/u);
  assert.match(controller, /store\.refreshAfterWake\(\)/u);
  assert.match(model, /\["host-monitor", "snapshot"\]/u);
  assert.match(model, /struct UsageEntry/u);
  assert.match(model, /struct HostMetricEntry/u);
  assert.match(model, /attentionThresholdPercent/u);
  assert.match(model, /criticalThresholdPercent/u);
  assert.match(controller, /private final class HostMetricView/u);
  assert.match(controller, /private final class HostMetricCircle/u);
  assert.match(controller, /title: "C"/u);
  assert.match(controller, /title: "R"/u);
  assert.match(controller, /title: "D"/u);
  assert.match(controller, /title: "↓"/u);
  assert.match(controller, /title: "↑"/u);
  assert.match(controller, /entry\.criticalThresholdPercent/u);
  assert.match(controller, /entry\.attentionThresholdPercent/u);
  assert.match(controller, /private final class UsageIconStripView/u);
  assert.match(controller, /private final class UsageRingView: NSView/u);
  assert.match(controller, /private let iconView = NSImageView\(\)/u);
  assert.match(controller, /iconView\.imageScaling = \.scaleProportionallyUpOrDown/u);
  assert.match(controller, /private final class SettingsControlButton/u);
  assert.match(controller, /override func draw\(_ dirtyRect: NSRect\)/u);
  assert.match(controller, /sectionTitle as NSString/u);
  assert.match(controller, /drawsLightImageTile = provider == "cursor"/u);
  assert.match(controller, /private final class CompactNativeButton/u);
  assert.match(controller, /CompactNativeButton\(title: "", width: 34\)/u);
  assert.match(controller, /CompactNativeButton\(title: "✕", width: 34\)/u);
  assert.match(controller, /private final class SettingsGroupView/u);
  assert.match(controller, /private let sectionTitleWidth: CGFloat/u);
  assert.match(controller, /control\.frame = NSRect\(x: x, y: 0, width: width, height: 30\)/u);
  assert.match(controller, /private func settingsGroups\(\)/u);
  assert.match(controller, /override func hitTest\(_ point: NSPoint\) -> NSView\?/u);
  assert.ok(controller.includes("settings control tapped \\(sectionTitle)"));
  assert.match(controller, /NSApp\.sendAction\(action, to: control\.target, from: control\)/u);
  assert.match(controller, /private final class TouchBarScrollView/u);
  assert.match(controller, /override func mouseDown\(with event: NSEvent\)/u);
  assert.match(controller, /private func deepestButton\(in root: NSView, at point: NSPoint\)/u);
  assert.ok(controller.includes("touch dispatch (button.identifier"));
  assert.match(controller, /NSApp\.sendAction\(action, to: button\.target, from: button\)/u);
  assert.match(controller, /func scrollPage/u);
  assert.match(controller, /override func scrollWheel/u);
  assert.match(controller, /panelScrollView\?\.scrollPage\(-1\)/u);
  assert.match(controller, /panelScrollView\?\.scrollPage\(1\)/u);
  assert.match(controller, /configurationVisible \? \.bbSettingsPanel : \.bbList/u);
  assert.match(controller, /settingsPanelItem\.view = scrollContainer\(settingsGroups\(\)\)/u);
  assert.match(controller, /title: "FILTERS"/u);
  assert.match(controller, /title: "SUBSCRIPTIONS"/u);
  assert.match(controller, /title: "HOST MONITOR"/u);
  assert.match(controller, /systemSymbolName: "desktopcomputer"/u);
  assert.match(controller, /appendArc/u);
  assert.match(controller, /progress\.lineCapStyle = \.round/u);
  assert.match(controller, /usageItem\.view = usageIconsView/u);
  assert.match(controller, /scrollContainer\(settingsGroups\(\)\)/u);
  assert.doesNotMatch(controller, /usageButton\.title/u);
  assert.match(controller, /BBTouchBarShowUsage/u);
  assert.match(controller, /BBTouchBarShowHostMonitor/u);
  assert.match(controller, /BBTouchBarUsageCodex/u);
  assert.match(controller, /BBTouchBarUsageClaude/u);
  assert.match(controller, /BBTouchBarUsageCursor/u);
  assert.match(controller, /0x34A853/u);
  assert.match(controller, /0xD9911A/u);
  assert.match(controller, /0xFF7A00/u);
  assert.match(controller, /0xD94B4B/u);
  assert.match(controller, /iconView\.layer\?\.borderWidth = 0/u);
  assert.match(controller, /iconView\.layer\?\.cornerRadius = 12/u);
  assert.match(controller, /iconView\.layer\?\.masksToBounds = true/u);
  assert.match(controller, /private final class AgentStatusPill: NSView/u);
  assert.match(controller, /statusPill\.update/u);
  assert.match(controller, /floor\(\(bounds\.height - size\.height\) \/ 2\)/u);
  assert.doesNotMatch(controller, /accentLayer/u);
  assert.match(controller, /bounds\.contains\(point\) \? self : nil/u);
  assert.doesNotMatch(controller, /statusIconView/u);
  assert.match(controller, /hostMonitorTapped/u);
  assert.match(controller, /hostViewVisible\.toggle\(\)/u);
  assert.match(controller, /private final class HostMetricView: NSButton/u);
  assert.match(controller, /#selector\(hostTapped/u);
  assert.match(controller, /AgentStore\.openHostMonitor/u);
  assert.ok(controller.includes("opened host \\(hostId) in BB Host Monitor"));
  assert.match(controller, /usageVisibilityTapped/u);
  assert.match(controller, /hostVisibilityTapped/u);
  assert.match(controller, /case \.bbUsage: return usageItem/u);
  assert.match(controller, /case \.bbHostMonitor: return hostMonitorItem/u);
  assert.match(controller, /message\("Reconnecting…"\)/u);
  assert.match(controller, /snapshot\.connected \? "No BB threads" : "BB is offline"/u);
  assert.match(model, /\["touchbar", "open", entry\.id\]/u);
  assert.match(model, /dev\.bb\.desktop/u);
  assert.match(model, /activateBB/u);
  assert.match(model, /\["host-monitor", "open", hostId\]/u);
  assert.match(controller, /width: 44, action: action/u);
  assert.match(controller, /width: 28,[\s\S]*height: 28/u);
  assert.match(controller, /iconView\.frame = NSRect\(x: 4, y: 3, width: 24, height: 24\)/u);
  assert.doesNotMatch(controller, /ProviderIcon\.image\(for: provider\)\.draw/u);
  assert.match(controller, /radius: 12\.5/u);
  assert.doesNotMatch(model, /\["touchbar", "stop"/u);
  for (const provider of ["opencode", "kimi", "deepseek", "qwen", "windsurf", "cline", "roocode"]) {
    assert.match(support, new RegExp(`"${provider}"`, "u"));
  }
  assert.match(support, /"codex": "openai"/u);
  assert.match(support, /circularChatGPT/u);
  assert.match(main, /setActivationPolicy\(\.accessory\)/u);
  assert.match(main, /MenuBarController/u);
  assert.match(main, /onSettingsRequested/u);
  assert.match(menuBar, /NSStatusBar\.system\.statusItem/u);
  assert.match(menuBar, /LAYOUT FILTER/u);
  assert.match(menuBar, /SUBSCRIPTIONS/u);
  assert.match(menuBar, /HOST MONITOR/u);
  assert.match(menuBar, /Show usage rings/u);
  assert.match(menuBar, /Show host button/u);
  assert.match(menuBar, /Open at Login/u);
  assert.match(menuBar, /PropertyListSerialization\.data/u);
  assert.match(menuBar, /app\.getbb\.touchbar\.native\.plist/u);
  assert.match(menuBar, /Quit BB Touch Bar/u);
  assert.match(menuBar, /menu\.popUp/u);
  assert.doesNotMatch(menuBar, /performClick/u);
  assert.match(main, /applicationWillTerminate/u);
  assert.match(build, /DFRFoundation/u);
  assert.match(build, /codesign --force --sign -/u);
  assert.match(build, /BB_TOUCHBAR_SIGN_IDENTITY/u);
  assert.match(build, /app-icon-1024\.png/u);
  assert.match(build, /iconutil -c icns/u);
  assert.match(build, /CFBundleIconFile/u);
  assert.doesNotThrow(() => readFileSync(join(native, "Assets/app-icon-1024.png")));
  assert.match(packager, /BBTouchBar-\$VERSION-universal\.zip/u);
  assert.match(packager, /notarytool submit/u);
  assert.match(packager, /stapler staple/u);
  assert.match(brewInstaller, /launchctl bootstrap/u);
  assert.match(brewUninstaller, /launchctl bootout/u);
  assert.match(cask, /cask "bb-touch-bar"/u);
  assert.match(cask, /app "package-#\{version\}\/BBTouchBar\.app"/u);
  assert.match(cask, /postflight do/u);
  assert.doesNotMatch(cask, /RELEASE_SHA256/u);
  assert.match(installer, /app\.getbb\.touchbar\.native\.plist/u);
  assert.match(installer, /launchctl bootstrap/u);
});
