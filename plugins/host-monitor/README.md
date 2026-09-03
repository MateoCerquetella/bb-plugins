<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
    <img src="./assets/logo.svg" width="84" height="84" alt="Host Monitor logo">
  </picture>
</p>

<h1 align="center">Host Monitor</h1>

<p align="center">
  Compact current and historical health for the machine running the BB server.
</p>

<p align="center">
  <strong>bb 0.40+</strong> · <strong>MIT</strong>
</p>

Host Monitor records CPU, memory, root-disk, and load telemetry for the machine
running the BB server. It also tracks local Go, Rust, Bun, pnpm, and npm caches,
`/tmp`, and `~/.bb`. The responsive panel follows the compact
[Phosphor Machine Monitor](https://github.com/phosphorco/bb-community-plugins/tree/main/plugins/machine-monitor)
experience with current-value cards, selectable history, SVG charts, directory
growth, and Linux memory-pressure diagnostics.

It monitors the BB server machine only. It does not enumerate enrolled execution
hosts, reveal IP addresses, float an overlay, or stop processes.

## How it samples

CPU, RAM, root disk, and load are sampled every 30 seconds and retained for 30
days in the plugin SQLite database. Cache directories are sampled every 15
minutes. Each requested history range is aggregated to at most 720 chart points,
and collection gaps stay visible instead of being connected.

Linux memory pressure and reclaim counters are sampled every minute, temporarily
increasing to five seconds while the kernel reports stalls. A bounded read-only
process ranking runs once per minute and retains seven days or at most 20,000
compact snapshots.

## Warning thresholds

Configure CPU, RAM, and root-disk thresholds in **Extensions → Plugins → Host
Monitor**. Each threshold offers 70%, 80%, 90%, or 95%.

- CPU uses a rolling five-minute average so normal short agent bursts do not
  dominate the display.
- RAM uses Linux `MemAvailable` where available, so reclaimable filesystem cache
  is not treated as pressure.
- Disk is the filesystem mounted at `/`; directory growth is diagnostic only.
- Load average is context only because a healthy value depends on CPU count and
  workload.

Thresholds are passive in-panel colors and chart guides. Host Monitor sends no
toast, browser, desktop, or sidebar notifications and renders no resource alert
banner.

## Process privacy

Names, PIDs, and inferred workload labels are hidden by default because they can
expose deployment-host details. Enable **Show process attribution** in plugin
settings for an operator-only, read-only ranking. Host Monitor scans at most
2,048 processes and displays at most 12. It never returns command lines,
environment variables, credentials, or process-control actions.

Unavailable platform metrics are shown as `—` rather than failing the complete
collector.

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

[MIT](./LICENSE) © Mateo Cerquetella. The implementation adapts the MIT-licensed
Phosphor Machine Monitor; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
