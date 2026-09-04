# Host Monitor Native Footer Configurable Metrics

## Request

> Restore the most recent recoverable Host Monitor implementation, preserve unrelated work, make its UI native to BB, place its icon in the bottom-left sidebar, and extend it into a Grafana-like multi-host monitoring experience using BB machine identity, connection state, and realtime infrastructure. Add configurable per-host metrics and visualizations with persistence; verify tests, typecheck, build, connected/disconnected hosts, persistence, and final diff. Stop ready for review; do not merge or deploy.

## Goal

Recover the verified, notification-free Host Monitor fleet dashboard and make
it feel like a first-party BB page. A host-rendered icon in BB's bottom-left
sidebar footer opens the Host Monitor plugin detail as the monitor surface. It
is the only persistent Host Monitor control in BB's sidebar. The monitor continues
to use BB's enrolled-machine identity, connection state, host worker, RPC, and
realtime signal paths, while adding a Grafana-like, persisted dashboard layout
for each enrolled host. Users can add, remove, reorder, and choose supported
visualizations for that host's metrics without affecting any other host.

## Acceptance Criteria

- [ ] [AC-1] The recovered Host Monitor continues to enumerate every machine
  returned by `bb.sdk.hosts.list`, sample connected machines through the
  existing bounded `bb.hosts.experimental_client` worker, and update clients
  through the existing RPC and realtime channel; it introduces no parallel
  host registry, polling transport, or machine identity.
- [ ] [AC-2] Connected, disconnected, sampling, stale, and failed hosts remain
  independently visible, and one unavailable host does not block current data
  or configuration for any other host.
- [ ] [AC-3] Each enrolled host has a dashboard configuration containing an
  ordered, bounded list of supported metric panels. Users can add a metric,
  remove a panel, move a panel earlier or later, and select a supported stat or
  time-series visualization where that metric supports it.
- [ ] [AC-4] Dashboard configuration is validated at the RPC boundary,
  persisted by stable BB host id in the plugin database, survives plugin
  reload/restart, and remains independent between hosts. An absent or invalid
  saved configuration safely resolves to the documented default dashboard.
- [ ] [AC-5] The supported panel catalog covers current CPU, RAM, root disk,
  load, network receive/send, and uptime values, plus historical CPU, RAM,
  root disk, load, and network series already collected by Host Monitor.
- [ ] [AC-UI-1] [UI] A host-rendered Host Monitor action with the `Activity`
  icon appears in BB's bottom-left sidebar footer and uses `openSettings()` to
  open the plugin's full monitor surface. Host Monitor registers no `navPanel`,
  so no Host Monitor row appears among BB's sidebar pages.
- [ ] [AC-UI-2] [UI] The Host Monitor surface uses BB's host-owned plugin-detail
  shell and `settingsSection`, spacing, typography, color tokens, focus
  treatments, compact controls, inline status presentation, and responsive
  interaction patterns. It follows the supplied dense Machine Monitor visual
  reference without copying its branding.
- [ ] [AC-UI-3] [UI] Selecting any host keeps the user inside the page and
  renders only that host's configured panels. An in-page edit mode exposes the
  panel catalog and add/remove/reorder/visualization controls, supports cancel
  and save, communicates save progress inline, and works at desktop and 390px.
- [ ] [AC-6] No toast, Web Notification, desktop notification, alert banner,
  warning badge, process control, IP reveal, popup, or floating monitor is
  registered or rendered. Sampling and save failures remain inline in the
  monitor surface.
- [ ] [AC-7] Existing history retention, range selection, refresh coalescing,
  passive threshold guides, package identity, icon/logo assets, and
  direct Git installation coordinates remain stable.
- [ ] [AC-8] Focused tests cover native footer registration/navigation,
  notification absence, dashboard-config validation/defaulting, per-host
  persistence and isolation, reload persistence, connected/disconnected host
  presentation, configured panel rendering, editing interactions, and narrow
  layout. Host Monitor typecheck, tests, and build pass; workspace checks are
  run and any unrelated pre-existing failure is reported precisely.

## Scope

- Preserve the recovered fleet sampling, history, and page implementation.
- Add a native `sidebarFooterAction` that uses its host-provided
  `openSettings()` action and register the dashboard as a `settingsSection`.
- Remove the Host Monitor `navPanel` registration and sidebar accessory so only
  the bottom-left icon remains in the sidebar.
- Add a bounded dashboard panel catalog and strict RPC schemas.
- Add an append-only database migration and storage methods for per-host
  dashboard configuration.
- Add an in-page dashboard editor and render the selected host from its saved
  configuration.
- Update Host Monitor tests and documentation only where behavior changed.

## Non-goals

- A separate host registry, daemon, transport, or sampling protocol.
- Grafana branding, query languages, alert rules, plugins, arbitrary SQL, or
  freeform panel JSON.
- Cross-host templates, dashboard sharing/import/export, or cloud sync.
- Drag-and-drop layout, freeform sizing, or pixel-positioned panels; ordering
  uses explicit accessible controls.
- Notifications, warning badges, popup/floating monitors, process controls,
  IP addresses, remediation, or destructive machine actions.
- Refactoring unrelated plugins, updating repository-wide SDK pins, merging,
  deploying, publishing, tagging, or pushing.

## Risks

- Persisted values are untrusted and must never crash page or RPC rendering.
- A configuration edit racing with realtime telemetry must not discard the
  draft or switch the selected host.
- Disconnected hosts have no fresh samples but must remain configurable.
- The bottom-left action must use native plugin-detail navigation without
  restoring the old DOM popover/content-script behavior.
- Dense configurable panels must remain legible and operable on narrow BB
  layouts and across themes.

## Verification

- Exercise strict contract parsing and storage default/round-trip/isolation
  tests, including a fake-host lifecycle reload against the same database.
- Render the app with multiple connected and disconnected host fixtures; select
  each host, edit its panel list, save, revisit, and confirm independent state.
- Verify the footer action is host-rendered, dispatches native plugin-panel
  navigation, and neither source nor registrations contain notification,
  popup, floating, or destructive-control surfaces.
- Run Host Monitor SDK check, typecheck, focused tests, and production build.
- Install/reload the local Host Monitor path, exercise the live page at desktop
  and 390px, and capture evidence of the footer icon, multi-host states, editor,
  and persisted configuration.
- Run repository checks, distinguish task failures from unrelated pre-existing
  SDK/pin drift, and inspect the final diff for scope and generated artifacts.

## Capability Deltas

See `deltas/host-monitor-grafana-fleet.md`.
