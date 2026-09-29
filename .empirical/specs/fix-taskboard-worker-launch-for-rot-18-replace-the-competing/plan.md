# Taskboard Native Thread Reconciliation Plan

## 1. Extend lifecycle contracts and persistence

- Add a bounded native-thread lifecycle schema with `provisioning`, `running`,
  `completed`, `failed`, and `canceled` states plus nullable terminal event
  sequence and error.
- Add an idempotent SQLite table and store methods keyed by dispatch key and
  task reference. Use `CREATE TABLE IF NOT EXISTS` so existing installations
  upgrade in place.
- Add a Taskboard RPC for reading the latest link for an item, returning a
  stable thread URL/id and lifecycle projection.

## 2. Make native-thread launch durable

- In `startAgentThread`, resolve the existing durable dispatch record before
  spawning so reloads cannot create a duplicate thread.
- Spawn once, persist the link and issue reference immediately, then attach the
  issue-specific panel tab. Keep the current in-memory guard for concurrent
  calls and clean it up only after a failed launch.
- Publish a Taskboard change after persistence and retain the current navigation
  behavior.

## 3. Reconcile structured BB events

- Add a small pure mapper from `turn/completed` statuses to lifecycle states.
- Add `reconcileAgentThreads()` that lists unresolved links, reads bounded
  `turn/completed` events in descending order, and applies the newest event
  idempotently using its sequence.
- Register an abort-aware `agent-thread-reconciliation` background service with
  bounded polling and per-link error isolation.
- Never call provider adapters or infer state from assistant prose.

## 4. Project lifecycle state in the UI

- Load the linked-thread projection alongside item detail and refresh it on
  `taskboard:changed`.
- Render one compact lifecycle row with accessible state text and an `Open
  thread` action; keep provider status visually and semantically separate.
- Cover running, completed, failed, canceled, missing-link, and navigation
  states in source/UI tests.

## 5. Verify and activate

- Add focused store, mapper, reconciliation, restart/idempotency, and service
  shutdown tests.
- Run Taskboard typecheck, focused tests, build, and artifact verification.
- Install and reload the local plugin, confirm both reconciliation and existing
  execution services are running, then inspect the live right-panel flow.

## 6. Reconcile provider state and require Empirical

- Extend the durable native-thread record with in-progress/done transition
  receipts and a retryable provider error.
- Resolve provider-native status IDs from live options by normalized
  `in_progress` and `done` categories.
- Apply the in-progress transition after durable thread provisioning and the
  done transition only after structured successful completion; never close
  failed or interrupted work.
- Put the repository-local Empirical requirement in trusted worker prompt text
  outside the untrusted tracker-data delimiter.
- Add exact-once, reload, provider failure, missing mapping, unsuccessful worker,
  prompt-boundary, and lifecycle UI regressions.

1. Extend execution defaults and RPC input with explicit initial-repository
   bootstrap, using an empty commit and preserving all working-tree content.
2. Replace issue-detail `Send to agent` plus embedded `Execute` with one
   configuration-aware `Start agent` action that reuses Worker routing.
3. Keep Kanban play and drag-to-in-progress wired to the Worker route, and
   refine Worker loading/error copy.
4. Add focused regression tests for repository bootstrap, single action,
   disabled-execution fallback, and at-most-once dispatch.
5. Run Taskboard verification, fresh-context review, build/install/reload, and
   inspect live service/UI state.
