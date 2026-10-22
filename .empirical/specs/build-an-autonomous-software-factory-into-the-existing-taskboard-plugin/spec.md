# Build An Autonomous Software Factory Into The Existing Taskboard Plugin

## Request

> Build an autonomous software factory into the existing Taskboard plugin, inspired by https://github.com/lpbaril/bb-plugin-factory. Make Linear, Jira, or the configured issue provider the source of truth. The factory should continuously select eligible tickets, start and supervise BB agent work, avoid duplicate dispatch, recover after restart, and reflect progress back through the existing Taskboard provider/status model. Reuse the current taskboard architecture and keep the first implementation focused and operable.

## Goal

An explicitly enabled project factory continuously admits eligible tickets from
the project's configured issue provider and runs the existing investigation,
planning, isolated build, independent review, and bounded repair workflow. Each
admitted ticket has one visible coordinator thread. The stage agents appear as
children of that coordinator, so users can inspect the ticket team as one group
without requiring a person to press Start task on each ticket.

## Acceptance Criteria

- [ ] [AC-1] Factories are disabled by default. Project-scoped settings persist an explicit enable choice, provider identity, intake policy, and bounded concurrency.
- [ ] [AC-2] Enabled factories discover provider todo tickets, exclude durable claims before applying the bounded scan window, revalidate live eligibility before dispatch, and admit eligible tickets without a manual per-ticket action. Backlog, closed, canceled, previously claimed, and wrong-provider tickets are not admitted.
- [ ] [AC-3] Concurrent ticks and plugin restart cannot duplicate an admitted ticket, its coordinator, or a stage agent, and cannot exceed the configured autonomous workflow capacity. Ambiguous native dispatch remains blocked rather than retried.
- [ ] [AC-4] Each automatically admitted ticket has exactly one visible coordinator thread. Investigation, planning, Build, Review, and bounded repair sessions are native child threads of that coordinator. Build still uses a managed worktree, Review stays independent, the project's clearly selected AI or its native execution defaults remain in effect, and existing manual starts continue to work.
- [ ] [AC-5] Pausing stops automatic admission and subsequent automatic stage dispatch for queue-owned work while preserving active native threads and observed progress. Provider changes, missing configuration, failed live reads, stale eligibility, scope changes, and closure changes fail closed. Project Manage and the affected ticket group show a short operator-readable state and reason; no action dispatches from stale data.
- [ ] [AC-6] Provider progress updates remain explicit observations. No new action merges, deploys, or closes an issue; a passed review remains awaiting human acceptance. Ticket scope and closure changes prevent subsequent automatic dispatch.
- [ ] [AC-7] CLI and RPC expose project factory settings and status with validation. Project status includes queue-owned workflow blockers even after a healthy provider scan. Focused behavioral tests cover duplicate ticks, restart, capacity, pause, scan-window fairness, stale provider data, hierarchy recovery, and failure isolation.
- [ ] [AC-8] Project factory settings and the new-task dialog expose the same AI picker with provider logos and model names. The project policy persists an explicit AI choice (provider, model, reasoning level, permission mode, and service tier) or none. A new task may persist its own choice. Manual Start task, coordinator creation, and every new stage session resolve execution in order: task choice, then project policy choice, then native project defaults, passing an explicit choice as caller-explicit inputs. If none exists, the action fails with an actionable message that points to the picker. Changing a choice affects new sessions and never rewrites an existing one.
- [ ] [AC-9] Improve title & description offers Concise or Detailed rewriting and uses the AI selected for the new task or current thread for the hidden helper, falling back to project defaults only when neither has a selection. Concise returns a short actionable draft; Detailed returns a structured draft with problem, outcome, scope, acceptance criteria, and risks. The helper never changes the factory policy or the task's saved AI choice.
- [ ] [AC-UI-1] [UI] Project Manage and the new-task dialog expose the same AI picker with provider logos, model names, reasoning, permission mode, and service tier. Project Manage also exposes persisted enablement, provider identity, intake policy, bounded concurrency, pause/resume, queue and active counts, last scan result, and blockers using existing Taskboard components. Healthy idle, paused, missing-configuration, and provider-error states are distinct. Ticket detail presents one operator console with the current state and primary action first, one selectable stage rail, stage-scoped attempts, one selected-run evidence pane, and ticket context beside it on wide screens or one view switch away on narrow screens. Coordinator recovery and Empirical status live in the workspace pane and are promoted to the summary only when they block work. The ticket title, workflow, and session selection are not repeated in parallel representations. Explicit historical selection remains stable across refresh while the default selection follows current work. Long titles, provider names, blocker reasons, stage labels, and actions remain readable without horizontal overflow. Tabs, disclosures, stage controls, and thread actions are keyboard accessible with visible focus. Desktop and mobile browser evidence covers these states.

## Scope

Taskboard factory contracts, persistence, native thread hierarchy, orchestration,
server integration, CLI, project Manage controls and the new-task dialog
including the shared provider/model AI picker, Improve title & description
modes, ticket progress, focused tests, browser fixture, and related README.

## Non-goals

No new issue provider, credential system, independent local task tracker,
unrestricted permission mode, automatic merge/deployment, PR lifecycle, or claim
of independently verified completion. No automatic enablement of live projects.
The first version coordinates one BB installation, not distributed claims across
independent BB servers sharing the same tracker. The coordinator does not plan,
write code, review, or own a second workflow state machine. It is the stable
native parent and user entry point for the stage agents.

## Risks

Native dispatch may succeed before its response is lost. Preserve the existing
uncertain state and human recovery path. Provider reads and local claims are not
one transaction, so revalidate live input and persist the claim before dispatch.
An active native thread is not forcibly canceled when intake is paused or ticket
scope changes. Use the native Stop control for that operation. Creating the
coordinator is also a native dispatch. Persist its starting intent first, and
never create a replacement after an ambiguous outcome. Existing records without
a coordinator remain readable and gain one only through an explicit, idempotent
recovery path. A task-scoped AI choice must not leak into another ticket, and a
project policy change must not rewrite a task that already persisted its own
choice. The improvement helper is text-only and must not become a repository
agent.

## Verification

Run focused controller and store tests with real SQLite and mocked external SDK
boundaries, then the Taskboard check from the workspace root. Prove that a task choice overrides the project policy choice, that a saved
project choice is passed as caller-explicit execution inputs to coordinator and
stage spawns, that an unset choice falls back to project defaults, and that none
produces an actionable settings error instead of an opaque dispatch failure.
Prove that Improve title & description uses the selected task/thread AI and that
Concise and Detailed produce distinct prompt contracts.
Exercise factory settings in the existing browser fixture at desktop and mobile
sizes and inspect screenshots. Prove that one coordinator owns every new stage
child, that restart does not duplicate either level, and that a missing or
ambiguous coordinator blocks automatic dispatch. Run the existing opt-in
read-only native smoke where BB context is available. Do not enable a live
tracker queue as a test.

Browser evidence must cover Project Manage in healthy idle, paused, missing
configuration, and provider-error states, plus ticket groups blocked by stale
eligibility, scope change, and closure change. Check long titles, provider names,
and blocker reasons at narrow widths. Exercise the ticket-context switch, stage
and attempt selection, evidence tabs and disclosures, thread actions, visible
focus, and explicit historical-selection retention across data refresh. Confirm
that the primary action is visible in the first viewport and that ticket detail
contains only one workflow representation.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
