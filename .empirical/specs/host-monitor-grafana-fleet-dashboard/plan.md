# Plan

1. Define a telemetry-only host/RPC contract and restore the cross-platform host
   collector without IP or process-control fields.
2. Preserve the ten existing SQLite migrations and append per-host time-series
   storage with strict per-machine retention and history bounds.
3. Replace the server-local samplers with one coalesced all-host polling service,
   independent host error/state tracking, fleet/history/sidebar RPCs, realtime
   invalidation, and passive threshold settings.
4. Build the Grafana-inspired page: ordered toolbar, searchable bounded fleet
   card region, persistent card selection, current stat tiles, system facts,
   utilization/load/network charts, explicit non-color state text, and narrow
   viewport behavior.
5. Register the neutral connected/total sidebar accessory on the existing nav
   panel; assert no content script, popup, floating, warning badge, toast,
   notification, IP, or destructive process surface returns.
6. Reconcile manifest, tsconfig, package files, README/catalog copy, lockfile,
   public-SDK scan, host/server/storage/chart/registration/responsive tests, and
   build artifacts.
7. Run focused and workspace checks, refresh Empirical context, execute the QA
   matrix, and obtain an isolated review; repair any findings.
8. Reload the installed local plugin, exercise all-machine and selected-history
   RPCs, verify every enrolled machine independently, and capture desktop and
   390px browser screenshots including the sidebar accessory.
9. Run clean-source CI and attempt capability integration without publishing,
   tagging, pushing, or marketplace mutation.
