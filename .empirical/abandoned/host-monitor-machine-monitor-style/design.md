# Design

## Source adaptation

Use the referenced Machine Monitor implementation at commit
`7a28e61f1816499cf6b9c6faca4a1f7ab4662e18` as the behavioral baseline. Adapt
its `app.tsx`, `app.css`, `server.ts`, `monitor.ts`, `store.ts`, RPC contract,
and focused tests into the existing `plugins/host-monitor` package. Preserve the
Host Monitor package, route, visible title, repository metadata, custom artwork,
and `env -u BB_CLI` build/type scripts required by this workspace.

## Runtime architecture

The plugin server owns one SQLite-backed sampler for the BB server machine. The
sampler records current resource metrics every 30 seconds, directory sizes every
15 minutes, Linux memory diagnostics every minute (temporarily every five
seconds during stalls), and a bounded process ranking every minute. RPC exposes
validated `snapshot` and `health` reads; realtime sample/directory/memory events
invalidate the panel without foreground polling.

The previous host worker and enrolled-host RPC contract are deleted. This also
removes IP collection, fleet enumeration, remote process listing, termination
tokens, and termination operations from the package boundary.

## Presentation

The app uses the reference's responsive dense-card composition: header and
history selector; four current metrics; ECharts SVG utilization/load history;
cache and working-directory growth; and optional memory-pressure diagnostics.
CSS retains BB theme variables and collapses to two metric columns and one chart
column below 620px.

Thresholds remain passive visual context on cards/charts. The sidebar health
accessory is intentionally not registered. Runtime and collector failures render
inline, with `role=status` rather than notification delivery. No Sonner toast,
Web Notification API, threshold banner, or notification badge is present.

## Settings and privacy

The server registers enumerated CPU/RAM/disk thresholds and a boolean process
attribution setting. Process names and PIDs are collected and returned only when
the opt-in setting is enabled. Historical samples and directory aggregates are
bounded by upstream retention and row limits.

## Packaging and compatibility

Add `echarts` and `better-sqlite3` as runtime dependencies because the app and
server import them. Keep `zod` at the workspace-compatible release and retain
the exact plugin SDK version pinned to the repository's BB app. Remove obsolete
Radix/Sonner dependencies made unreachable by the deleted controls.

## Verification design

Adapt upstream monitor, ECharts hover, and mobile-layout tests, then add identity
and notification-absence assertions. Run the focused plugin check and full
workspace check through Empirical evidence commands. Install/reload the local
plugin and capture desktop plus narrow-width browser evidence.
