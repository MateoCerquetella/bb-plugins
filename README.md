<div align="center">

# bb-plugins

**Plugins for [bb](https://github.com/get-bb/bb), the agent IDE — in one GitHub repository.**

![bb >=0.40](https://img.shields.io/badge/bb-%3E%3D0.40-88C0D0?style=flat-square)
![Bun workspace](https://img.shields.io/badge/Bun-1.3.14-3FA266?style=flat-square)
![macOS · Linux](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Linux-F1B467?style=flat-square)

</div>

<picture><img src="docs/media/hero.png" alt="bb running with these plugins enabled: the Dockside inbox, Agent Proxy and Agentation in the sidebar, an Amp Orb thread with an Oracle card, the GitHub Stack panel, and the bb Monokai palette throughout" width="100%" /></picture>

### Agent Providers

<table>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/agent-proxy/assets/logo-dark.svg" /><img src="plugins/agent-proxy/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/agent-proxy/"><b>Agent Proxy</b></a></td>
<td>Pools several Claude Code and Codex subscriptions behind one local endpoint and load-balances across them, moving on when one hits its quota.</td>
</tr>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/amp/assets/logo-dark.svg" /><img src="plugins/amp/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/amp/"><b>Amp</b></a></td>
<td>Runs <a href="https://ampcode.com">Amp</a> as a native bb provider, locally or in an Orb.</td>
</tr>
</table>

### Dev Productivity

<table>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/agentation/assets/logo-dark.svg" /><img src="plugins/agentation/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/agentation/"><b>Agentation</b></a></td>
<td>Turns a click on any part of bb into a structured annotation an agent can act on.</td>
</tr>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/gh-stack/assets/logo-dark.svg" /><img src="plugins/gh-stack/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/gh-stack/"><b>GitHub Stack</b></a></td>
<td>Drives a <code>gh stack</code> from the thread panel — build, sync, submit, merge — and can hand the split to your agent.</td>
</tr>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/dotfiles/assets/logo-dark.svg" /><img src="plugins/dotfiles/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/dotfiles/"><b>Dotfiles</b></a> ⚠️</td>
<td><b>Personal, unsupported.</b> Syncs one specific dotfiles repo layout. Not published to npm.</td>
</tr>
</table>

### Utilities

<table>
<tr>
<td align="center" width="60"><img src="plugins/action-topbar/assets/icon.svg" width="40" height="40" alt="" /></td>
<td align="center"><a href="plugins/action-topbar/"><b>Action Topbar</b></a></td>
<td>Mirrors BB's native panel tabs into an Orca-style topbar and lets Actions drag from its searchable <b>+</b> menu into main-workspace splits.</td>
</tr>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/host-monitor/assets/logo-dark.svg" /><img src="plugins/host-monitor/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/host-monitor/"><b>Host Monitor</b></a></td>
<td>Shows live CPU, memory, disk, network throughput, load, and uptime across every host enrolled in bb.</td>
</tr>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/notify/assets/logo-dark.svg" /><img src="plugins/notify/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/notify/"><b>Notify</b></a></td>
<td>Real macOS notifications from bb itself when a thread finishes or fails, plus a <code>notify_user</code> agent tool.</td>
</tr>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/dockside/assets/logo-dark.svg" /><img src="plugins/dockside/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/dockside/"><b>Dockside</b></a> ⚠️</td>
<td>A project-first thread list with stable ordering, clear working/unread states, and inline child agents. <b>Not yet published to npm; install from source.</b> Forked from <a href="https://github.com/get-bb/bb/tree/main/examples/plugins/t3sidebar">bb's own example</a>.</td>
</tr>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/usage-tracker/assets/logo-dark.svg" /><img src="plugins/usage-tracker/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/usage-tracker/"><b>Usage Tracker</b></a></td>
<td>Shows compact Codex and Claude Code 5-hour and weekly limits directly in the sidebar footer.</td>
</tr>
</table>

### Themes

<table>
<tr>
<td align="center" width="60"><picture><source media="(prefers-color-scheme: dark)" srcset="plugins/monokai/assets/logo-dark.svg" /><img src="plugins/monokai/assets/logo.svg" width="40" height="40" alt="" /></picture></td>
<td align="center"><a href="plugins/monokai/"><b>bb Monokai</b></a></td>
<td>A dark Monokai-family palette for the whole app: one meaning per hue, a single text ladder, all 16 ANSI colors, and a matching diff viewer.</td>
</tr>
</table>

## Install

One command per plugin:

```sh
bb plugin install npm:bb-plugin-<id>
```

This applies to published packages. Dockside is currently source-only: its npm
name is intentionally not trusted until the maintainer controls that namespace.

`<id>` is the plugin's directory name — `action-topbar`, `agent-proxy`, `agentation`, `gh-stack`, `host-monitor`, `notify`, `amp`, `dockside`, `usage-tracker`, or `monokai`. For example:

```sh
bb plugin install npm:bb-plugin-notify
```

## Build from source

This puts each plugin in as a **local path source**, so bb reads the files in place and the development watcher rebuilds and reloads changes without a reinstall.

```sh
git clone https://github.com/mateocerquetella/bb-plugins
cd bb-plugins
bun install                              # one hoisted node_modules at the repo root
bun run build                            # bb plugin build for every plugin
bb plugin install ./plugins/<id>         # from the repo root
bun run dev                              # watch all installed workspace plugins
```

To install one plugin directly from Git instead, target its subdirectory:

```sh
bb plugin install git:https://github.com/mateocerquetella/bb-plugins.git@main --subdirectory plugins/<id>
```
