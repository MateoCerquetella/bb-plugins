# Host Monitor Grafana Fleet Dashboard

## Request

> Rework Host Monitor into a Grafana-style in-page fleet dashboard. Restore the Host Monitor sidebar accessory icon as a compact quick-access/status control, but keep the full monitoring interface inside the Host Monitor page rather than a popup or floating overlay. Monitor and display every enrolled BB machine, with per-machine CPU, RAM, disk, load, uptime, network and historical panels where available. Preserve notification-free behavior: no toast, desktop/browser notification, alert banner, or warning badge.

## Goal

Host Monitor becomes a Grafana-inspired fleet observability page for every
machine enrolled in BB. The Host Monitor sidebar row keeps its branded icon and
adds a small neutral connected/total accessory, but all dashboards, metrics,
history, filters, errors, and machine drill-downs live inside the Host Monitor
page. The plugin remains notification-free.

## Acceptance Criteria

- [ ] [AC-1] The plugin enumerates every enrolled BB machine and samples every
  connected machine through one bounded Host Monitor host worker; disconnected,
  stale, loading, and failed machines remain visible independently.
- [ ] [AC-2] Each successful machine sample includes CPU, RAM, root disk,
  network receive/send rate, 1/5/15-minute load, uptime, OS, architecture,
  kernel, and processor facts without IP addresses or process controls.
- [ ] [AC-3] The server persists per-machine time series for up to 30 days and
  returns at most 720 range-relative points per machine for 1h, 6h, 24h, 7d,
  and 30d ranges, preserving collection gaps.
- [ ] [AC-UI-1] [UI] The Host Monitor page renders a Grafana-inspired overview
  with fleet totals, a machine selector/filter, compact status cards for every
  enrolled machine, and dense theme-safe panel chrome.
- [ ] [AC-UI-2] [UI] Selecting a machine keeps the user inside the same page and
  shows per-machine current-stat panels plus utilization, load, and network
  history charts; the layout remains usable at desktop and 390px widths.
- [ ] [AC-UI-3] [UI] The Host Monitor sidebar row uses the existing branded icon
  and a neutral text accessory showing connected/total machines; it opens the
  page normally and never opens a popover or floating overlay.
- [ ] [AC-4] No toast, Web Notification, desktop notification, warning badge,
  alert banner, process termination action, IP reveal, popup, or floating
  monitor is registered or rendered. Failures appear inline within the page.
- [ ] [AC-5] Threshold settings remain passive visual guides for CPU, RAM, and
  disk, and a user can change the history range or refresh all machines without
  causing overlapping host calls.
- [ ] [AC-6] The Host Monitor package identity, route, custom icon/logo assets,
  BB/SDK compatibility, and direct Git installation coordinates remain stable.
- [ ] [AC-7] Focused tests cover host contract boundaries, all-machine
  projection, per-host storage/history limits, refresh coalescing, sidebar
  accessory registration, notification absence, and responsive Grafana layout;
  repository checks and a local BB install/reload pass.

## Scope

- Restore a metrics-only `bb.host` worker and enrolled-host polling service.
- Add append-only per-host history storage while retaining existing migrations.
- Replace the single deployment-machine panel with a page-contained fleet
  overview and machine drill-down.
- Restore only the neutral sidebar accessory; do not restore its old popup,
  floating window, content script, IP UI, or process controls.
- Update package metadata, tests, README/catalog copy, and live installation.

## Non-goals

- Reproducing Grafana branding, plugins, query language, alerting, or editing.
- Automatic remediation or destructive process actions.
- IP addresses, MAC addresses, interface names, command lines, or credentials.
- Toasts, notification badges, browser/desktop notifications, popup dashboards,
  floating windows, or any UI outside the Host Monitor page body except the
  small sidebar connected/total accessory.
- Publishing, tagging, pushing, or marketplace mutation.

## Risks

- One disconnected or slow machine must not block the fleet refresh.
- Polling and history must remain bounded as enrolled-machine count grows.
- Existing single-machine database migrations are append-only and cannot be
  reordered or rewritten.
- Network counters differ by platform and must degrade to unavailable values.
- Dense Grafana-style presentation must remain legible on narrow viewports and
  across BB themes without hard-coded palette colors.

## Verification

- Run host-entry harness, server/storage, chart, registration, responsive CSS,
  notification-absence, type, SDK, and build checks.
- Run complete workspace checks and clean-source CI through Empirical.
- Reload the local path plugin; confirm every enrolled machine appears and each
  connected host yields a valid sample independently.
- Use a real browser at desktop and 390px widths, exercise machine/range
  selection and refresh, and capture screenshots showing the in-page dashboard
  plus neutral sidebar accessory.

## Capability Deltas

See `deltas/host-monitor-grafana-fleet.md`.
