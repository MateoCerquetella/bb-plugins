# Design

## UI Flow

Issue detail owns one primary `Start agent` button. It checks execution
configuration: enabled execution creates and opens a native BB project thread;
disabled execution preserves the existing composer handoff. The spawned thread
receives the bounded issue handoff and an issue-targeted Taskboard panel tab.
Kanban play and in-progress transitions use the same launch function.

## Dispatch

The client suppresses overlapping launches for the same item. The server uses a
dispatch key to return the same in-flight or completed spawn result. A SQLite
native-thread link makes that idempotency durable across plugin reloads. The
record contains the dispatch key, task reference, thread ID, lifecycle state,
terminal event sequence, timestamps, and bounded reconciliation error.
Taskboard persists the link before returning success, then attaches the
issue-specific panel before the client navigates to the thread.

## Lifecycle Reconciliation

A dedicated `agent-thread-reconciliation` background service queries only
non-terminal native-thread links. For each linked thread it reads the latest
`turn/completed` event through `bb.sdk.threads.events.list`:

1. No terminal event keeps the link in `running`.
2. `completed` maps to Taskboard's internal `completed` outcome.
3. `failed` maps to `failed` and stores the platform error message when present.
4. `interrupted` maps to `canceled`.

The event sequence is the idempotency boundary. Applying the same event twice
does not rewrite the record or repeat realtime effects. Reconciliation starts
from durable unresolved records after every plugin reload, isolates errors per
thread, and races polling sleeps against the plugin abort signal so reload can
stop promptly.

Taskboard resolves provider transitions from live `statusOptions()` by
`stateCategory`, never by a hard-coded Linear/Jira/GitHub state name. After the
thread link is durable, launch moves the issue to the first available
`in_progress` option through the existing serialized `updateItemStatus` path.
Successful structured completion moves it to the first available `done`
option. Failed or interrupted outcomes do not close the issue.

The native-thread record stores separate in-progress and done transition
receipts plus the latest bounded transition error. Each reconciliation sweep
checks the receipt before calling the provider, making retries and reloads
idempotent. Missing mappings and provider failures remain retryable and are
shown in the lifecycle row. Taskboard publishes `taskboard:changed` after every
lifecycle or provider-transition change.

## Empirical Worker Contract

The native thread prompt treats tracker content as untrusted and adds a
first-class workflow instruction: inspect the target repository's `AGENTS.md`
and initialized `.empirical/config.json`; when Empirical is initialized, use
the repository-local Empirical workflow through implementation, verification,
and completion. Once Empirical returns the exact feature id, attach the
source-validated originating ticket with `empirical_tracker_bind` before
tracker preparation, synchronization, or material work, and never create a
replacement ticket. The prompt must not claim verified completion without
durable Empirical evidence. These instructions are outside the untrusted
tracker-data delimiter.

## UI Projection

Add a bounded RPC that returns the latest linked native thread for an issue.
Issue detail and the issue-specific right panel render a compact lifecycle row:
`Running`, `Completed`, `Failed`, or `Canceled`, provider transition progress
or error, and a direct `Open thread` action.

## Repository Bootstrap

`executionDefaults` accepts an explicit initialization intent from the
one-click path. For a valid unborn repository it:

1. Reads the symbolic branch name.
2. Creates an empty commit with hooks and signing disabled.
3. Does not run `git add` or otherwise modify the index/working tree.
4. Resolves the resulting `HEAD` as the exact base revision.

Normal inspection remains non-mutating when initialization is not requested.
Invalid repository errors retain field-oriented messages.

## Verification

Extend focused tests for unborn repositories, preserved working-tree state,
single-action source structure, configuration fallback, durable dispatch
guarding, terminal-event mapping, idempotent replay, restart recovery, and
abort-aware service shutdown. Add provider fixtures for in-progress/done
selection, exact-once receipts, failure retry, and failed-worker non-closure;
assert the handoff requires Empirical outside the untrusted tracker block.
Build and reload the local plugin, then inspect the live
native-thread/right-panel flow and provider status.
