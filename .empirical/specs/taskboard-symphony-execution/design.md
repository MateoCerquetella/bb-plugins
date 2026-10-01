# Optional Symphony execution in Taskboard

Taskboard publishes approved execution work. OpenAI Symphony consumes it through a dedicated tracker adapter and supervises the coding agent. Taskboard verifies the returned implementation and remains the only component allowed to update the real issue tracker.

Status: implementation design; the user approved the UI mockup with “go”.

## Existing boundaries

| Existing code | Reuse |
| --- | --- |
| `contract.ts` | WorkItem identity and external-data escaping; extend typed RPC with execution DTOs |
| `composer-handoff.ts`, task detail in `app.tsx` | Preserve default Send to agent and composer mention behavior |
| `store.ts` | Plugin SQLite database and durable migrations |
| `sources/{github,linear,jira}.ts` | Sole external tracker read/write adapters |
| `server.ts` | Project validation, mutation serialization, realtime publication, background lifecycle |
| BB SDK 0.4.6 | Typed RPC, authenticated HTTP routes, plugin settings, storage, background services, host file access, thread lifecycle |

Taskboard currently has no planner, router, plan approval system, execution manager, or verifier. The implementation must add an explicit execution contract without claiming to preserve nonexistent policy. Route and reviewed plan come from the user or an authorized caller; task size does not infer structured work.

## Execution boundary

Keep implementation modules under `plugins/taskboard/execution/`, with engine-specific code under `engines/local/` and `engines/symphony/`. The local adapter preserves the existing composer handoff. Represent that handoff honestly; opening a composer does not prove an agent started or completed work.

A managed execution request contains a schema version, execution ID, task identity scoped by BB project/source/locator, title, description, repository, branch, pinned base revision, route, plan, project context, acceptance criteria, verification requirements, and bounded metadata. Preserve an explicit distinction between trusted approved scope and untrusted external issue content. Approval records the request digest; a changed plan, repository, route, or verification policy invalidates that approval.

Persist requests before exposing them for dispatch. A unique key binds task identity, approved request revision, and fix iteration. Repeated starts return the same execution; runtime retries keep the same identity. Fix iterations receive a new identity linked to the prior attempt. Terminal execution records remain available for status and audit.

## Real Symphony integration

Research baseline: OpenAI Symphony commit `be10a1b79df723d6d7612b5651c8522704dafb2e`.

The reference service exposes `GET /api/v1/state`, `GET /api/v1/:issue_identifier`, and `POST /api/v1/refresh`. These are observation and refresh endpoints, not a start/stop/resume API. Its `SymphonyElixir.Tracker` behaviour provides `fetch_issues_by_states`, `fetch_issues_by_ids`, optional agent tools, configuration validation, and secret-environment filtering. The tracker registry is currently a fixed module map.

Supply a narrow, version-pinned downstream `taskboard` tracker extension, with a reproducible setup patch adding the adapter to that registry. Do not impersonate Linear, run on the test-only memory tracker, or implement a second scheduler. The extension reads only Taskboard's approved execution queue over the SDK's authenticated plugin HTTP routes. It has no external tracker credentials or provider-native mutation tools.

Taskboard start/resume publishes an eligible execution state; stop makes that execution ineligible and requests reconciliation. Symphony owns polling, concurrency, workspace creation, agent lifecycle, recovery backoff, and runtime event reporting. Canceled and implementation-complete states are inactive, non-cleanup handoff states so verification retains its workspace. Confirm actual agent stop separately from cancellation intent.

Workspace initialization must use the normalized repository/ref and pinned base revision, verify branch availability, and write `.taskboard/execution-context.json`. Reuse existing checked-out state on recovery rather than resetting it. Generated instructions require approved scope, local validation, and return to Taskboard. Completion is an explicit structured implementation handoff; a successful Codex turn or exhausted turn count is not sufficient proof. Runtime tokens must be stripped from the coding agent environment and excluded from context files.

The extension is an architectural tradeoff: OpenAI Symphony currently lacks a public custom-tracker loading mechanism and submission API. Pin compatibility, test the adapter against the actual runtime, and fail setup when the patch no longer applies. No BB core changes are needed for the plugin boundary.

## State and verification

| Runtime fact | Taskboard execution state |
| --- | --- |
| Approved and eligible | queued |
| Agent running | running |
| Recoverable runtime failure with retry scheduled | retrying |
| Required human input | blocked |
| Retry budget exhausted / unrecoverable setup failure | failed |
| Cancellation acknowledged | canceled |
| Explicit implementation handoff | implementation_complete |
| Taskboard checks in progress | verifying |
| Required checks and acceptance review passed for the exact revision | verified |

The Taskboard verifier must synchronize and identify the actual implementation revision before running approved checks. Agent-reported success cannot satisfy verification. Bind evidence to the approved request digest, revision, check definition, and declared input digest; reuse expensive evidence only when all those relevant inputs remain valid. Checks whose inputs are not declared conservatively invalidate on any revision change. Verification failure creates a fix request retaining the original approved scope plus failure feedback. It does not silently rewrite the plan or weaken checks.

A verified run permits a Taskboard-owned tracker transition through the existing adapter and provider-native statuses. It does not invent a universal Done status or auto-merge a PR. External cancellation removes dispatch eligibility and cancels runtime work without interpreting a transport error as cancellation success.

## UI and configuration

Default users retain Send to agent. Enabled projects can review explicit execution scope and execute from task details. Show execution and verification separately from the issue's provider status. Put backend, workspace, agent, execution identity, retries, errors, branch, and PR under existing detail disclosures. Reuse current Taskboard components and theme variables.

Configuration defaults to local and Symphony disabled. Include runtime endpoint, project/instance binding, concurrency, retry/timeout settings, and environment-backed authentication. Snapshot backend identity on each run so a settings change cannot accidentally reconnect an old run to a different runtime. Secret values never appear in a DTO or UI response.

## Reviewable implementation units

1. Execution DTO, local compatibility adapter, durable records, approval binding, and idempotency tests.
2. Symphony tracker extension, reproducible pinned setup, workspace context, lifecycle/state mapping, and real-runtime fixture tests.
3. Taskboard verification, restart/cancellation reconciliation, fix iterations, and tracker-boundary tests.
4. Existing detail UI/RPC/configuration integration, documentation, and isolated BB verification.

Each unit includes its tests and can be reverted together with its registration points. Retain the existing local handoff throughout. Do not represent fixture-only results as a live Symphony coding run.

## Verification environment findings

Dependencies were installed with `npm ci --ignore-scripts`; native build steps remain for test setup. The fork uses npm workspace scripts and has no `bun run dev` or `dev:instance` aliases from the original upstream checkout. The isolated verification harness must be adapted to this actual branch before plugin changes are tested or reloaded. Elixir/Mix are absent on this host, so real Symphony fixture verification also needs a runtime toolchain. Neither limitation is an implementation result.
