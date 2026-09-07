# Architecture

## Components and ownership

- The root workspace fans build, typecheck, test, and check scripts into all
  leaf plugins while keeping one lockfile and dependency installation.
- `plugins/action-topbar/lib/action-topbar.ts` owns the injected topbar strip,
  searchable Action combobox, tab reorder/close/focus behavior, and drag bridge
  into BB's experimental main-workspace split API. `server.ts` projects the
  host tab model through validated RPC without rendering pane content itself.
- `plugins/dockside/server.ts` owns Dockside RPC, filtering/deletion support,
  and project/thread data assembly. `app.tsx` owns the replacement sidebar,
  compact root/child families, navigation, status presentation, preferences,
  and multi-selection interactions.
- `plugins/save-my-model/server.ts` adapts `bb.sdk.hosts.list` and
  `bb.sdk.system.executionOptions` into a bounded typed RPC contract.
  `lib/selection.ts` reconciles stored choices with a live host catalog and
  `lib/preferences.ts` owns bounded localStorage records:
  selected provider per normalized host, model/reasoning per host and provider,
  and exact provider-scoped then matching-unscoped legacy fallback. `app.tsx`
  renders BB's controlled host-routed picker plus inspect/clear settings; it
  does not replace BB's root composer.
- `plugins/taskboard/server.ts` is the backend composition root. It wires typed
  RPC handlers, project-scoped configuration and credentials, the local cache,
  provider adapters, background sync, mentions, CLI commands, and hidden helper
  threads used for issue drafting.
- `plugins/taskboard/app.tsx` owns the BB frontend registrations and Taskboard
  UI: nav panel, full/right-panel boards, project management, List/Kanban,
  detail, composer creation, pending credential interaction, and realtime
  reconciliation.
- `plugins/taskboard/contract.ts` and companion schemas define the strict JSON
  wire model. `store.ts` owns append-only SQLite migrations and cached work.
  `sources/` contains the GitHub, Linear, and Jira adapters behind one interface.
- `browse-preferences.ts` owns the observable device-local current view;
  `filter-presets.ts` validates complete named snapshots while `store.ts` owns
  their project-scoped SQLite CRUD/order and `server.ts` exposes RPC/CLI plus
  realtime invalidation.
- `plugins/usage-tracker` is independent and owns its own server, app, provider
  usage model, compact-limit preference, tests, and assets.
- `plugins/host-monitor/server.ts` owns fleet refresh, last-good snapshots,
  thresholds, and host-targeted process orchestration. `host.ts` collects a
  strict privacy-bounded telemetry/process projection on an enrolled machine;
  `app.tsx` owns the dashboard, sidebar summary, floating monitor, inspector,
  settings, and guarded process-confirmation UI.
- The indexed plugin manifests remain workspace/build manifests; private ones are
  private. BB resolves releases from the monorepo's plugin-specific Git tags
  and the corresponding plugin subdirectory.

## Data and control flow

1. BB loads each plugin backend from its manifest's source entry and builds the
   optional frontend into its shared React/plugin runtime.
2. Action Topbar mirrors host-owned tabs in the main thread header and starts
   the experimental split-drag bridge for Action rows. BB core owns the drop
   zones, per-thread layout persistence, and Browser/Terminal/plugin pane
   rendering.
3. Dockside reads BB project/thread state through the Plugin SDK, derives each
   root/child family and semantic status, and renders the replacement thread
   list while server RPC handles guarded mutations.
4. Save My Model reads and writes plugin-versioned localStorage in the browser.
   Invalid or empty host identities collapse into one browser-wide scope;
   changing selected provider never reuses another provider's execution values.
5. Taskboard resolves the current BB project and its selected provider, then
   syncs external summaries into its plugin SQLite database. List browsing and
   mentions read the cache; item detail and comments are fetched live.
6. Frontend components call schema-validated RPC methods. Mutations update
   provider state, refresh the cache, publish an ephemeral project-scoped
   realtime invalidation, and let mounted clients refetch durable data.
7. Linear/Jira secrets are stored outside RPC-visible configuration in
   owner-only project credential files. The authenticated pending-interaction
   form is the human credential entry surface.
8. Issue creation loads provider-native metadata, sends one validated create
   request, caches the returned item, and inserts a Taskboard mention into the
   BB composer. The external provider is never written before confirmation.
9. A background service refreshes configured projects; the external tracker
   remains authoritative when cache and live state differ.
10. Named presets never auto-apply. UI application provider-checks a preset,
   atomically replaces the current project `BrowsePreferences`, and lets the
   existing observable store synchronize full/right-panel surfaces.
11. Host Monitor asks BB for enrolled hosts, samples only connected targets via
   the authenticated host-worker boundary, validates every response, and keeps
   the last good reading when a target becomes stale, fails, or disconnects.
   Process lists are fetched only for the explicitly opened host and stop
   actions require a fresh one-use confirmation plus host-side revalidation.

## External dependencies

- BB and the exact `@get-bb/plugin-sdk` version provide the host, RPC, UI,
  storage, agent, CLI, and testing contracts.
- Action Topbar additionally requires the experimental Action split-drag API
  introduced in Plugin SDK 0.4.33 and its matching BB core implementation.
- Taskboard uses Zod for runtime validation, better-sqlite3 through BB storage,
  BB-vendored UI source, Radix overlay primitives, Sonner, and Hugeicons.
- GitHub access reuses BB's official GitHub integration and the `gh` CLI;
  Linear and Jira use project-isolated API credentials.
- Runtime imports belong in leaf `dependencies`; types, test harnesses, and
  pinned build tooling belong in `devDependencies`.
- Host Monitor deliberately carries BB 0.40 / SDK 0.4.21 tooling in its own
  workspace while the older plugins retain their compatible BB 0.38 / SDK
  0.4.6 toolchains.
