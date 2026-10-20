# Autonomous Taskboard factory design

## Observable outcome

An operator enables a factory for one Taskboard project and sets its maximum
automatic concurrency. Taskboard then selects live `todo` tickets from that
project's configured provider, claims each ticket once, and starts the existing
factory lifecycle without a person pressing **Start task**. The project Manage
screen and CLI show whether intake is disabled, running, paused, or blocked.
Each newly admitted ticket has one native coordinator thread. Investigation,
planning, Build, and Review are sibling child sessions beneath that coordinator.
The existing factory service owns all stage dispatch and progress decisions.

## Existing architecture

Taskboard already has the required execution path:

- `server.ts` owns provider adapters, live ticket reads, RPC handlers, and
  background services.
- `factory/service.ts` owns native BB dispatch, restart recovery, stage
  progression, review, and bounded repair.
- `factory/store.ts` persists `FactoryRecord` documents with optimistic
  versions and unique ticket identities.
- `store.ts` persists the provider-backed board cache and project connection.
- `factory/app.tsx` and the project Manage view render the existing controls.

The current source already contains provider admission, project policies, atomic
capacity reservation, and live provider reads. The coordinator extension adds a
native parent without replacing those operations. Two admission corrections
remain in scope: exclude durable claims before the bounded scan window, and
include workflow blockers in project status after a successful scan.

## Coordinator design synthesis

Candidate A stores coordinator state separately from stage runs, but adds an
agent stage-request command and durable wake delivery. Candidate B preserves
service-driven progression, but inserts the coordinator into `runs` and changes
stage selectors. Use A's separate state and B's service-driven progression.
Drop agent stage requests, wake delivery, and automatic legacy reparenting.

This matches the contract's non-goals. The coordinator is a real native thread,
the stable ticket conversation, and the user entry point. It does not investigate,
plan, implement, review, or own another workflow state machine.

### Data shape and ownership

Keep `FactoryRunKind` and `record.runs` stage-only. Add coordinator state to the
existing versioned factory document:

```ts
type FactoryCoordinator =
	| { status: 'pending' }
	| { status: 'starting'; intentId: string; startedAt: string }
	| { status: 'uncertain'; intentId: string; startedAt: string; error: string }
	| { status: 'failed'; intentId: string; startedAt: string; error: string }
	| { status: 'ready'; intentId: string; startedAt: string; threadId: string };

type CoordinatorField = FactoryCoordinator | null;
```

Implement Zod schemas and derive their TypeScript types. Missing historical
fields parse as `null`. New manual records and automatic claims explicitly
initialize `pending`. This additive field does not require a new SQLite table
or changes to the stage enum. Keep document versioning consistent with the
actual compatibility parser.

Save coordinator intent, identity, and uncertainty in the existing optimistic
versioned record. Extend the existing reverse thread index to include the ready
coordinator in the same save transaction. Reject ownership conflicts.
`factoryForThread` resolves the same ticket from its root or workers.

The coordinator consumes no additional capacity slot. Its ticket claim already
reserves capacity. Stage selectors, scope and plan digests, review acceptance,
and capacity release retain their existing meanings.

### Native creation and child dispatch

One private `ensureCoordinator` operation runs inside the existing ticket lock.
Persist `starting` with a unique intent ID before `threads.spawn`. Use project
native execution defaults and the project-default environment. Include the
ticket key and intent marker in the native title for recovery.

The pinned SDK exposes `spawn`, not a verified empty-thread creation operation.
Use a nonempty initialization prompt that identifies the ticket and requests
a short acknowledgement without repository edits, stage dispatch, or provider
transitions. Persist the returned thread ID before starting a child. A native
thread remains usable as a parent when its initialization turn finishes, fails,
or is canceled. Those outcomes are not stage results and never advance work.

Add `parentThreadId: coordinator.threadId` to each new stage spawn. Parentage
does not replace the existing authoring context or execution defaults. Build
still creates a managed worktree. Review remains an independent session in that
worktree. Bounded repairs and continuations still send to the original Build
child, with no new checkout or nested repair agent.

Validate the native parent before subsequent dispatch. A deleted, archived,
missing, or wrong-project coordinator blocks new work with a visible reason.
Observe existing workers even while the parent is unavailable. Detect an
unexpected parent on a grouped worker before reusing it; do not steal or recreate
the worker. Coordinator creation alone does not call `markInProgress`.

### Crash recovery and duplicate protection

A known preflight rejection may become `failed` and expose an explicit retry.
A transport ambiguity or restart with persisted `starting` becomes `uncertain`.
No child or replacement root starts while that state remains unresolved. A save
failure after native spawn leaves the durable starting intent as the recovery
boundary; it does not authorize another spawn.

Coordinator recovery is separate from stage recovery. Bind it to ticket identity,
expected record version, and the coordinator intent. Validate the proposed native
thread's project, unique title marker, creation window, availability, and reverse
index ownership before linking it. An invalid or ambiguous match remains blocked.
Never select an arbitrary recent thread or replace a known root automatically.

The process-local lock serializes one service's callers. The versioned save is
also an external-effect guard: only the caller that successfully persists the
starting intent may spawn. A second service sharing SQLite reloads after losing
the compare-and-swap and never proceeds with a stale draft. Prove winner-only
dispatch with two stores and service owners before claiming shared-database
duplicate protection.

### Legacy compatibility

Reading or polling a historical `coordinator: null` record does not create a
root or change native parents. Preserve stage evidence and recovery under a
visible Legacy sessions label. Explicit adoption is idempotent and uses the same
durable coordinator intent and recovery path.

Historical sessions retain their parents and workspaces. After explicit adoption,
new spawns use the coordinator parent. Repairs that reuse a historical Build
session remain visibly legacy. Do not claim those unchanged sessions are native
children. Adoption changes no scope digest, stage result, approval, or acceptance.
Completed legacy tickets remain untouched unless the operator chooses adoption.

### Ticket-first operator console

Replace the parallel ticket-team disclosure, lifecycle rail, global session
picker, run detail, and separate Empirical presentation with one console derived
from the existing `FactoryRecord`. The console has four responsibilities:

1. A current-state band shows the authoritative stage, concise status or
   blocker, and exactly one relevant primary action.
2. One stage rail shows Investigation, Plan, Build, and Review. Selecting a
   stage reveals only that stage's attempts.
3. One selected-run pane owns activity, verdict, commands, agent updates,
   changed files, bounded output, and direct native-thread navigation.
4. One workspace pane owns the plan, coordinator, and Empirical observations.
   A coordinator, provider, or Empirical condition moves into the current-state
   band only when it prevents the next action.

`TrackerDetail` keeps the canonical ticket heading, provider actions, metadata,
description, acceptance criteria, and comments. At wide widths it places that
context beside the console. At narrow widths one keyboard-accessible
Factory/Ticket switch selects the visible surface without repeating the heading.
The compact thread dialog reuses the selected-run and workspace presentation,
not the full ticket shell.

View state distinguishes following current work from explicit historical
selection:

```ts
type RunSelection =
  | { kind: 'follow-current' }
  | { kind: 'attempt'; stage: FactoryRunKind; runId: string };

type EvidenceView = 'activity' | 'result' | 'changes' | 'plan' | 'workspace';
```

Polling advances only `follow-current`. An explicit run remains selected while
it still exists; if it disappears, selection falls back to that stage's newest
attempt. The current-state band remains visible while history is inspected, so
historical evidence cannot hide a live blocker.

Keep action precedence and mutation guards inside `FactoryProgress`. Presentation
receives one derived state and the existing guarded action callbacks. Do not add
a persisted view setting, a second factory record, or a new backend contract.
Reuse `ResultCard`, `ErrorNotice`, native `details`, current focus styles, BB
tokens, and the existing diff renderer.

## Data model

### Project policy

Persist one policy per BB project in the factory store:

```ts
type FactoryProjectPolicy = {
  projectId: string;
  enabled: boolean;
  provider: WorkSource;
  intake: 'todo';
  maxConcurrent: number;
  updatedAt: string;
};
```

The schema validates external RPC, CLI, and database input. `enabled` defaults
to `false`. `intake` is fixed to `todo` in the first release. `maxConcurrent`
has a small bounded range.

The stored provider is part of the policy fingerprint. A mismatch with the
current project provider blocks intake until the operator saves a new policy.
Taskboard never silently transfers claims across providers.

### Admission origin

Extend each `FactoryRecord` with a discriminated admission value:

```ts
type FactoryAdmission =
  | { kind: 'manual' }
  | { kind: 'factory'; claimedAt: string };
```

Existing documents parse as `{ kind: 'manual' }`. Manual records retain their
current automatic stage progression. Factory-owned records additionally obey
the project intake pause and live provider revalidation rules.

### Project status

Compute status from the policy, project connection, last scan result, and
factory records:

```ts
type FactoryProjectStatus =
  | { kind: 'disabled'; policy: FactoryProjectPolicy }
  | { kind: 'running'; policy: FactoryProjectPolicy; active: number; available: number }
  | { kind: 'paused'; policy: FactoryProjectPolicy; active: number }
  | { kind: 'blocked'; policy: FactoryProjectPolicy; reason: string; active: number };
```

Persist the last scan observation so a restart does not turn a provider failure
into a healthy status before the next successful scan. The observation is
diagnostic state, not a second ticket queue.

## Admission transaction

`factory/store.ts` owns `admit(item, policy)`. One immediate SQLite transaction:

1. Reads the current policy and verifies that its fingerprint still matches.
2. Returns the existing record when the ticket identity already exists.
3. Counts capacity-consuming factory records for the project.
4. Returns `capacity` when the count reaches `maxConcurrent`.
5. Inserts a new `FactoryRecord` with `admission.kind = 'factory'`.

Only a successful insert returns an admitted record. Native dispatch starts
after the transaction commits. A crash before dispatch leaves a durable record
that the existing recovery poll can start. A lost dispatch response remains
`uncertain` and is never retried automatically.

The guarantee covers plugin processes that share this SQLite database. It does
not claim cross-installation uniqueness because Linear, Jira, GitHub, GitLab,
and Gitea do not expose one common atomic claim operation.

## Controller flow

The existing `taskboard-factory-progress` service runs one bounded admission
tick before its record poll:

1. Load enabled project policies.
2. Verify that the saved provider matches the current project connection.
3. Refresh or read a complete provider page set through the canonical Taskboard
   source path.
4. Select `todo` tickets in stable provider order, exclude durable claims, then
   apply the bounded scan window so claimed tickets cannot starve later work.
5. For each available slot, read the ticket live and recompute its scope digest.
6. Admit only tickets still in `todo` for the saved provider.
7. Establish the durable coordinator and start investigation as its child.
8. Poll all records through the current recovery and progression logic.

One project's provider failure records a blocked status for that project and
does not stop other projects. The tick applies a bounded batch and concurrency
limit so one large board cannot monopolize the service.

Before any subsequent automatic stage dispatch for a factory-owned record, the
service reads the live ticket again. A closed, canceled, missing, wrong-provider,
or scope-changed ticket sets `automationError` and starts no new stage. Active
native turns remain linked and observable.

## Pause behavior

Saving `enabled = false` has two effects:

- The controller admits no new tickets.
- Factory-owned records start no later automatic stage.

Taskboard keeps polling active native sessions and recording their output. It
does not cancel or archive a thread. Manual factory records and explicit manual
actions keep their current behavior.

## Provider progress

The existing `markInProgress` boundary remains the only provider mutation.
Taskboard calls it after native stage work starts. Failure is visible through
`trackerProgress` and does not erase the local claim. This feature adds no
merge, deployment, issue closure, or human acceptance action.

## Interfaces

Add RPC and CLI operations for:

- Reading a project's policy and computed status.
- Saving a validated project policy.
- Running one bounded scan for diagnostics and tests.
- Recovering an uncertain coordinator or explicitly adopting a legacy ticket.

The Manage screen uses the existing form, switch, numeric input, status badge,
and error patterns. It shows the configured provider, enable switch, automatic
concurrency, status, active count, and the last blocked reason. Saving an enable
choice is explicit.
A healthy provider scan does not clear ticket-level coordinator, automation,
or uncertain-stage blockers from project status.

## File ownership

- `factory/contract.ts` owns policy, admission, status, coordinator, and RPC schemas.
- `factory/store.ts` owns policy persistence, scan observations, and atomic
  admission, plus coordinator reverse indexing in its existing save transaction.
- `factory/service.ts` owns eligibility, revalidation, admission, native parent
  validation, coordinator creation, and recovery. A focused coordinator module
  may hold that lifecycle if it keeps the service cohesive, without adding a
  second scheduler or generic dispatch framework.
- `server.ts` provides canonical provider reads and schedules the tick.
- The existing CLI entry point exposes settings and status.
- `app.tsx` owns the project Manage section, ticket header, responsive
  console/context composition, narrow Factory/Ticket switch, and provider
  ticket context.
- `factory/app.tsx` remains the controller for polling, mutation guards,
  coordinator navigation, Empirical observation, selection, and recovery.
  Focused presentation components may move to `factory/console.tsx` if that
  keeps the controller below the existing file-size boundary.
- `factory.test.ts` covers store and controller behavior with real SQLite.
- Existing UI and browser fixtures cover Manage behavior and responsive layout.

## Throughput checkpoint

- **Blocking first steps.** Land schemas and the atomic real-SQLite admission
  test before provider scanning or UI.
  For the coordinator increment, prove schema compatibility and winner-only
  intent persistence before wiring native creation.
- **Independent workstreams.** Contract and store must land first. Service,
  server, CLI, UI, and docs can then use the same contract, but shared files
  serialize.
- **Shared mutable state.** SQLite is the only ownership boundary. Provider
  state remains external input, and the provider cache remains a read model.
- **Smallest safe decomposition.** One implementation owner is best because
  contract, persistence, scheduler, and UI form one behavior and share the
  factory record invariant.

## Verification

Focused tests must execute observable behavior:

- Two store connections race to admit the same ticket.
- Two store connections race for the final project slot.
- A reopened store preserves the claim and policy.
- Disabled intake admits nothing.
- Backlog, done, canceled, missing, wrong-provider, and changed-scope tickets
  start no native stage.
- One provider failure does not block another project.
- A lost native dispatch remains uncertain after later ticks.
- Manual **Start task** still creates and advances a manual record.
- Concurrent starts and automatic ticks create one coordinator and investigation
  child. Every newly spawned stage has the same actual native parent ID.
- Restart at each coordinator intent, spawn, and save boundary either preserves
  the parent or blocks uncertainty. Lost responses do not create replacements.
- Root turn completion neither advances the ticket nor releases capacity.
- Recovery rejects wrong-project, wrong-marker, unavailable, or owned threads.
- Build and Review retain their managed-worktree identities. Repair reuses the
  original Build child and retains the existing repair limit.
- Legacy reads cause no native mutation. Explicit adoption is repeatable and
  preserves historical parents, evidence, and reused Build sessions.
- Coordinator and worker reverse lookups resolve one ticket. Start opens the
  root; worker actions open their specific native sessions.
- Durable claims before the scan window do not starve eligible later tickets.
- A healthy scan does not hide a queue-owned workflow blocker in project status.
- Ticket detail renders one workflow representation, keeps the primary action in
  the first viewport, and preserves explicit historical selection across
  realtime refresh.

Run the Taskboard package check after focused tests. Install and reload the local
plugin. Use isolated browser-fixture routes for project settings, ticket detail,
and compact thread progress instead of mounting every surface in one screenshot.
Verify ticket detail at 1280, 800, and 390 px, including the Factory/Ticket
switch, stage and attempt selection, evidence tabs and disclosures, direct
thread actions, current action above the fold, long-content wrapping, keyboard
focus, selection retention, and recovery states.
Run the opt-in native smoke only where BB context is available. Inspect real
parent IDs and worktree IDs without enabling a live provider queue. Record host
limitations instead of inferring native behavior from mocks.

## Known limits

- Claims are atomic only within one shared Taskboard database.
- The concurrency setting limits factory-owned work. A deliberate manual start
  can exceed it.
- Pausing does not stop an active native turn.
- Provider completeness depends on the canonical adapter pagination behavior.
- The native host must prove that the short coordinator initialization turn and
  actual child parentage work with the pinned SDK. Empty-thread creation is not
  assumed.
- Users can change native parentage outside Taskboard. Detect conflicts before
  further grouped dispatch and expose recovery. Historical sessions remain legacy.
