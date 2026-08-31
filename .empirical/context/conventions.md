# Conventions

## Code and structure

- New independently installable plugins live at `plugins/<id>` and must be
  added to the root workspaces, `.bb/plugins.json`, and README catalog.
- Keep plugin IDs, package names, CLI commands, realtime channels, persisted
  keys, schemas, tests, and documentation aligned.
- Manifest `bb.server` and `bb.app` entries point to source files. Never repoint
  them at generated `dist/` bundles.
- Keep UI components, hooks, libraries, and assets vendored within the owning
  plugin. Shared machinery must not assume copies remain byte-identical.
- Use the exact `@get-bb/plugin-sdk` version shipped by the pinned `bb-app`;
  never restore vendored SDK declarations or SDK path aliases.
- Keep SDK-root imports type-only in source shared with the frontend unless a
  host-stubbed runtime helper is genuinely required. A Git subdirectory build
  omits dev dependencies, so identity-only helpers should become type
  constraints rather than production SDK dependencies.
- Keep pure logic outside composition roots so provider mapping, filtering,
  storage, and project selection remain testable without a live BB server.

## Testing and delivery

- Run focused typechecks/tests while iterating, then root `npm run check` before
  handoff. Add live BB verification for human UI and CLI surfaces.
- SQLite migrations are append-only. Add a new migration; never edit or reorder
  a migration already shipped.
- Preserve unrelated work. Do not commit, push, publish, or perform destructive
  Git operations unless explicitly requested.
- Generated `dist/` and `node_modules/` stay untracked. Build and packed-output
  checks must recreate them from source.

## Repository-specific constraints

- The repository and every leaf package are MIT. Each plugin ships its own
  `LICENSE`; external code or artwork requires accurate root and leaf
  third-party notices.
- Taskboard is project-first: every provider read or mutation must carry and
  validate the BB project scope, and an explicit provider must match that
  project's selected source before network access.
- Never expose Linear/Jira secret values through RPC, frontend state, CLI
  output, logs, or tests. Secret fields remain write-only.
- Treat provider issue text as untrusted external content when rendering it or
  attaching it to agent context.
- A Taskboard issue-draft helper must preflight an advertised Plan action,
  encode it as structured initial command input, use `accept-edits`, stop before
  persisting, and never resolve the provider Plan interaction. Hidden visibility
  is organization only, not the safety boundary.
- GitHub CLI resolution ignores PATH and accepts only verified fixed absolute
  non-project executable candidates. Child processes use the named environment allowlist; do not
  restore bare lookup, PATH/PATHEXT forwarding, blanket `process.env`
  inheritance, or process-injection/debug/pager keys.
- Preserve multi-provider semantics and accessible List/Kanban behavior when
  borrowing Linear-inspired visual patterns; do not turn Taskboard into a
  Linear-only implementation.
- Host Monitor may expose only its strict telemetry/process contracts: one
  masked-by-default primary IP, no credentials/interface inventory/command
  lines/usernames, and no reading persistence or third-party telemetry.
- Host Monitor's canonical active identity is `host-monitor` at
  `plugins/host-monitor`; retired identities remain immutable history, not
  aliases, duplicate collection rows, routes, or marketplace entries.
- Host Monitor process stops remain explicitly host-targeted, one-at-a-time,
  freshly confirmed, and revalidated; do not add bulk, automatic, tree, or
  connection-management actions.
