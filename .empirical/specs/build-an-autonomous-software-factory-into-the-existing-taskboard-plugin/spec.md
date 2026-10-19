# Build An Autonomous Software Factory Into The Existing Taskboard Plugin

## Request

> Build an autonomous software factory into the existing Taskboard plugin, inspired by https://github.com/lpbaril/bb-plugin-factory. Make Linear, Jira, or the configured issue provider the source of truth. The factory should continuously select eligible tickets, start and supervise BB agent work, avoid duplicate dispatch, recover after restart, and reflect progress back through the existing Taskboard provider/status model. Reuse the current taskboard architecture and keep the first implementation focused and operable.

## Goal

An explicitly enabled project factory continuously admits eligible tickets from
the project's configured issue provider and runs the existing investigation,
planning, isolated build, independent review, and bounded repair workflow without
requiring a person to press Start task on each ticket.

## Acceptance Criteria

- [ ] [AC-1] Factories are disabled by default. Project-scoped settings persist an explicit enable choice, provider identity, intake policy, and bounded concurrency.
- [ ] [AC-2] Enabled factories discover provider todo tickets, revalidate live eligibility before dispatch, and admit eligible tickets without a manual per-ticket action. Backlog, closed, canceled, previously claimed, and wrong-provider tickets are not admitted.
- [ ] [AC-3] Concurrent ticks and plugin restart cannot duplicate an admitted ticket or exceed the configured autonomous workflow capacity. Ambiguous native dispatch remains blocked rather than retried.
- [ ] [AC-4] Admitted tickets use the existing investigate, plan, build, review, and bounded repair flow with managed Build worktrees and native execution defaults. Existing manual starts continue to work.
- [ ] [AC-5] Pausing stops automatic admission and subsequent automatic stage dispatch for queue-owned work while preserving active native threads and observed progress. Provider changes, missing configuration, and failed live reads fail closed with visible status.
- [ ] [AC-6] Provider progress updates remain explicit observations. No new action merges, deploys, or closes an issue; a passed review remains awaiting human acceptance. Ticket scope and closure changes prevent subsequent automatic dispatch.
- [ ] [AC-7] CLI and RPC expose project factory settings and status with validation, and focused behavioral tests cover duplicate ticks, restart, capacity, pause, stale provider data, and failure isolation.
- [ ] [AC-UI-1] [UI] Project Manage exposes the factory controls and current state using existing Taskboard components, with desktop and mobile browser evidence.

## Scope

Taskboard factory contracts, persistence, orchestration, server integration, CLI,
project Manage controls, focused tests, browser fixture, and related README.

## Non-goals

No new issue provider, credential system, independent local task tracker,
unrestricted permission mode, automatic merge/deployment, PR lifecycle, or claim
of independently verified completion. No automatic enablement of live projects.
The first version coordinates one BB installation, not distributed claims across
independent BB servers sharing the same tracker.

## Risks

Native dispatch may succeed before its response is lost. Preserve the existing
uncertain state and human recovery path. Provider reads and local claims are not
one transaction, so revalidate live input and persist the claim before dispatch.
An active native thread is not forcibly canceled when intake is paused or ticket
scope changes. Use the native Stop control for that operation.

## Verification

Run focused controller and store tests with real SQLite and mocked external SDK
boundaries, then the Taskboard check from the workspace root. Exercise factory
settings in the existing browser fixture at desktop and mobile sizes and inspect
screenshots. Run the existing opt-in read-only native smoke where BB context is
available. Do not enable a live tracker queue as a test.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
