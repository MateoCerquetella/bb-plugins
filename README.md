<p align="center">
  <img src="./plugins/taskboard/assets/icon.svg" width="128" height="128" alt="Taskboard ticket icon" />
</p>

<h1 align="center">BB Plugins</h1>

<p align="center">
  Focused extensions for <a href="https://github.com/get-bb/bb">BB</a>, kept together in one extensible workspace.
</p>

All plugins in this repository are independently installable.

<p align="center">
  <a href="https://github.com/MateoCerquetella/bb-plugins/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MateoCerquetella/bb-plugins/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/BB-%E2%89%A5%200.38-7c3aed?style=flat-square" alt="BB 0.38 or newer" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

![Taskboard running inside BB](./docs/media/hero.png)

## Plugins

| | Plugin | Install | What it does |
| --- | --- | --- | --- |
| <img src="./plugins/conversation-space/assets/icon.svg" width="128" height="128" alt="" /> | [Conversation Space (WIP)](./plugins/conversation-space) | [Local development install](./plugins/conversation-space#conversation-space-wip) | **Work in progress:** compact context usage, colored token percentages, and measured Jev routing diagnostics. |
| <img src="./plugins/jev-route/assets/icon.svg" width="128" height="128" alt="" /> | [Jev Routing](./plugins/jev-route) | [Git install](./plugins/jev-route#install) | Jev-only model history, custom model colors, and Codex-only automatic routing without cross-provider quota fallback. |
| <img src="./plugins/action-topbar/assets/icon.svg" width="128" height="128" alt="" /> | [Action Topbar](./plugins/action-topbar) | [Git install](#action-topbar-install) | Adds a compact main-thread topbar with draggable BB Actions and persistent, per-thread workspace panes. |
| <img src="./plugins/dockside/assets/icon.svg" width="128" height="128" alt="" /> | [Dockside](./plugins/dockside) | [Git release](#dockside-quick-start) | Adds a project-first sidebar plus mobile navigation across active and unread threads, with synchronized project colors and animated status icons. |
| <img src="./plugins/host-monitor/assets/icon.svg" width="128" height="128" alt="" /> | [Host Monitor](./plugins/host-monitor) | [Git release](#host-monitor-quick-start) | Monitors CPU, RAM, disk, network, host details, and guarded process actions across every machine enrolled in BB. Requires BB 0.40+. |
| <img src="./plugins/steel-browser/assets/icon.svg" width="128" height="128" alt="" /> | [BB Surf](./plugins/steel-browser) | [Git release](#bb-surf-quick-start) | Operates self-hosted Steel browser sessions from BB with health, session lifecycle, CLI, agent guidance, and selectable Playwright or Jev execution. Requires BB 0.40+. |
| <img src="./plugins/taskboard/assets/icon.svg" width="128" height="128" alt="" /> | [Taskboard](./plugins/taskboard) | [Git release](#taskboard-quick-start) | Brings each BB project's GitHub, GitLab, Gitea, Linear, or Jira tasks into one focused List or Kanban board. |
| <img src="./plugins/aura/assets/icon.svg" width="128" height="128" alt="" /> | [Aura](./plugins/aura) | [Install](./plugins/aura#install) | Custom PNG/JPG backgrounds, animated pixel textures, six saved slots, and an optional real GitHub activity overview below the centered New thread composer. |
| <img src="./plugins/touchbar/assets/icon.svg" width="128" height="128" alt="" /> | [Touch Bar Agent Monitor](./plugins/touchbar) | [Git release](#touch-bar-agent-monitor-quick-start) | Adds a native persistent Control Strip badge and fullscreen BB agent panel to Touch Bar Macs. Requires BB 0.40+. |
| <img src="./plugins/usage-tracker/assets/icon.svg" width="128" height="128" alt="" /> | [Usage Tracker](./plugins/usage-tracker) | [Git release](#usage-tracker-quick-start) | Keeps Codex, Claude Code, and other provider limits beside BB's sidebar utility icons, including the DeepSeek API balance. |
| <img src="./plugins/lavender/assets/icon.svg" width="128" height="128" alt="" /> | [Lavender](./plugins/lavender) | [Git release](./plugins/lavender#install) | Adds coordinated pale-lilac light and charcoal-violet dark palettes for conversations and code. |

## Action Topbar install

Install it from this repository:

```sh
bb plugin install 'git:https://github.com/MateoCerquetella/bb-plugins.git@semver:action-topbar/:^0.1.4' \
  --subdirectory plugins/action-topbar \
  --yes
```

See the [Action Topbar README](./plugins/action-topbar) for the local-path
installation command and current compatibility details.

## Dockside quick start

Install the latest compatible Dockside Git release:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.5 --subdirectory plugins/dockside --tag-prefix dockside/
```

Dockside groups threads by project, keeps root/child families together, adds
working/needs-you/unread/quiet filters, and protects current, active, waiting,
unread, and pinned families from permanent bulk deletion. Open
**Settings → Dockside** to choose Icons or Verbose status display, semantic status and PR colors, density,
default child expansion, and optional metadata. See the
[Dockside README](./plugins/dockside) for behavior and development details.

Update or remove an installation with BB:

```sh
bb plugin update dockside
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

## BB Surf quick start

BB Surf connects BB to a self-hosted
[Steel](https://github.com/steel-dev/steel-browser) API. On `dyaus`, the
service runs as a pinned Docker container on loopback port `3100`.

Install from the published Git release range:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.2.0 --subdirectory plugins/steel-browser --tag-prefix steel-browser/
bb plugin reload steel-browser
```

BB Surf is also available in BB Community as `steel-browser@bb-community`.
Release versions can lag the features described on the main branch.
For a missing local installation, follow [the recovery guide](docs/plugin-recovery.md)
instead of uninstalling the plugin.

Open **BB Surf** in BB or manage sessions from the CLI:

```sh
bb surf status
bb surf sessions
bb surf create
bb surf release <session-id>
```

The plugin also ships agent guidance for choosing the local Steel service over
KERNEL.SH. See the [BB Surf README](./plugins/steel-browser) for service,
configuration, and development details.

## Taskboard quick start

Install the tracking Git release directly from this monorepo:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.3.6 --subdirectory plugins/taskboard --tag-prefix taskboard/
```

The [BB Community entry](https://github.com/get-bb/marketplace/pull/129)
is merged. You can also install its configured release range:

```sh
bb plugin install taskboard@bb-community
```

Taskboard 0.3.6 keeps a running stage attached when the ticket changes, resumes a
paused Build with the updated answers, and includes coordinator-first task
dispatch and the autonomous ticket factory. For a missing local
installation, use [the recovery guide](docs/plugin-recovery.md) to preserve
your existing configuration without downgrading it.

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
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.16 --subdirectory plugins/usage-tracker --tag-prefix usage-tracker/
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

Aura, Dockside, Host Monitor, Taskboard, Touch Bar Agent Monitor, and Usage Tracker release through immutable
plugin-specific Git tags. See each plugin’s README for marketplace availability.

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
