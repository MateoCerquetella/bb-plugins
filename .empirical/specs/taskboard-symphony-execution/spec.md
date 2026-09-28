# Taskboard Symphony Execution

## Request

> Integrate OpenAI Symphony as an optional execution backend in the existing Taskboard BB plugin (user corrected Taskmaster to Taskboard). Keep Taskboard authoritative for routing, plans, approvals, task context, acceptance criteria, verification, and external tracker status. Preserve existing local composer handoff by default; opt-in Symphony only for delegated or explicitly structured execution. Introduce an engine-neutral normalized execution DTO and persistent execution IDs, adapter-specific state mapping, cancellation/retry/restart recovery and duplicate protection, workspace context, existing UI execution status, configuration, authoritative verification/fix cycles, and regression/failure tests. Taskboard currently has tracker adapters, SQLite cache, RPC, background sync, composer handoff, and detail UI but no execution/workflow engine; do not claim these already exist. Symphony upstream is tracker-driven and has no HTTP run mutation API; use a real tested integration without inventing APIs or changing BB core. Implement and validate in this existing isolated feature checkout; do not publish.

## Goal

Taskboard optionally delegates approved implementation work to OpenAI Symphony while remaining the authority for work scope, approval, verification, and external tracker changes. Existing users retain the current Send to agent composer handoff without configuring a backend.

## Acceptance Criteria

- [ ] [AC-1] Local handoff remains the default and uses the existing prompt/composer behavior. Direct tasks cannot implicitly select Symphony; delegated and explicitly structured routes select an execution backend independently of task size.
- [ ] [AC-2] Taskboard persists a versioned execution request containing task identity, repository/ref, route, reviewed plan, context, acceptance criteria, verification requirements, and metadata. Approval binds to the exact request; repeated dispatch and restart recovery do not create duplicate agents.
- [ ] [AC-3] The Symphony adapter operates against a pinned real OpenAI Symphony implementation using its tracker boundary. It isolates workspaces, writes a context file, preserves repository state, and supplies implementation-only agent instructions. No fictitious upstream run APIs or external-tracker mutations are used.
- [ ] [AC-4] Queued, running, blocked, retrying, failed, canceled, implementation_complete, verifying, and verified are explicit execution states. Agent completion never means tracker done. Execution IDs, workspace, agent, retries, errors, repository, branch, and available PR metadata survive Taskboard restart.
- [ ] [AC-5] Unavailable runtime, checkout/workspace failures, crashes, timeout, retry exhaustion, external cancellation, branch removal, repeated dispatch, and resumed execution have deterministic outcomes. Cancellation does not discard the workspace required for inspection or verification.
- [ ] [AC-6] Taskboard verifies the exact implementation revision against its approved requirements before allowing workflow advancement. Failure creates a fix iteration with unchanged approved scope; cached check results are reused only when their declared inputs are unchanged. Stale or missing verification cannot satisfy completion.
- [ ] [AC-7] Existing tracker adapters remain the sole writer of external status. Backend configuration is opt-in, secrets are supplied through environment/BB secret storage, and no credentials enter context files, execution records, or the UI.
- [ ] [AC-UI-1] [UI] Task details expose route, execution status, verification, workspace/agent, and Git metadata through existing Taskboard components. Disabled Symphony leaves the existing default user flow unchanged.

## Scope

Add an engine-neutral execution module inside plugins/taskboard; reuse WorkItem normalization, SQLite through BB storage, SDK HTTP routes, typed RPC, settings, background services, realtime events, existing tracker adapters, and task detail UI. Supply a narrowly scoped Symphony adapter extension and reproducible setup instructions. Add tests and run isolated BB verification before live reload.

The inspected Taskboard has no existing route planner, approval workflow, or verifier. New execution requests accept explicit reviewed scope and route; this feature does not pretend those systems already exist or invent automatic planning from issue size.

## Non-goals

No BB core modifications, new BB plugin, replacement tracker, automatic specification generation, automatic selection of structured workflows, automatic merge/deployment, or unrelated UI redesign. No changes to the default local prompt handoff.

## Risks

Symphony's reference HTTP API is observational rather than a job-submission API, so interoperability requires a version-pinned tracker extension. Remote runtime outages must not release execution identity or falsely report completion. Tracker descriptions are untrusted data. Verification must remain bound to the actual checked-out commit and approved policy, including during cancellation, resume, and fix cycles.

## Verification

Use Taskboard node:test integration fixtures for the engine contract, request normalization, persistence/restart, concurrent duplicate dispatch, state mapping, cancellation, retry/timeout/failure cases, and verification/tracker ownership. Test the Symphony adapter against its pinned runtime with a deterministic agent protocol fixture, without spending a live coding session. Run typecheck, build, existing Taskboard regression tests, and isolated BB UI/CLI verification. Record any unavailable end-to-end environment honestly.

## Capability Deltas

See deltas/taskboard-execution.md. The existing taskboard-browser and external-task-context behavior remains the compatibility baseline.
