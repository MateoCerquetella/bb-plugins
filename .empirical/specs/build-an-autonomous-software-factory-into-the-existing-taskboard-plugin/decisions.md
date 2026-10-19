# Decisions: Autonomous Taskboard factory

## D-001: Extend the existing factory with durable provider admission

Status: Accepted

### Evidence

- The current factory persists one `FactoryRecord` per project, provider, and
  locator in `factory/store.ts`.
- The current service already recovers native sessions, advances investigation
  through review, and blocks ambiguous dispatch in `factory/service.ts`.
- `server.ts` already owns live provider reads, status transitions, the factory
  background loop, and project configuration.
- The focused factory test passed before implementation with
  `node --test --experimental-strip-types plugins/taskboard/test/factory.test.ts`.
- Two independent design sketches agreed that provider tickets must remain the
  backlog and that a durable factory record must be written before dispatch.

### Options

1. Add a separate durable queue with leases and a second lifecycle.
2. Use only an in-memory scheduler lock around the existing manual start.
3. Extend the existing factory record and store with atomic project capacity
   admission.

### Chosen approach

Choose option 3. The provider remains the backlog. One SQLite transaction
reserves capacity and inserts the existing factory record before native
dispatch. The decisions below define the resulting ownership and safety rules.

#### Reuse `FactoryRecord` as the claim

Do not create a queue table with a second lifecycle. A factory admission creates
the same record that manual starts use. This keeps restart recovery and
uncertain-dispatch handling in one state machine.

#### Reserve capacity in the claim transaction

The store checks project capacity and inserts the record in one immediate SQLite
transaction. Process-local locks are insufficient because two plugin instances
can share the database.

#### Keep the provider as the source of truth

The controller lists candidate tickets and revalidates each ticket live before
admission and before later stage dispatch. The local database stores ownership,
execution evidence, and diagnostic observations. It does not copy the provider
backlog into a second task system.

#### Make enablement project-scoped and explicit

Every policy defaults to disabled. The saved provider is part of the policy.
Changing a project connection blocks the old policy until an operator saves the
new provider choice.

#### Distinguish manual and factory admission

A discriminated `admission` value identifies which records obey project pause
and queue revalidation. The existing `automatic` field continues to mean
automatic stage progression and is not overloaded with queue ownership.

#### Pause dispatch, not observation

Disabling a policy stops admission and later automatic stages for factory-owned
records. The poller still observes active threads. Taskboard does not destroy or
cancel work on a settings change.

#### Bound automatic work only

`maxConcurrent` applies to factory-owned records. Manual **Start task** remains
an explicit operator override and may exceed the automatic limit.

#### Preserve the acceptance boundary

Review success still waits for human acceptance. The controller never merges,
deploys, closes a provider ticket, or reports independent verification that did
not run.

### Rejected options

#### Separate durable queue and expiring leases

Rejected because the existing factory record already provides durable identity,
recovery, and dispatch evidence. A second queue would add reconciliation and
lease-expiry failure modes without improving the first release.

#### Use only an in-memory scheduler lock

Rejected because it loses ownership on restart and cannot coordinate two
connections to the same SQLite database.

#### Move the ticket to In progress as the claim

Rejected because provider status transitions and local dispatch are not one
transaction. A lost response could either duplicate work or strand a ticket.
The local claim commits first. Provider progress remains an explicit later
observation.

#### Automatically enable every connected project

Rejected because connecting a provider does not authorize agent work. Operators
must opt in and choose a bounded concurrency.

#### Cancel active work when paused or when scope changes

Rejected because canceling a native thread is destructive and can discard useful
work. The controller blocks the next automatic stage and exposes the reason.

### Trade-offs and risks

- SQLite uniqueness cannot coordinate independent BB installations with
  separate databases.
- A provider read can change after revalidation and before local insertion.
  Scope and state checks before later dispatch limit the effect but cannot make
  two systems transactional.
- Provider pagination must return a complete eligible set. Verification must
  exercise each canonical adapter path or record an explicit limitation.
- One large project can consume scan time. The controller uses bounded batches
  and isolates failures by project.

### Verification

The strongest practical proof combines real SQLite race tests, controller tests
with mocked provider and native SDK boundaries, the full Taskboard package
check, local plugin install and reload, and browser evidence for desktop and
mobile Manage controls. No live provider queue is enabled during verification.
