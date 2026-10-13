# Design

## Native Thread And Right Panel

Keep TrackerDetail and TaskboardRightPanel. Send to agent calls a typed native
dispatch RPC, navigates using toThread, and pins the existing panel action.
Resolve the originating item from a durable session link when the thread panel
mounts; browser state alone is insufficient. Keep the BB composer, permissions,
model selection and stop controls native.

## Durable State

Add separately named factory tables using idempotent CREATE TABLE IF NOT EXISTS,
not another numbered migration in the legacy store: installed preparation
checkouts may already have extra migrations. Key records by project, source and
locator, including GitLab. Persist versioned JSON validated by Zod with CAS
revision updates and a unique thread-link table. Keep tracker tables untouched.

Separate factory stage, run status and tracker status. Store immutable plans,
approval digests, findings, run identities, environment IDs, evidence and review.
Use explicit optimistic revisions for all mutations. Reject edits while dispatch
is in flight and invalidate approval/evidence when scope changes.

## Dispatch And Recovery

Read BB project/thread defaults and environment contracts from the pinned SDK.
Persist intent before spawn/send. Serialize per item and claim state with CAS
before external calls. Return the existing run for duplicate starts.
Uncertain API outcomes remain ambiguous, requiring reconciliation, never an
automatic retry. Retry known terminal runs with a bounded count. Link a separate
review thread without replacing the authoring session.

Consume native events by sequence, observing turn IDs and terminal outcomes.
Do not infer successful completion from idle alone. Retain actionable errors,
last observed activity and event cursor. Poll on an abortable background service
and on detail reads; reconcile persisted active sessions after restart.

## Gates

Manual policy is the default. Investigation and plan generation run in the
authoring thread. Explicit plan revision approval gates Build. Repository
instructions still apply but Taskboard adds no global Empirical requirements.
Turn completion only updates run state. Verification and review must be bound
to the plan digest and implementation revision. Human acceptance is separate
from review output; Done is separate again. No factory function calls tracker
mutations, merge or deployment APIs.

## Verification

Use pure transition tests plus SQLite persistence and typed runtime adapters.
Test duplicate calls, CAS conflicts, ambiguous dispatch, restart reconciliation,
cancellation, bounded retries, stale plan/evidence, and turn completion without
task completion. Preserve existing Taskboard tests and root checks.
Demonstrate native dispatch with a harmless synthetic item in isolated storage,
without installing over the live plugin. Browser-test the compact progress
surface using the dedicated Steel project browser.

## Reuse

Use PR #57's stable work identity, approval digest and lifecycle concepts, not
its Symphony manager or automatic provider transitions. Preserve the installed
preparation source and data; do not copy that dirty checkout over newer main.
