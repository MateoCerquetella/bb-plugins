# Taskboard Empirical Live Visibility Design

## Technical approach

Extend Taskboard's existing factory progress record and panel. The factory
continues to own native BB dispatch and activity; an Empirical observer
reads the exact environment's checkout through Taskboard's host entry.
Empirical's repository overview is the source for feature phase, ownership,
revision and completion. Tracker status remains independent.

The implementation must be based on current `origin/main`, which introduced
`plugins/taskboard/factory/` after this worktree's base commit.

## Architecture decisions

### Host-scoped read-only observer

Use the published `empirical-sdd` package's `repositoryOverview` export in
`plugins/taskboard/host.ts`. Add a versioned host RPC returning a bounded,
validated snapshot. The server obtains `environmentId`, `hostId` and `path`
from BB's environment API, then calls the host matching that ID. The caller
never submits a filesystem root. Reject project/environment mismatch,
missing path, an unready environment, or a response whose canonical root is
not the selected checkout.

This uses Empirical's own parsing and safety bounds rather than duplicating
journal semantics or invoking a shell command. An uninitialized checkout is
`uninitialized`; an invalid projection is `invalid`, not an empty workflow.

### Separate observation from dispatch and acceptance

Persist the linked environment on each factory run as already implemented.
Add an optional last Empirical observation to the factory record, keyed by
environment ID and host ID. Never let a later run on a different environment
reuse that snapshot. The snapshot contains `observedAt`, source identity,
feature copies, issues, and health. It is a display projection only; no
Empirical transition or ticket closure is driven by a read.

Native `turn/completed`, review verdicts, provider status and Empirical
completion are presented as separate facts. A terminal feature remains
visible after the agent is idle, including its actual highest completion
level and closure method. A conflict or merged-but-unclosed result is an
attention state, not verified Done.

### Watch plus reconciliation

The host watcher observes `.empirical` state and selection for the linked
checkout and schedules a bounded rescan, debounced for atomic writes. A
server background service polls linked factory records and host generations
at a modest cadence, stores changed observations and publishes
`taskboard:factory` events; it also reconciles on restart. The app already
refreshes on that channel and every three seconds. A disconnected host
preserves the last snapshot but marks it stale; reconnect performs a full
read. Git worktree changes, missed watch events and watcher errors are
covered by periodic full reconciliation. The UI never calls a stale snapshot
live merely because a timer fired.

## Data flow

```
Start task -> factory run(threadId, environmentId) -> BB environment(hostId, path)
                                                  -> host Empirical overview
                                                  -> validated observation
                                                  -> factory store + realtime
                                                  -> existing progress panel
```

The host observer uses the selected checkout's exact root to select its
feature copy from the repository overview. Other copies are used only for
ownership/conflict warnings. The server does not merge same-named features
across unrelated hosts.

## Interfaces and files

| File | Change |
| --- | --- |
| `plugins/taskboard/package.json` | Add pinned Empirical runtime dependency. |
| `plugins/taskboard/host.ts` | Add read-only overview and watch-generation handlers. |
| `plugins/taskboard/factory/empirical.ts` | Normalize overview, classify freshness and completion. |
| `plugins/taskboard/factory/contract.ts` | Versioned observation schema and read RPC. |
| `plugins/taskboard/factory/service.ts` | Resolve BB environment, poll host, persist and publish changes. |
| `plugins/taskboard/factory/app.tsx` | Compact workflow section beside native progress with source/freshness labels. |
| `plugins/taskboard/test/` | Host, service, transition and UI regression tests. |
| `plugins/taskboard/scripts/` | Isolated native/browser demo fixture. |
| `plugins/taskboard/README.md` | Scope, freshness and demo instructions. |

The observation contract includes `schemaVersion`, `environmentId`,
`hostId`, `root`, `observedAt`, `health`, selected feature/copy and an array
of bounded issues. `health` distinguishes `live`, `stale`, `offline`,
`uninitialized`, `invalid` and `conflict`. It never encodes an inference
that a native turn has satisfied an Empirical gate.

## Security and failure behavior

- Do not accept arbitrary client-supplied filesystem paths. Resolve the
  project, environment, host and path server-side and route the call only
  to the owning host.
- Import Empirical's read-only projection; do not execute an agent, shell
  command, or mutation API during observation.
- Bound observation size, watch count and polling concurrency. Dispose
  watchers on plugin shutdown and when environments disappear.
- Treat repository text, feature names and error messages as untrusted
  display data. React escapes text; never inject them into prompts or HTML.
- A host call failure changes health to offline without erasing its last
  verified snapshot. Invalid schema or root mismatch shows an error and
  must not replace previously validated facts.

## Verification

1. Unit tests cover selected checkout binding, duplicate owners, invalid
   overview, terminal level, stale/offline time and no false completion.
2. A service harness exercises Start task and host observation updates
   without paid agents or tracker mutations.
3. A browser harness renders the actual factory progress component at
   desktop and narrow panel widths, advancing an isolated fixture through
   start, active, blocked, verified Done and disconnect/reconnect.
4. Run Taskboard checks and install/reload the local plugin in BB. Exercise
   the human panel and CLI. Do not claim cross-host delivery from a mock.

## Rollout and compatibility

The new record field is optional/defaulted so existing persisted factory
records load unchanged. Uninitialized repositories retain their native
Taskboard behavior. A missing Empirical package or unsupported host is a
visible unavailable state; it does not prevent Start task.

## Open questions

- Confirm current BB host watcher callback and worker lifetime against the
  pinned SDK while implementing; fall back to bounded reconciliation if the
  host cannot push a watch generation.
