# Plan

1. Preserve the recovered machine roster, metrics-only host worker, coalesced
   sampler, history retention, realtime invalidation, route, identity, assets,
   and notification-free boundary.
2. Add a shared bounded panel catalog and strict configuration schemas covering
   CPU, RAM, disk, load, network receive/send, uptime, stat, and time-series
   compatibility; test defaults, combinations, uniqueness, and limits.
3. Append dashboard-configuration storage keyed by BB host id; implement safe
   defaulting, validated upsert, corrupt-data fallback, per-host isolation, and
   persistence tests without modifying prior migrations.
4. Add dashboard read/save RPCs that validate inputs and confirm the host is in
   the current BB roster; test connected/disconnected hosts and reload-backed
   persistence with the official fake plugin host.
5. Refactor the selected-machine view into ordered configured panel renderers,
   reusing existing current snapshots, bounded history, chart gap handling,
   threshold guides, ECharts lifecycle, and theme tokens.
6. Add a draft-safe in-page editor with metric addition, supported
   visualization selection, removal, accessible earlier/later ordering,
   Save/Cancel, save coalescing, and inline loading/error state.
7. Register BB's host-rendered bottom-left `sidebarFooterAction`, call its
   native `openSettings()`, move the dashboard into a `settingsSection`, and
   remove the `navPanel` plus sidebar accessory while asserting no popup,
   visible overlay, DOM content script, warning badge, toast, notification, IP,
   or process action.
8. Refine responsive styling at desktop and 390px and update focused frontend,
   registration, CSS, documentation, package-file, and public-SDK tests.
9. Run Host Monitor SDK check, typecheck, tests, and production build; install
   and reload the local path, exercise multiple connected/disconnected hosts,
   configure at least two different host dashboards, reload, and capture UI and
   persistence evidence.
10. Run workspace checks, report unrelated pre-existing SDK-pin failures
    separately, refresh Empirical context, execute the verification matrix,
    obtain isolated review, repair findings, and inspect the final scoped diff.
    Stop ready for review without merge, deploy, publish, tag, or push.
