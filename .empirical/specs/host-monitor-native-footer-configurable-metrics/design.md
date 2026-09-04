# Design: Native Footer and Configurable Host Dashboards

## Existing Baseline

The recovered implementation already owns the desired telemetry path:

- `bb.sdk.hosts.list()` is the machine roster and connection-state source.
- One `bb.hosts.experimental_client()` calls the metrics-only host entry.
- The background sampler coalesces fleet and per-host refreshes.
- SQLite stores bounded per-host history and RPC returns at most 720 points.
- One realtime channel tells clients to refetch fleet/history state.
- The recovered `navPanel` renders the dashboard but also creates the sidebar
  page row the user has now explicitly rejected.

The change preserves this path and adds configuration and navigation layers; it
does not duplicate the roster, transport, worker, sampler, or realtime channel.

## Native Bottom-Icon-Only Navigation

Remove the `navPanel` and its sidebar accessory entirely. Register a
BB-host-rendered `sidebarFooterAction` using the `Activity` semantic icon and
call the action context's `openSettings()` method. Register `FleetDashboard` as
a `settingsSection` so the plugin detail becomes the full monitor surface.
This uses the portable public SDK exactly as intended and creates no injected
DOM, custom navigation, extra sidebar row, popover, portal, badge, or floating
UI while retaining native bottom-left placement.

## Dashboard Configuration Model

Add `dashboard-config.ts` as the shared catalog and normalization boundary.
Configuration version 1 contains at most twelve ordered panels. Each panel is
the unique pair of a stable metric id and one supported visualization:

- CPU, RAM, and root disk: `stat` or `timeseries`.
- Load (1/5/15), network receive, and network send: `stat` or `timeseries`.
- Uptime: `stat` only.

Duplicate metric ids, unsupported metric/visualization combinations, unknown
properties, empty dashboards, and over-limit lists fail validation. The
default remains close to the recovered overview: CPU/RAM/disk/load stats plus
utilization, load, and network time-series panels.

`contract.ts` exposes strict `dashboardConfig` and `saveDashboardConfig` RPC
methods. Both validate host ids; save validates the full configuration before
the handler. Server handlers confirm the id belongs to the current BB roster.

## Persistence

Append one migration creating `host_dashboard_configs(host_id PRIMARY KEY,
config_json, updated_at)`. `HostMonitorStore` reads, parses, validates, and
returns either the saved value or a cloned default. Invalid legacy/corrupt JSON
is ignored safely. Writes use an upsert transaction and store only validated,
bounded JSON. Keys are BB host ids; no host metadata is copied into a registry.

Database-backed storage provides persistence across backend reload/restart.
Configuration rows are retained when a host is temporarily disconnected or
absent so enrollment churn does not erase user layout choices.

## Frontend State and Editing

On selected-host change, request that host's configuration with a monotonically
increasing request token. Keep saved configuration, draft configuration, load
state, save state, and inline error separate from telemetry state. Realtime
fleet/history refetches never replace an active draft.

The machine heading gains a compact `Edit dashboard` action. Edit mode is an
in-page section immediately below the heading:

- Existing panel rows show metric label, visualization selector when multiple
  modes are supported, move-earlier/move-later controls, and remove.
- An add row lists only metrics not already configured and selects a supported
  visualization before adding.
- `Cancel` restores the last saved configuration; `Save dashboard` calls RPC.
- Save failure keeps the draft and edit mode and displays an inline status.

Outside edit mode, the selected host renders the ordered configuration through
one panel renderer. Stat panels read the current snapshot; time-series panels
map the existing history fields into the existing ECharts wrapper. Missing or
offline values render as unavailable without suppressing the host or editor.

## Native Visual Language and Accessibility

Continue using BB's host-owned plugin-detail shell and semantic theme variables. Controls
use the established 28–34px compact BB sizing, border radius, muted labels,
focus-visible ring, disabled state, and inline status treatment. No external
Grafana styles or hard-coded theme colors are introduced.

Every icon-like reorder/remove control has an accessible name. Edit mode is a
named region; save progress uses inline status text; buttons remain keyboard
operable. At narrow widths the toolbar and editor become one column, panel
controls wrap, and charts retain a bounded minimum height without horizontal
page scrolling.

## Failure and Concurrency Behavior

- Configuration request races are discarded by request token.
- Save is disabled while already saving and submits one cloned draft.
- Telemetry refresh and configuration save remain independent RPC calls.
- A host disappearing between list and save yields an inline handler error.
- Invalid stored JSON resolves to defaults and cannot reach React rendering.
- No failure emits toast, notification, badge, banner, popup, or overlay UI.

## Verification Strategy

Add pure configuration tests, store round-trip/isolation/corruption tests,
server RPC validation and reload-persistence tests, registration/navigation
tests, configured-render/edit interaction tests, and responsive source/CSS
checks. Run Host Monitor SDK/type/test/build checks, install and reload its
local path, exercise multiple connected/disconnected hosts and persistence in
the real BB page, then run workspace checks and review the scoped diff.
