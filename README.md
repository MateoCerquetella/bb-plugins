<p align="center">
  <img src="./plugins/taskboard/assets/icon.svg" width="64" height="64" alt="Taskboard ticket icon" />
</p>

<h1 align="center">BB Plugins</h1>

<p align="center">
  Focused extensions for <a href="https://github.com/get-bb/bb">BB</a>, kept together in one extensible workspace.
</p>

<p align="center">
  <a href="https://github.com/MateoCerquetella/bb-plugins/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MateoCerquetella/bb-plugins/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status" /></a>
  <a href="https://www.npmjs.com/package/bb-plugin-taskboard"><img src="https://img.shields.io/npm/v/bb-plugin-taskboard?style=flat-square&label=Taskboard" alt="Taskboard npm version" /></a>
  <a href="https://www.npmjs.com/package/bb-plugin-usage-tracker"><img src="https://img.shields.io/npm/v/bb-plugin-usage-tracker?style=flat-square&label=Usage%20Tracker" alt="Usage Tracker npm version" /></a>
  <img src="https://img.shields.io/badge/BB-%E2%89%A5%200.36-7c3aed?style=flat-square" alt="BB 0.36 or newer" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

![Taskboard running inside BB](./docs/media/hero.png)

## Plugins

| | Plugin | Install | What it does |
| --- | --- | --- | --- |
| <img src="./plugins/taskboard/assets/icon.svg" width="28" height="28" alt="" /> | [Taskboard](./plugins/taskboard) | `bb plugin install npm:bb-plugin-taskboard` | Brings each BB project's GitHub, Linear, or Jira tasks into one focused List or Kanban board. |
| <img src="./plugins/usage-tracker/assets/icon.svg" width="28" height="28" alt="" /> | [Usage Tracker](./plugins/usage-tracker) | `bb plugin install npm:bb-plugin-usage-tracker` | Keeps Codex and Claude Code 5-hour and weekly limits beside BB's sidebar utility icons. |

## Taskboard quick start

Install the public package:

```sh
bb plugin install npm:bb-plugin-taskboard
```

Then open **Taskboard → Manage**, choose a BB project, and select exactly one
external tracker for it. Different BB projects can use different providers.

Taskboard keeps rows and Kanban cards compact, preserves each provider's real
workflow, opens live issue details, and can send any task to an agent with its
context attached. See the [Taskboard README](./plugins/taskboard) for GitHub,
Linear, Jira, CLI, and credential setup.

Update or remove it with BB:

```sh
bb plugin outdated
bb plugin update taskboard
bb plugin remove taskboard
```

## Usage Tracker quick start

Install the public package:

```sh
bb plugin install npm:bb-plugin-usage-tracker
```

Usage Tracker mounts in BB's native sidebar footer beside the existing utility
icons. Each provider gets a compact progress bar and current usage reading.
Select Codex or Claude Code to expand its five-hour and weekly limits, reset
times, and session status without leaving the current thread. There is no
separate plugin page to manage.

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
bb plugin install ./plugins/taskboard
bb plugin install ./plugins/usage-tracker
```

BB reads local-path plugins in place, so the development loop stays short:

```sh
git pull
npm install
npm run build
bb plugin reload taskboard
bb plugin reload usage-tracker
```

Direct `bb plugin install git:...` installation targets a repository-root
manifest and therefore does not apply to this multi-plugin layout. Each
released plugin gets its own npm package for one-command installation.

## Develop

Run every plugin's checks from the workspace root:

```sh
npm install
npm run check
```

New plugins belong in `plugins/<id>` with their own `package.json`, source,
tests, checked-in BB SDK declarations, and README. The root npm workspace picks
them up automatically.

## License

[MIT](./LICENSE) © 2026 Mateo Cerquetella.

## Acknowledgements

Repository layout inspired by
[smsunarto/bb-plugins](https://github.com/smsunarto/bb-plugins). Thanks to
Scott Sunarto for the clear multi-plugin structure.
