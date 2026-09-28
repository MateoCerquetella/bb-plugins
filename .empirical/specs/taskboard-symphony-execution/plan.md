# Implementation plan

1. Add execution schemas, normalized requests, explicit engine selection, immutable approval digests, and SQLite execution/event storage. Test duplicate dispatch and restart recovery; preserve the default composer action.
2. Add the Symphony adapter and pinned upstream Taskboard tracker extension, with authenticated polling, deterministic workspace context initialization, explicit handoff, cancellation acknowledgement, runtime retries and failure reporting. Test the actual extension with deterministic fixtures.
3. Add Taskboard-owned verification of the frozen workspace revision, approved argv checks, input-based evidence reuse, human acceptance review, and linked fix iterations. Keep provider transitions inside existing Taskboard adapters and guard completion.
4. Wire SDK settings, typed RPC, HTTP routes, background reconciliation and realtime updates. Extend the existing task detail using the approved layout, retaining the default local action. Add lifecycle and UI regression tests.
5. Run Taskboard checks, workspace checks and isolated UI/runtime verification. Record evidence and limitations; review the diff, commit coherent units, and report completion truthfully. Preserve pre-existing configuration edits and do not publish or change BB core.

Rollback: execution modules and their RPC/server/UI registration can be removed together without changing existing provider adapters or local composer handoff. Retain execution database tables on rollback to preserve user records.

Verification: focused node:test contracts and failure fixtures, TypeScript check, plugin build validation, existing Taskboard regressions, pinned Symphony adapter tests, and browser user-path evidence. Scope expensive checks to changed inputs; do not claim fixture tests prove live agent behavior.
