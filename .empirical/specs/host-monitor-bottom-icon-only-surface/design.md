# Design: Bottom Icon Only Host Monitor Surface

## Structure

The carried implementation already contains the full fleet dashboard,
per-host configuration RPC/storage, and dense responsive presentation. The
clarified change is confined to frontend registration and its verification:

1. Register exactly one `sidebarFooterAction` named `host-monitor` with the
   semantic `Activity` icon.
2. Call the action context's `openSettings()` method; do not construct a URL or
   query BB's DOM.
3. Register `FleetDashboard` as one `settingsSection` named `monitor` with
   concise host-rendered title and description.
4. Do not register `navPanel`, `experimental_sidebarAccessory`, sidebar
   replacement, content script, app overlay, popup, or floating surface.

BB therefore owns the icon placement, tooltip, focus behavior, navigation,
plugin-detail header, scroll container, and sidebar preservation. Host Monitor
owns only the dashboard body.

## Monitor Presentation

Retain the reference-aligned hierarchy already implemented: fleet summary and
controls, compact cards for every enrolled machine, one selected-host heading,
ordered stat and time-series panels, system facts, and a page-contained editor.
Use BB semantic variables, restrained borders/radii, tabular metrics, compact
labels, textual chart summaries, and full-width charts in narrow layouts.

The plugin-detail Configuration form remains host-rendered above the monitor.
That is deliberate: passive threshold guides and the dashboard live in one BB
tool detail rather than creating another main-sidebar destination.

## Preserved Boundaries

No backend or data-plane replacement is needed. Continue using `bb.sdk.hosts`,
the existing metrics-only host worker, coalesced sampler, SQLite history,
dashboard-config table, RPC validation, realtime invalidation, and inline
failure handling. A disconnected host remains selectable and configurable.

## Verification

Static registration tests prove one footer action/settings section and no nav
panel or prohibited surface. The existing 29-test suite covers host behavior,
configuration, persistence, privacy, charts, and responsive CSS. The Chromium
script begins on BB's main app, counts one bottom action and zero page rows,
activates the icon, checks the four-host monitor, performs Edit/Add/Cancel and
host switching, then repeats the editor at 390px and captures four screenshots.
