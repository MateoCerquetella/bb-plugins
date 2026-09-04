<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
    <img src="./assets/logo.svg" width="84" height="84" alt="Host Monitor logo">
  </picture>
</p>

<h1 align="center">Host Monitor</h1>

<p align="center">
  Grafana-inspired current and historical health for every machine enrolled in BB.
</p>

<p align="center">
  <strong>bb 0.40+</strong> · <strong>macOS, Linux, and Windows</strong> · <strong>MIT</strong>
</p>

Host Monitor turns BB's enrolled machines into one dense observability page.
The fleet overview keeps every connected, disconnected, stale, loading, and
failed machine visible. Select a machine card to inspect its current telemetry
and up to 30 days of utilization, load, and network history without leaving the
page.

The bottom-left Host Monitor icon opens a compact machine mini-modal with every
enrolled host's current state, CPU, RAM, and disk. Choose **Open Host Monitor**
there to enter the dedicated full dashboard page. The monitor never redirects
you into plugin Settings.

The mini-modal is quick telemetry and navigation—not a warning surface. It has
no notification badge, toast, alert banner, IP/process controls, or draggable
floating mode.

## Dashboard

Each machine reports:

- CPU utilization, model, logical cores, and 1/5/15-minute load.
- RAM used, available, total, and utilization.
- Root-disk used, available, total, and utilization.
- Aggregate download and upload throughput.
- Uptime, operating system, architecture, and kernel.
- Independent connection, sampling, freshness, and inline error state.

The page offers 1 hour, 6 hours, 1 day, 7 days, and 30 days. Per-machine
history is persisted in the plugin database, aggregated to at most 720 points,
and displays collection gaps as breaks instead of zeroes.

## Per-machine dashboards

Select any machine—including a disconnected one—and choose **Edit dashboard**.
Each machine keeps its own ordered dashboard. You can:

- Add CPU, RAM, root disk, load, network, or uptime panels.
- Show supported metrics as a current stat or time-series visualization.
- Move panels earlier or later and remove panels you do not need.
- Cancel a draft or save it explicitly.

Saved layouts use BB's stable machine id and the plugin database, so they
survive Host Monitor reloads and stay independent between machines. A missing
or unreadable saved layout safely falls back to the default dashboard.

## Grafana-inspired, BB-native

The interface borrows the useful dashboard grammar—compact toolbars, fleet
variables, dense stat tiles, bordered panels, tabular values, and time-series
charts—without copying Grafana branding. Colors come from the active BB theme,
and every state has text so color is never the only signal. The dashboard
collapses into a single readable column on narrow/mobile views.

## Threshold guides and notifications

Configure CPU, RAM, and root-disk guides in **Extensions → Plugins → Host
Monitor**. Each guide offers 70%, 80%, 90%, or 95%.

Guides only tint in-page panels and chart lines. Host Monitor deliberately has:

- No toast notifications.
- No browser or desktop notifications.
- No warning badge or resource alert banner.
- No warning popup or draggable floating monitor; the footer icon opens only
  the explicit telemetry mini-modal described above.
- No automatic or destructive process actions.

Sampling failures stay inline on the affected machine while other machines
continue updating.

## Privacy and safety

Host Monitor uses BB's authenticated enrolled-host connection and a
metrics-only host worker. It does not manage SSH credentials or send telemetry
to third parties.

Snapshots exclude IP addresses, MAC addresses, interface names, netmasks,
processes, command lines, environment variables, and credentials. The worker
has no process-control methods.

## Install

### BB Community marketplace

```sh
bb plugin install host-monitor
```

### Direct Git release

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 \
  --subdirectory plugins/host-monitor \
  --tag-prefix host-monitor/
```

## Development

From the repository root:

```sh
npm install
npm run check --workspace bb-plugin-host-monitor
bb plugin install ./plugins/host-monitor
bb plugin reload host-monitor
```

## License

[MIT](./LICENSE) © Mateo Cerquetella. The chart presentation adapts ideas and
code from the MIT-licensed Phosphor Machine Monitor; see
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
