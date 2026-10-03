# Action Topbar

> [!WARNING]
> This plugin is experimental. Action pane dragging requires the matching BB core changes and the
> experimental Action split-drag API introduced in Plugin SDK 0.4.33. Install
> it only on a compatible BB build. Stock BB 0.44.0 does not expose this API;
> upgrading BB or the SDK alone does not enable Action pane dragging.
> The v0.1.2 release includes the matching core patch for BB 0.45.0.

Action Topbar projects BB Actions opened as main-workspace panes into the
**main thread topbar**. Pane content stays under BB's ownership; the topbar
adds a compact tab strip and searchable **+** combobox while the right panel
keeps its original New Tab / Actions launcher.

Action-to-pane dragging requires BB's experimental thread Action split-drag
content-script API. Clients missing that API show a status in the launcher
instead of silently ignoring the drag.

- Click a tab to focus its main-workspace pane without opening the right panel.
- Close a tab from the left-side **×** shown on hover, focus, or activation.
- Drag topbar tabs inside the strip to persist their new order.
- Drag an open Action tab out of the strip to move its existing workspace pane
  through BB's native split zones.
- Drag an Action directly from the topbar **+** menu onto BB's pane zones.
  Edge drops create a main-workspace split; a center drop replaces that pane.
- Action rows are drag-only. Clicking or pressing Enter does not open them in
  the native right panel.
- Legacy relaunchable panel tabs can still open their panel for another thread
  pane when no native Action pane is available.
- Select the topbar **+** for an auto-focused combobox. Its empty state lists actions;
  typing searches both actions and already-open tabs, with keyboard navigation.
- Open BB's native New Tab once after installing or removing another plugin;
  Action Topbar learns its live third-party action inventory.

The right panel's own **+** continues to open BB's original Search files,
Actions, and Recent page. The plugin hides only the duplicated content-tab
pills there; Info, Diff, fullscreen/collapse, and hide-panel controls remain
native and visible.

The plugin does not recreate Browser, Terminal, Recap, File Manager, Git
History, Side Chat, Taskboard, Workflows, or third-party panels. Main panes
stay host-rendered, and launcher rows still execute through their owning
plugin.

## Preview

### Light mode

![Action Topbar in BB light mode with the compact main-thread tab strip and searchable draggable Action launcher open](../../docs/media/action-topbar-light.png)

### Dark mode

![Action Topbar in BB dark mode with the compact main-thread tab strip and searchable draggable Action launcher open](../../docs/media/action-topbar-dark.png)

## Install

Install from Git on a compatible BB build:

```sh
bb plugin install 'git:https://github.com/MateoCerquetella/bb-plugins.git@semver:action-topbar/:^0.1.2' \
  --subdirectory plugins/action-topbar \
  --yes
```

Or install a local checkout in place:

```sh
bb plugin install path:/absolute/path/to/bb-plugins/plugins/action-topbar --yes
```

## Develop

From the repository root, run `bun run dev`. The workspace watcher builds and
reloads this plugin when its source changes.
