# Action Topbar

> [!NOTE]
> Native Action workspace panes need a BB build that exposes the experimental
> split-drag API. Official BB 0.46.1 and 0.47.1 builds do not. Without it,
> dropping an Action opens it in the pane under the pointer. The included
> [0.46.1 patch](#native-action-splits-on-bb-0461) restores real splits.

Action Topbar projects BB Actions opened as main-workspace panes into the
**main thread topbar**. Pane content stays under BB's ownership; the topbar
adds a compact tab strip and searchable **+** combobox while the right panel
keeps its original New Tab / Actions launcher.

Action-to-pane dragging uses BB's experimental thread Action split-drag
content-script API when it is available. Without it, dropping an Action on a
pane opens the Action there through BB's native launcher, so a BB upgrade never
disables the control. Apply the included host patch to get real main-workspace
Action panes on BB 0.46.1.

- Click a tab to focus its main-workspace pane without opening the right panel.
- Close a tab from the left-side **×** shown on hover, focus, or activation.
- Drag topbar tabs inside the strip to persist their new order.
- Drag an open Action tab out of the strip to move its existing workspace pane
  through BB's native split zones.
- Drag an Action directly from the topbar **+** menu onto BB's pane zones.
  With the native split-drag API, edge drops create a main-workspace split;
  without it, the drop opens the Action in the target pane. Clicking an Action
  opens it in the current pane.
- Action rows never open in the native right panel.
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
bb plugin install 'git:https://github.com/MateoCerquetella/bb-plugins.git@semver:action-topbar/:^0.1.4' \
  --subdirectory plugins/action-topbar \
  --yes
```

Or install a local checkout in place:

```sh
bb plugin install path:/absolute/path/to/bb-plugins/plugins/action-topbar --yes
```

## Native Action splits on BB 0.46.1

Official BB 0.46.1 and 0.47.1 removed the experimental
`experimental_beginThreadActionSplitDrag` content-script API, so stock builds
can only open an Action in an existing pane. The included
[`patches/bb-0.46.1-action-drag.patch`](./patches/bb-0.46.1-action-drag.patch)
restores real Action panes on BB 0.46.1.

Apply it to a BB 0.46.1 source checkout, then build and install the app
frontend:

```sh
cd /path/to/bb-source
git checkout desktop-v0.46.1
git apply /path/to/bb-plugins/plugins/action-topbar/patches/bb-0.46.1-action-drag.patch
pnpm install --offline --frozen-lockfile
pnpm --filter @bb/app build
```

Back up the running `bb-app/app/dist`, then **merge** the built assets over it
instead of deleting it, and reload BB:

```sh
cp -a apps/app/dist/. /path/to/bb-app/app/dist/
```

Keeping the old hashed assets matters: a tab that was already open still
references its original chunk names, and replacing the directory makes those
imports fail until every client hard-reloads. The patch is tied to the 0.46.1
source tree; regenerate it when BB changes the split-layout modules. It also
fixes Start Terminal from an Action pane by creating the terminal for that
thread.

## Develop

From the repository root, run `bun run dev`. The workspace watcher builds and
reloads this plugin when its source changes.
