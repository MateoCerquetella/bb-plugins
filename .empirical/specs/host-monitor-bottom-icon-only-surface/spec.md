# Host Monitor Bottom Icon Only Surface

## Request

> Remove Host Monitor from BB's main sidebar page rows. Keep only its bottom-left native icon. When clicked, the icon must open the full monitor surface with the dense Machine Monitor-style charts and metric cards shown in the supplied reference, while preserving multi-host selection, persisted per-host configurable metrics, BB machine/realtime infrastructure, and notification-free behavior.

## Goal

Host Monitor has exactly one persistent control in BB's main sidebar: the
native bottom-left Activity icon. Activating it uses BB's own plugin-detail
navigation and reveals the complete multi-host monitor. No Host Monitor page
row remains. The monitor follows the supplied dense Machine Monitor reference
with compact telemetry cards and full-width historical charts while retaining
the already implemented per-host dashboard editor and persistence.

## Acceptance Criteria

- [ ] [AC-UI-1] [UI] Host Monitor registers one host-rendered
  `sidebarFooterAction` with title `Host Monitor` and icon `Activity`; its run
  callback invokes the provided `openSettings()` action.
- [ ] [AC-UI-2] [UI] Host Monitor registers no `navPanel`, sidebar accessory,
  sidebar replacement, or content script, so the main BB sidebar shows no Host
  Monitor page row and preserves every other sidebar control.
- [ ] [AC-UI-3] [UI] Activating the bottom icon opens BB's native Host Monitor
  plugin detail, where a `settingsSection` renders the complete fleet overview,
  selected-host dashboard, stat cards, historical charts, system facts, and
  in-surface dashboard editor.
- [ ] [AC-UI-4] [UI] The monitor follows the supplied reference's dense visual
  hierarchy: restrained host-token surfaces, compact labels and cards,
  full-width charts at narrow widths, legible time-series summaries, and no
  horizontal overflow at 390px.
- [ ] [AC-1] The surface continues to show every BB-enrolled machine and uses
  the existing BB host roster, connection state, host worker, RPC, realtime,
  refresh coalescing, and bounded per-host history without a second registry or
  transport.
- [ ] [AC-2] Per-host panel configuration remains independently persisted and
  supports add, remove, reorder, stat/time-series selection, Cancel, and Save
  for connected or disconnected hosts.
- [ ] [AC-3] No toast, browser/desktop notification, alert banner, warning
  badge, IP reveal, process control, popup, or floating monitor is restored;
  errors remain inline in the monitor surface.
- [ ] [AC-4] Focused tests, typecheck, production build, local install/reload,
  multi-host RPC persistence, icon-only browser navigation, desktop editing,
  host switching, and 390px browser checks pass. Workspace checks are run and
  unrelated pre-existing SDK-pin failures are reported separately.

## Scope

- Remove only the Host Monitor `navPanel` and sidebar accessory registrations.
- Keep the native bottom-left action and route it through `openSettings()`.
- Render the existing dashboard as a plugin-detail `settingsSection`.
- Preserve the configurable fleet implementation and refine tests, docs, and
  repeatable browser evidence for the clarified navigation.

## Non-goals

- A DOM-injected sidebar, popup, floating window, or custom app-shell route.
- Reintroducing notifications, alerts, IP/process features, or destructive
  controls from older recoverable implementations.
- Changing BB machine identity, transport, sampling, history, persistence, or
  unrelated plugins.
- Merge, deployment, publication, tagging, or pushing.

## Risks

- The plugin-detail shell may display BB's Settings title and plugin list; that
  is host-owned navigation, while the main app sidebar remains icon-only.
- Removing `navPanel` removes its route, so every test and document must use
  the footer action rather than a stale direct plugin-panel URL.
- Compact layouts must keep the editor and charts usable within the narrower
  plugin-detail content column.

## Verification

- Assert the exact slot registrations and absence of nav-panel/accessory,
  content-script, overlay, notification, and destructive surfaces.
- Run Host Monitor typecheck, all focused tests, and production build.
- Install/reload the local plugin and confirm the service remains healthy.
- In Chromium, begin on the main app, prove one Host Monitor footer action and
  zero Host Monitor page rows, activate the icon, then exercise four-host
  rendering, Edit/Add/Cancel, host switching, and a 390px edit layout with no
  horizontal overflow. Capture sidebar, monitor, desktop editor, and mobile
  editor screenshots.
- Round-trip one host's dashboard across a real reload, prove another host is
  unchanged, and restore the original layout.
- Inspect the final diff and workspace-check failure boundary.

## Capability Deltas

See `deltas/host-monitor-bottom-icon-surface.md`.
