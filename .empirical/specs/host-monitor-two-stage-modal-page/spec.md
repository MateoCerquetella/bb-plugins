# Host Monitor Two Stage Modal Page

## Request

> Restore the prior two-stage Host Monitor UX: a bottom-left BB sidebar icon opens the compact old-style machine telemetry mini-modal; an Open Host Monitor action in that mini-modal opens the dedicated Host Monitor page, never plugin Settings. The full page must retain the new dense CPU/RAM/disk/load/network multi-host UI and Grafana-like per-host configurable persisted panels, using BB machine identity/connection/realtime infrastructure. Keep notifications removed. Recover the old footer-action/content-script modal pattern where safe, preserve unrelated work, verify focused tests/typecheck/build, live connected/disconnected behavior, persistence, browser desktop/mobile UI, and stop ready for review without merge or deploy.

## Goal

Restore Host Monitor's prior two-stage navigation without restoring its old
alerts or destructive controls. The bottom sidebar icon opens a compact,
anchored telemetry mini-modal. That mini-modal summarizes every BB machine and
offers an explicit **Open Host Monitor** action. The action opens the dedicated
Host Monitor page, where the current dense multi-host dashboard and persisted
per-host Grafana-style panel editor remain available. Settings is never used as
the monitor destination.

## Acceptance Criteria

- [ ] [AC-UI-1] [UI] BB's bottom sidebar contains a host-rendered Host Monitor
  icon. Activating it toggles one compact modal anchored above the footer action
  instead of navigating to Settings.
- [ ] [AC-UI-2] [UI] The mini-modal uses BB theme tokens and old Host Monitor
  interaction patterns: title and connected/total summary, refresh control,
  compact rows for every enrolled host, textual connection/sample state, CPU,
  RAM, and disk readings where available, and explicit close behavior.
- [ ] [AC-UI-3] [UI] The mini-modal closes on its close button, Escape, outside
  pointer activation, footer toggle, plugin reload/disposal, and navigation. It
  is keyboard reachable, labelled as a dialog, and does not steal or trap focus
  after closing.
- [ ] [AC-UI-4] [UI] **Open Host Monitor** closes the mini-modal and opens the
  dedicated `/plugins/host-monitor/host-monitor` page. The full monitor never
  renders inside plugin Settings.
- [ ] [AC-UI-5] [UI] The dedicated page retains the current dense,
  reference-aligned fleet overview, current metric cards, history charts,
  system facts, responsive layout, and in-page per-host dashboard editor.
- [ ] [AC-1] The mini-modal and page both use the existing fleet RPC backed by
  `bb.sdk.hosts.list`, BB connection state, metrics-only host worker, coalesced
  sampler, history store, and realtime invalidation; no second host registry or
  transport is introduced.
- [ ] [AC-2] The mini-modal fetches a bounded fleet projection only while open,
  coalesces refreshes, sanitizes text through DOM APIs, and stops timers,
  requests, events, and owned DOM on disposal.
- [ ] [AC-3] The full page preserves independent persisted per-host panels with
  add/remove/reorder/stat/time-series/Save/Cancel behavior for connected and
  disconnected hosts.
- [ ] [AC-4] No toast, browser/desktop notification, alert banner, warning
  badge, IP reveal, process control, or floating draggable monitor is restored.
  Host and configuration failures stay inline in the mini-modal or page.
- [ ] [AC-5] Focused tests, typecheck, build, local install/reload, live
  multi-host and persistence checks, and browser tests cover icon → mini-modal →
  dedicated page plus desktop and 390px page behavior.

## Scope

- Recover the old footer action/content-script modal lifecycle pattern, reduced
  to safe fleet telemetry and navigation.
- Restore the dedicated Host Monitor `navPanel` page and remove the dashboard
  `settingsSection` destination.
- Reuse the existing fleet and dashboard configuration backend unchanged.
- Add focused lifecycle/presentation/registration/browser tests and docs.

## Non-goals

- Restoring the old notification badge, toast, alerts, IP reveal, process list,
  process termination, draggable floating window, or threshold-colored footer.
- Adding another machine registry, websocket, daemon, SSH connection, or polling
  service; the modal is a client of existing RPC/realtime state.
- Reproducing every detail of the old implementation when a smaller accessible
  modal satisfies the same workflow.
- Merge, deployment, publication, tagging, or pushing.

## Risks

- Content scripts are trusted app-shell code and must clean up every listener,
  timer, request, and node.
- The modal must find its host-rendered footer trigger without mutating unrelated
  sidebar controls and must degrade cleanly if the trigger is temporarily absent.
- The dedicated page is provided by BB's public `navPanel`; BB may also render
  its normal page row, matching the prior two-stage implementation.
- Host names and RPC errors are untrusted and must never be interpolated as HTML.

## Verification

- Unit-test fleet parsing/projection, trigger discovery, lifecycle cleanup,
  refresh coalescing, and safe DOM rendering helpers.
- Assert footer/content-script/nav-panel registration and absence of Settings,
  notifications, floating mode, IP, and process-control surfaces.
- Run Host Monitor SDK check, typecheck, full focused tests, and production build.
- Install/reload the local path and verify the sampler stays healthy.
- In Chromium, activate the bottom icon, inspect connected/disconnected host
  rows and current readings, refresh, close/reopen, use Open Host Monitor, then
  exercise machine selection and dashboard editing at desktop and 390px.
- Round-trip two hosts' configurations across reload and restore originals.
- Run workspace checks and review the final scoped diff.

## Capability Deltas

See `deltas/host-monitor-two-stage-navigation.md`.
