# Architecture

## Components and ownership

- The root workspace fans build, typecheck, test, and check scripts into all
  leaf plugins while keeping one lockfile and dependency installation.
- `plugins/taskboard/server.ts` is the backend composition root. It wires typed
  RPC handlers, project-scoped configuration and credentials, the local cache,
  provider adapters, background sync, mentions, and CLI commands. Taskboard has
  no model or helper-thread execution path.
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
- All three plugin manifests remain workspace/build manifests but are private.
  BB resolves releases from the monorepo's plugin-specific Git tags and the
  corresponding plugin subdirectory.

## Data and control flow

1. BB loads each plugin backend from its manifest's source entry and builds the
   optional frontend into its shared React/plugin runtime.
2. Taskboard resolves the current BB project and its selected provider, then
   syncs external summaries into its plugin SQLite database. List browsing and
   mentions read the cache; item detail and comments are fetched live.
3. Frontend components call schema-validated RPC methods. Mutations update
   provider state, refresh the cache, publish an ephemeral project-scoped
   realtime invalidation, and let mounted clients refetch durable data.
4. Linear/Jira secrets are stored outside RPC-visible configuration in
   owner-only project credential files. The authenticated pending-interaction
   form is the human credential entry surface.
5. Composer capture copies the user's prompt into editable title/description
   fields locally. Issue creation then loads provider-native metadata, sends one
   validated create request only after confirmation, caches the returned item,
   and inserts a Taskboard mention into the BB composer.
6. A background service refreshes configured projects; the external tracker
   remains authoritative when cache and live state differ.
7. Named presets never auto-apply. UI application provider-checks a preset,
   atomically replaces the current project `BrowsePreferences`, and lets the
   existing observable store synchronize full/right-panel surfaces.
8. Host Monitor asks BB for enrolled hosts, samples only connected targets via
   the authenticated host-worker boundary, validates every response, and keeps
   the last good reading when a target becomes stale, fails, or disconnects.
   Process lists are fetched only for the explicitly opened host and stop
   actions require a fresh one-use confirmation plus host-side revalidation.

## External dependencies

- BB and the exact `@get-bb/plugin-sdk` version provide the host, RPC, UI,
  storage, agent, CLI, and testing contracts.
- Taskboard uses Zod for runtime validation, better-sqlite3 through BB storage,
  BB-vendored UI source, Radix overlay primitives, Sonner, and Hugeicons.
- GitHub access reuses BB's official GitHub integration and the `gh` CLI;
  Linear and Jira use project-isolated API credentials.
- Runtime imports belong in leaf `dependencies`; types, test harnesses, and
  pinned build tooling belong in `devDependencies`.
- Host Monitor deliberately carries BB 0.40 / SDK 0.4.21 tooling in its own
  workspace while the older plugins retain their compatible BB 0.38 / SDK
  0.4.6 toolchains.
