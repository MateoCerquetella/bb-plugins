# Host Monitor Customizable Widgets and Processes

## Request

> Improve Host Monitor dashboard with BB-native UI, restored per-host process controls, and persisted customizable widget layout; preserve existing committed baseline and do not merge/deploy.

## Goal

Deliver a BB-native, per-host monitoring dashboard opened from the existing
sidebar mini-modal. Operators can arrange and show/hide supported widgets,
inspect and safely control processes on the selected connected host, and return
to the same layout after reload without changing the established fleet,
history, realtime, or navigation behavior.

## Acceptance Criteria

- [ ] [AC-UI-1] [UI] The page opened by **Open Host Monitor** uses BB theme
  tokens, control sizes, typography, borders, focus states, skeletons, empty
  states, inline errors, and responsive conventions at narrow and wide widths.
- [ ] [AC-UI-2] [UI] The dashboard has a compact host header and customization
  mode where widgets can be reordered by drag-and-drop and keyboard controls,
  shown or hidden, and restored to defaults without entering plugin Settings.
- [ ] [AC-UI-3] [UI] Saving customization persists the selected host's widget
  order and visibility across reload and does not change another host's layout.
- [ ] [AC-UI-4] [UI] A Processes widget for the selected host shows bounded
  process name/PID, CPU, RAM, owner/protection state, sorting, filtering,
  refresh, and safe available actions. Loading, empty, unsupported, error, and
  disconnected states are explicit.
- [ ] [AC-UI-5] [UI] Process termination requires a fresh server preflight and
  an explicit confirmation dialog; graceful and force behavior is described,
  action results are announced inline, and protected processes have no action.
- [ ] [AC-1] Dashboard configuration is strictly parsed, bounded, migrated from
  the existing version, stored independently per enrolled host, and contains
  only catalog-backed widgets and supported presentations.
- [ ] [AC-2] Process listing and control reuse BB's enrolled-host transport and
  the prior bounded host-worker implementation: opaque lifetime identity,
  same-user/elevation/system/ancestry protections, serialized host operations,
  expiring single-use confirmation tokens, fixed commands, timeouts, and
  bounded output.
- [ ] [AC-3] Process requests never target a guessed host, stale responses do
  not cross host changes, disconnected/removed/unsupported hosts return
  non-destructive states, and process collection occurs only while its widget
  is visible.
- [ ] [AC-4] Existing fleet enumeration, sampling, realtime refresh, historical
  charts, mini-modal/footer navigation, passive health indication, and
  notification-free behavior remain intact. Numeric threshold controls or
  threshold-number chips are not shown in the Host Monitor UI.
- [ ] [AC-5] Focused tests cover config migration/order/visibility/isolation and
  process listing/preflight/confirmation/termination protections. Typecheck,
  focused tests, production build, live multi-host browser flow, persistence,
  narrow/wide layouts, and final diff scope pass.

## Scope

- `plugins/host-monitor` frontend, backend RPC contract, host worker, storage,
  focused tests, documentation, and Host Monitor browser QA.
- BB-registry-compatible vendored controls only where they materially improve
  interaction consistency; existing public SDK hooks and transport remain the
  integration boundary.
- Supported widgets derived from current snapshots/history plus the restored
  process source: CPU, RAM, disk, load, network, uptime, system details, and
  processes.

## Non-goals

- A new host registry, transport, telemetry daemon, notification system, IP
  disclosure, command-line/environment capture, arbitrary shell execution, or
  process control outside the selected enrolled host.
- Free-form Grafana queries, arbitrary chart expressions, resizable pixel-grid
  coordinates, cross-host dashboards, or new metrics unsupported by existing
  snapshot/history/process sources.
- Push, merge, deployment, marketplace publication, or unrelated refactors.

## Risks

- Process termination is destructive. The restored two-step identity-bound
  confirmation flow and conservative protected-process rules are mandatory.
- Drag/drop alone is inaccessible, so every reorder operation must also have a
  keyboard/button path and an announced result.
- Configuration schema evolution can discard user layouts if migration is not
  deterministic; existing version-1 rows must normalize predictably.
- Large process inventories or stale async responses can degrade the page;
  collection, rendering, polling, and host-generation checks remain bounded.

## Verification

- Execute `npm run verify --workspace bb-plugin-host-monitor` and the configured
  root workspace check.
- Exercise the installed plugin with multiple connected and disconnected hosts:
  open through the footer mini-modal without reload, switch hosts, customize and
  reload layouts, inspect processes, validate protected/actionable rows, and
  capture wide and 390px evidence.
- Review the exact base-relative diff for unrelated files, unsafe process
  surfaces, notification regressions, hard navigation, and generated artifacts.

## Capability Deltas

See `deltas/host-monitor-customizable-dashboard.md`.
