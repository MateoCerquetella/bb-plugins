# Action Topbar

> [!WARNING]
> This plugin is experimental and is not being submitted to the BB
> Marketplace yet. It requires the matching BB core changes and the
> experimental Action split-drag API introduced in Plugin SDK 0.4.33. Install
> it only on a compatible BB build; older BB releases cannot provide its native
> main-workspace panes.

Action Topbar projects BB Actions opened as main-workspace panes into the
**main thread topbar**. Pane content stays under BB's ownership; the topbar
adds an Orca-style strip and searchable **+** combobox while the right panel
keeps its original New Tab / Actions launcher.

Action-to-pane dragging requires BB's experimental thread Action split-drag
content-script API. Older compatible BB clients keep the menu visible but do
not start a split gesture.

- Click a tab to focus its main-workspace pane without opening the right panel.
- Close a tab from the left-side **×** shown on hover, focus, or activation.
- Drag topbar tabs inside the strip to persist their new order.
- Drag an Action directly from the topbar **+** menu onto BB's pane zones.
  Edge drops create a main-workspace split; a center drop replaces that pane.
- Action rows are drag-only. Clicking or pressing Enter does not open them in
  the native right panel.
- Drag an already-open relaunchable panel tab onto another existing split pane
  to open that panel for the target thread.
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

## Install

Install from Git on a compatible BB build:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@main \
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
