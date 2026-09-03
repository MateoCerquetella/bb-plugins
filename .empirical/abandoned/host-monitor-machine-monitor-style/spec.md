# Host Monitor Machine Monitor Style

## Request

> Update the existing plugins/host-monitor plugin so its user interface and interaction model match the referenced phosphorco machine-monitor plugin at https://github.com/phosphorco/bb-community-plugins/tree/main/plugins/machine-monitor, while preserving Host Monitor identity and removing all notification functionality and notification UI.

## Goal

Host Monitor becomes a deliberately compact, responsive monitor for the machine
running the BB server, using the referenced Machine Monitor's local sampling,
historical charts, cache/directory diagnostics, and memory-pressure presentation
while retaining this repository's Host Monitor name, icon artwork, package id,
and installation coordinates. Feedback remains inline; the plugin must not
create toast notifications, notification-style sidebar badges, or alert banners.

## Acceptance Criteria

- [ ] [AC-1] Host Monitor samples the BB server machine's CPU, RAM, root disk,
  five-minute load, uptime, configured cache directories, and Linux memory
  pressure/process diagnostics using the referenced monitor's bounded cadence
  and retention behavior.
- [ ] [AC-2] Users can select 1 hour, 6 hours, 1 day, 7 days, or 30 days and see
  historical utilization and load charts capped at 720 rendered data points,
  with collection gaps represented as gaps rather than connected lines.
- [ ] [AC-3] The panel presents four compact current-value cards, responsive
  charts, cache/directory usage and growth, and memory-pressure diagnostics in
  the referenced dense card layout on desktop and narrow/mobile widths.
- [ ] [AC-4] Host Monitor retains the `bb-plugin-host-monitor` package identity,
  `host-monitor` navigation route/title, existing branded icon/logo assets, and
  repository installation metadata.
- [ ] [AC-5] The plugin contains no toast calls, desktop/browser notification
  calls, notification-style sidebar warning accessory, or resource alert
  banner. Collection failures and unavailable readings appear only as inline
  status/error text, while threshold coloring and chart guides remain passive
  telemetry cues.
- [ ] [AC-6] The previous fleet dashboard, floating monitor, IP reveal,
  destructive process controls, and host-level worker are removed from the
  installable package and documented behavior.
- [ ] [AC-7] Settings expose CPU, RAM, and disk warning thresholds plus the
  process-attribution privacy toggle, with safe defaults and validation.
- [ ] [AC-8] Existing repository and focused plugin checks pass, including
  chart, responsive-layout, sampling, storage, identity, and no-notification
  regression coverage.

## Scope

- Adapt the referenced upstream implementation at commit
  `7a28e61f1816499cf6b9c6faca4a1f7ab4662e18` into `plugins/host-monitor`.
- Rename upstream public identifiers and visible copy to Host Monitor without
  changing this plugin's published package/repository identity.
- Update runtime dependencies, tests, README, and third-party notices for the
  adapted implementation.
- Preserve recoverable copies of the two explicitly abandoned Empirical records
  under `.empirical/abandoned/`.

## Non-goals

- Monitoring every enrolled execution host or retaining the current fleet UI.
- Remote process termination, IP-address display, or a floating overlay.
- Push notifications, browser notifications, automatic remediation, or alert
  delivery outside the panel.
- Publishing, tagging, pushing, or changing marketplace records.

## Risks

- SQLite/native dependency packaging can fail in a clean managed install.
- Platform-specific metrics may be unavailable; the UI must render em dashes
  and keep the collector alive.
- Local process attribution can expose host details and therefore stays opt-in.
- Historical sampling and process scans must remain bounded to avoid making the
  monitor itself a source of machine pressure.

## Verification

- Run the focused Host Monitor type, test, SDK-type, and production build checks.
- Run the repository-wide `npm run check` from the workspace root.
- Install and reload `./plugins/host-monitor` in BB.
- Inspect the rendered panel in a browser-sized BB surface at desktop and narrow
  widths, capture a screenshot, and confirm there are no notification surfaces.
- Search shipped source and manifest for toast/Notification/sidebar-warning
  hooks and verify none remain.

## Capability Deltas

See `deltas/host-monitor-local-history.md`.
