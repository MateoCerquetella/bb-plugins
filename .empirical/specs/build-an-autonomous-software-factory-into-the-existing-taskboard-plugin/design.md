# Autonomous Taskboard factory design

## Observable outcome

An operator enables a factory for one Taskboard project and sets its maximum
automatic concurrency. Taskboard then selects live `todo` tickets from that
project's configured provider, claims each ticket once, and starts the existing
factory lifecycle without a person pressing **Start task**. The project Manage
screen and CLI show whether intake is disabled, running, paused, or blocked.

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

The missing behavior is admission. The current background factory service only
polls records that a user created through **Start task**.

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
4. Select `todo` tickets in stable provider order.
5. For each available slot, read the ticket live and recompute its scope digest.
6. Admit only tickets still in `todo` for the saved provider.
7. Start the existing investigation flow for each newly admitted record.
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
Taskboard calls it after native work starts. Failure is visible through
`trackerProgress` and does not erase the local claim. This feature adds no
merge, deployment, issue closure, or human acceptance action.

## Interfaces

Add RPC and CLI operations for:

- Reading a project's policy and computed status.
- Saving a validated project policy.
- Running one bounded scan for diagnostics and tests.

The Manage screen uses the existing form, switch, numeric input, status badge,
and error patterns. It shows the configured provider, enable switch, automatic
concurrency, status, active count, and the last blocked reason. Saving an enable
choice is explicit.

## File ownership

- `factory/contract.ts` owns policy, admission, status, and RPC schemas.
- `factory/store.ts` owns policy persistence, scan observations, and atomic
  admission.
- `factory/service.ts` owns eligibility, revalidation, and queue admission.
- `server.ts` provides canonical provider reads and schedules the tick.
- The existing CLI entry point exposes settings and status.
- `app.tsx` adds the project Manage section.
- `factory.test.ts` covers store and controller behavior with real SQLite.
- Existing UI and browser fixtures cover Manage behavior and responsive layout.

## Throughput checkpoint

- **Blocking first steps.** Land schemas and the atomic real-SQLite admission
  test before provider scanning or UI.
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

Run the Taskboard package check after focused tests. Install and reload the local
plugin. Use the existing browser fixture to save, pause, and inspect settings at
desktop and mobile widths. Run the opt-in native smoke only where BB context is
available.

## Known limits

- Claims are atomic only within one shared Taskboard database.
- The concurrency setting limits factory-owned work. A deliberate manual start
  can exceed it.
- Pausing does not stop an active native turn.
- Provider completeness depends on the canonical adapter pagination behavior.
