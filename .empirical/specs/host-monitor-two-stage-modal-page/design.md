# Design: Host Monitor Two-Stage Modal and Page

## Recovery Boundary

Recover the old interaction architecture—not its entire implementation. The
prior code proved that `sidebarFooterAction` can dispatch a plugin-local browser
event and a content script can own an anchored modal. Rebuild that surface as a
small telemetry-only module against the current `fleet` RPC. Do not restore IP,
process, alert, notification, draggable-window, local-storage, or separate
polling-backend code.

## Registration

- `contentScripts.register("host-monitor-sidebar")` mounts the modal lifecycle.
- `sidebarFooterAction("host-monitor")` uses the old semantic `Terminal` icon
  and dispatches `host-monitor:toggle-mini-modal`.
- `navPanel("host-monitor")` restores `/plugins/host-monitor/host-monitor` and
  renders the existing `FleetDashboard`.
- Remove the dashboard `settingsSection`; Settings retains only passive
  threshold descriptors.

The public SDK has no hidden nav-panel route. The dedicated page therefore also
has BB's normal nav row, matching the earlier two-stage implementation. The
bottom icon remains the quick telemetry entry and the mini-modal is the only
surface it toggles.

## Mini-Modal Module

Add `sidebar-modal.ts` with no React dependency. The exported lifecycle accepts
`pluginId` and the content-script abort signal. It listens for the toggle event,
Escape, outside pointerdown, resize, and browser navigation. It queries only the
host-rendered footer button labelled Host Monitor to calculate a fixed anchored
position and never mutates that trigger or other BB DOM.

The modal is created with DOM APIs and text nodes only:

- `role="dialog"`, labelled heading, close button, and status region.
- Header with Host Monitor, connected/total text, and compact Refresh.
- Bounded list of every `fleet.machines` row: name, explicit state, CPU, RAM,
  and disk when a snapshot exists.
- Footer action **Open Host Monitor**.

Opening starts one immediate fleet request and a 10-second visible-only timer.
Manual/timed refreshes share one in-flight promise. Each open generation owns
an AbortController. Close aborts it, clears the interval, removes the modal, and
returns focus to the footer trigger when appropriate. Plugin disposal removes
global listeners/observer and calls close exactly once.

## RPC Boundary

POST JSON `null` to the existing local-auth fleet RPC. Parse the envelope and a
minimal bounded projection (maximum 128 machines, bounded strings, finite
percentages). Invalid/failed responses render one inline message plus Retry.
Never use `innerHTML`; use `textContent`/created nodes and bound attributes.

## Full Page

Reuse `FleetDashboard`, ECharts, dashboard configuration RPCs, SQLite layout
persistence, machine selection, history ranges, and responsive styles without
backend changes. The only full-page change is registration back to `navPanel`.

## Verification

Add parser/position/presentation tests plus registration and source-safety
assertions. Extend Chromium automation to click the footer icon, verify the
dialog and host rows, refresh, close/reopen, activate Open Host Monitor, assert
the dedicated URL and dashboard/editor, then check 390px. Run all package and
workspace checks, live reload, persistence round-trip, and isolated review.
