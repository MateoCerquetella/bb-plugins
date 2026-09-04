# Host Monitor Native Modal Navigation Fixes

## Request

> Fix and refine the current Host Monitor two-stage UX. Add passive CPU and RAM threshold indication inside the mini-modal using the existing configured threshold guides. Make Open Host Monitor transition in-app without reloading BB. Remove the Host Monitor nav page row from the main sidebar while keeping the full dedicated monitor surface reachable from the mini-modal. Improve the mini-modal and full monitor UI/UX to match BB spacing, typography, controls, focus, responsive, and interaction patterns. Preserve multi-host Grafana-style persisted per-host panels, BB machine/realtime infrastructure, notification-free behavior, and unrelated work. Verify tests, typecheck, build, live browser navigation without document reload, threshold states, no sidebar row, connected/disconnected hosts, persistence, and final diff. Stop ready for review; do not merge or deploy.

## Goal

Refine the working two-stage Host Monitor so it behaves like native BB chrome.
The bottom footer icon remains the only visible Host Monitor entry in the main
sidebar and opens the compact fleet modal. The hidden nav-panel registration
continues to own the dedicated dashboard route, while **Open Host Monitor**
activates BB's own semantic navigation row programmatically for an SPA
transition with no document reload. The mini-modal adds accessible passive CPU
and RAM threshold guides sourced from the existing fleet settings.

## Acceptance Criteria

- [ ] [AC-UI-1] [UI] The main BB sidebar shows exactly one persistent Host
  Monitor entry: the host-rendered bottom footer icon. The semantic nav-panel
  row `[data-sidebar-navigation-item="host-monitor/host-monitor"]` is hidden
  while the plugin is active and restored on content-script disposal; unrelated
  sidebar rows and ordering are unchanged.
- [ ] [AC-UI-2] [UI] Activating **Open Host Monitor** closes the mini-modal and
  invokes BB's existing nav-panel row button, producing an in-app transition to
  `/plugins/host-monitor/host-monitor` without replacing the document,
  reloading BB, or entering Settings.
- [ ] [AC-UI-3] [UI] The mini-modal reads the existing CPU and RAM guide values
  from the fleet response. Values at or above their guide receive a passive
  theme-token treatment plus explicit accessible “above guide” wording; values
  below guide, unavailable, stale, and offline states remain distinguishable
  without notification badges or alerts.
- [ ] [AC-UI-4] [UI] The mini-modal and full page use BB-native spacing,
  compact control heights, typography, borders, radii, hover/focus states,
  semantic colors, scroll containment, and responsive behavior. The modal
  remains usable at 390px and the page retains its dense Grafana-style layout.
- [ ] [AC-1] Sidebar-row suppression targets only the exact Host Monitor
  semantic wrapper, observes host remounts, never removes the node, preserves
  its prior hidden state, and disconnects/restores everything on disposal.
- [ ] [AC-2] The modal continues to use the existing bounded fleet RPC and
  visible-only coalesced polling. Threshold parsing accepts only finite 0–100
  values and untrusted text continues through safe DOM text APIs.
- [ ] [AC-3] The dedicated page preserves every BB machine, realtime/history
  behavior, and independently persisted per-host configurable panels.
- [ ] [AC-4] No toast, browser/desktop notification, alert banner, warning
  badge, IP/process feature, Settings monitor, full reload fallback, or
  draggable floating monitor is introduced.
- [ ] [AC-5] Tests and live browser evidence prove threshold presentation,
  one visible footer entry and no page row, document identity preserved across
  Open Host Monitor, dedicated page/editor behavior, connected/disconnected
  hosts, persistence, typecheck, build, workspace checks, and final diff scope.

## Scope

- Extend the mini-modal fleet projection with existing CPU/RAM thresholds.
- Add accessible passive threshold presentation and BB-native visual polish.
- Hide/restore the exact Host Monitor nav row through the content-script
  lifecycle without removing or rearranging other sidebar DOM.
- Replace hard navigation with native row activation and validate document
  identity across the transition.
- Update focused tests, browser automation, documentation, and evidence.

## Non-goals

- Removing the internal nav-panel registration or building a second full-page
  renderer; the hidden registration remains BB's route/component owner.
- Broad sidebar selectors, hiding other plugins, or permanent DOM deletion.
- Threshold notifications, badges, alert banners, automatic remediation, or
  new settings.
- Reworking fleet transport, sampling, history, dashboard persistence, or
  unrelated plugins.
- Merge, deployment, publication, tagging, or pushing.

## Risks

- BB may remount sidebar navigation; an observer must reapply only the exact
  Host Monitor wrapper and preserve cleanup semantics.
- Programmatic activation must find the actual nav-row button before closing;
  failure must remain inline rather than falling back to a document reload.
- Threshold color cannot be the sole warning signal.
- Host-owned markup can evolve, so selectors must use the stable semantic data
  attributes already present instead of utility classes or text matching.

## Verification

- Unit-test threshold parsing/tone/labels and exact nav-row discovery/state
  restoration helpers.
- Assert source absence of `location.assign`, Settings navigation, broad
  sidebar selectors, notification delivery, IP, and process controls.
- Run typecheck, all focused tests, production build, and workspace checks.
- Install/reload and use Chromium to prove: one footer action, zero visible
  Host Monitor page rows, mini-modal thresholds, close/reopen/refresh, a stable
  document marker across Open Host Monitor, dedicated page/editing, and 390px.
- Exercise connected/disconnected fixtures and per-host persistence/reload;
  inspect screenshots and final source-only diff.

## Capability Deltas

See `deltas/host-monitor-native-modal-navigation.md`.
