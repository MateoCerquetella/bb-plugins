<p align="center">
  <img src="./plugins/taskboard/assets/icon.svg" width="128" height="128" alt="Taskboard ticket icon" />
</p>

<h1 align="center">BB Plugins</h1>

<p align="center">
  Focused extensions for <a href="https://github.com/get-bb/bb">BB</a>, kept together in one extensible workspace.
</p>

<p align="center">
  <a href="https://github.com/MateoCerquetella/bb-plugins/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MateoCerquetella/bb-plugins/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/BB-%E2%89%A5%200.38-7c3aed?style=flat-square" alt="BB 0.38 or newer" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

![Taskboard running inside BB](./docs/media/hero.png)

## Plugins

| | Plugin | Install | What it does |
| --- | --- | --- | --- |
| <img src="./plugins/action-topbar/assets/icon.svg" width="128" height="128" alt="" /> | [Action Topbar](./plugins/action-topbar) | [Experimental Git install](#action-topbar-experimental-install) | Adds a compact main-thread topbar with draggable BB Actions and persistent, per-thread workspace panes. Requires the matching experimental BB core/SDK build. |
| <img src="./plugins/clean-my-context/assets/icon.svg" width="128" height="128" alt="" /> | [Clean My Context](./plugins/clean-my-context) | [Git release](#clean-my-context-quick-start) | Resets visible chat and provider context in place while preserving the exact thread, branch, folder, workspace, and settings. Requires BB PR #2500. |
| <img src="./plugins/dockside/assets/icon.svg" width="128" height="128" alt="" /> | [Dockside](./plugins/dockside) | [Git branch](#dockside-quick-start) | Replaces BB's thread list with a compact project-first sidebar, semantic status colors, filters, safe multi-select deletion, and child-agent families. |
| <img src="./plugins/host-monitor/assets/icon.svg" width="128" height="128" alt="" /> | [Host Monitor](./plugins/host-monitor) | [Git release](#host-monitor-quick-start) | Monitors CPU, RAM, disk, network, host details, and guarded process actions across every machine enrolled in BB. Requires BB 0.40+. |
| <img src="./plugins/save-my-model/assets/icon.svg" width="128" height="128" alt="" /> | [Save My Model](./plugins/save-my-model) | [Git release](#save-my-model-quick-start) | Stores provider by BB host and model/reasoning separately for each host and provider. |
| <img src="./plugins/taskboard/assets/icon.svg" width="128" height="128" alt="" /> | [Taskboard](./plugins/taskboard) | [Git release](#taskboard-quick-start) | Brings each BB project's GitHub, Linear, or Jira tasks into one focused List or Kanban board. |
| <img src="./plugins/touchbar/assets/icon.svg" width="128" height="128" alt="" /> | [Touch Bar Agent Monitor](./plugins/touchbar) | [Git release](#touch-bar-agent-monitor-quick-start) | Adds a native persistent Control Strip badge and fullscreen BB agent panel to Touch Bar Macs. Requires BB 0.40+. |
| <img src="./plugins/usage-tracker/assets/icon.svg" width="128" height="128" alt="" /> | [Usage Tracker](./plugins/usage-tracker) | [Git release](#usage-tracker-quick-start) | Keeps Codex and Claude Code 5-hour and weekly limits beside BB's sidebar utility icons. |

## Action Topbar experimental install

> [!WARNING]
> Action Topbar is not being submitted to the BB Marketplace yet. It requires
> the matching BB core changes and experimental Plugin SDK 0.4.33 Action
> split-drag API. Stock BB releases without that API cannot provide its native
> main-workspace panes.

Install it from this repository on a compatible BB build:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@main \
  --subdirectory plugins/action-topbar \
  --yes
```

See the [Action Topbar README](./plugins/action-topbar) for the local-path
installation command and current compatibility details.

## Clean My Context quick start

Install the immutable Git release:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 \
  --subdirectory plugins/clean-my-context \
  --tag-prefix clean-my-context/
```

Open an idle or failed thread and select **Clear this thread** beside the
microphone, or run `bb clean-my-context clear <thread-id>`. BB stays on the
same thread, branch, folder, and workspace; the active timeline starts at one
`Context cleared` boundary and the next prompt starts with fresh model context.
See the [Clean My Context README](./plugins/clean-my-context) for safety rules
and development commands.

## Dockside quick start

Install Dockside directly from this repository branch while PR #26 is under
review:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@feature/dockside-thread-filters-bulk-delete --subdirectory plugins/dockside
```

Dockside groups threads by project, keeps root/child families together, adds
working/needs-you/unread/quiet filters, and protects current, active, waiting,
unread, and pinned families from permanent bulk deletion. Open
**Settings → Dockside** to choose semantic status and PR colors, density,
default child expansion, and optional metadata. See the
[Dockside README](./plugins/dockside) for behavior and development details.

Update or remove a local installation with BB:

```sh
bb plugin reload dockside
bb plugin remove dockside
```

## Touch Bar Agent Monitor quick start

Install the plugin on the BB server, then build and install the open-source
native app on the Touch Bar Mac:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 --subdirectory plugins/touchbar --tag-prefix touchbar/
bb touchbar snapshot --pretty
./plugins/touchbar/native/install.sh
```

The native background app keeps a BB badge in the Control Strip. Tap it to open
a fullscreen, horizontally scrollable row of live agent cards; tap a card to
open its exact BB thread, and use ✕ to collapse. It is source-built, ad-hoc
signed, has no license service, and starts at login. See the [Touch Bar Agent
Monitor README](./plugins/touchbar) for installation, privacy, private-API
limitations, controls, and removal.

## Host Monitor quick start

Install the immutable Host Monitor Git release directly from this monorepo:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 --subdirectory plugins/host-monitor --tag-prefix host-monitor/
```

Host Monitor requires BB 0.40 or later; the collection's other plugins retain
their BB 0.38-compatible releases.

An installation made under Host Monitor's retired plugin id cannot update
across the rename. Remove that earlier Host Monitor entry, then use the command
above; threshold settings must be applied again for a managed installation.

After [the BB Community entry](https://github.com/get-bb/marketplace/pull/128)
is merged and live, the equivalent shorthand is:

```sh
bb plugin install host-monitor
```

Host Monitor keeps live CPU, RAM used/total, disk, network, load, uptime, and
connection state in responsive cards or rows. Its sidebar control opens a
compact summary or movable floating monitor, while Host details provides a
searchable process ledger with explicit, freshly validated stop confirmations.
IPs remain masked until revealed. See the
[Host Monitor README](./plugins/host-monitor) for platform support, privacy,
thresholds, and process-safety details.

Update or remove it with BB:

```sh
bb plugin outdated
bb plugin update host-monitor
bb plugin remove host-monitor
```

## Save My Model quick start

Install the latest immutable Save My Model release directly from this monorepo:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.2 --subdirectory plugins/save-my-model --tag-prefix save-my-model/
```

After [the BB Community entry](https://github.com/get-bb/marketplace/pull/154)
is merged and live, install it by its short name:

```sh
bb plugin install save-my-model
```

Save My Model keeps provider defaults separate for each host and keeps model
and reasoning separate for each host and provider. Open **Settings → Save My Model** to inspect or clear saved
values. See the [Save My Model README](./plugins/save-my-model) for details.

Update or remove it with BB:

```sh
bb plugin outdated
bb plugin update save-my-model
bb plugin remove save-my-model
```

## Taskboard quick start

Install the tracking Git release directly from this monorepo:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.3.3 --subdirectory plugins/taskboard --tag-prefix taskboard/
```

After [the BB Community entry](https://github.com/get-bb/marketplace/pull/129)
is merged and live, the equivalent shorthand is:

```sh
bb plugin install taskboard
```

Then open **Taskboard → Manage**, choose a BB project, and select exactly one
external tracker for it. Different BB projects can use different providers.

Taskboard keeps rows and Kanban cards compact, preserves each provider's real
workflow, opens live issue details, and can send any task to an agent with its
context attached. Each project's remembered view can also be saved as a named
preset and reapplied explicitly from the board or CLI. See the
[Taskboard README](./plugins/taskboard) for GitHub, Linear, Jira, presets, CLI,
and credential setup.

Update or remove it with BB:

```sh
bb plugin outdated
bb plugin update taskboard
bb plugin remove taskboard
```

## Usage Tracker quick start

Install the tracking Git release directly from this monorepo:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.3 --subdirectory plugins/usage-tracker --tag-prefix usage-tracker/
```

After [the BB Community entry](https://github.com/get-bb/marketplace/pull/129)
is updated and live, the equivalent shorthand is:

```sh
bb plugin install usage-tracker
```

Usage Tracker mounts in BB's native sidebar footer beside the existing utility
icons. Each provider gets a compact progress bar and current usage reading.
Select Codex or Claude Code to expand its reported five-hour, weekly, and any
additional provider-defined limits, reset times, and session status without
leaving the current thread. Codex exposes available usage resets in the
expanded details and requires explicit confirmation before consuming one.
There is no separate plugin page to manage. The **Compact
limit** setting chooses whether the collapsed percentage and bar prefer weekly
or five-hour usage.

The strip refreshes automatically every five minutes, refreshes when a stale BB
window becomes active again, and includes a manual refresh control. If a
provider is briefly unavailable or rate-limited, the last known limit windows
remain visible with the current status. See the
[Usage Tracker README](./plugins/usage-tracker) for requirements, behavior, and
development details.

Update or remove it with BB:

```sh
bb plugin outdated
bb plugin update usage-tracker
bb plugin remove usage-tracker
```

## Build from source

Each plugin is an independent BB package under `plugins/<id>`. Clone the
workspace once, install the shared dependencies, and register a plugin as a
local-path source:

```sh
git clone https://github.com/MateoCerquetella/bb-plugins.git
cd bb-plugins
npm install
npm run build
bb plugin install ./plugins/dockside
bb plugin install ./plugins/host-monitor
bb plugin install ./plugins/taskboard
bb plugin install ./plugins/touchbar
bb plugin install ./plugins/usage-tracker
```

BB reads local-path plugins in place, so the development loop stays short:

```sh
git pull
npm install
npm run build
bb plugin reload dockside
bb plugin reload host-monitor
bb plugin reload taskboard
bb plugin reload touchbar
bb plugin reload usage-tracker
```

BB 0.38 and newer reads the repository's `.bb/plugins.json` collection, so a
plugin can also be installed straight from Git:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@feature/dockside-thread-filters-bulk-delete --plugin dockside
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@main --plugin host-monitor
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@main --plugin taskboard
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@main --plugin touchbar
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@main --plugin usage-tracker
```

Host Monitor, Taskboard, Touch Bar Agent Monitor, and Usage Tracker release through immutable
plugin-specific Git tags and the BB Community marketplace. Dockside remains a
branch installation until PR #26 lands and a release is prepared.

## Develop

Run every plugin's checks from the workspace root:

```sh
npm install
npm run check
```

New plugins belong in `plugins/<id>` with their own `package.json`, source,
tests, pinned `@get-bb/plugin-sdk` development dependency, and README. Add each
directory to `.bb/plugins.json`; the root workspace picks it up automatically.

## Contributors

- [Stephen Dolan (@stephendolan)](https://github.com/stephendolan) contributed
  Usage Tracker's configurable Compact limit.
- [Andrii Los (@RIP21)](https://github.com/RIP21) contributed Taskboard's
  project-view persistence work and dogfooding fixes, plus named filter
  presets.

## License

[MIT](./LICENSE) © 2026 Mateo Cerquetella.
