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

## D-002: Persist the coordinator separately and keep service-owned progression

Status: Accepted

### Evidence

The revised contract requires a visible native coordinator for each admitted
ticket, with investigation, planning, Build, and Review as children. Its non-goals
make the coordinator a stable parent and user entry point. The existing service
retains workflow authority.

Current source inspection confirms these boundaries:

- `factory/contract.ts` restricts `FactoryRunKind` to the four executable stages.
  Run fields include plan, Build, Review, event, repair, and continuation evidence.
- `factory/state.ts`, `factory/app.tsx`, and `factory/service.ts` select the last
  stage through `runs.at(-1)`. `factory/store.ts` uses the last Review result for
  capacity. A coordinator is not evidence for any of these operations.
- `factory/service.ts` already locks each ticket, saves dispatch intent before
  native work, and classifies uncertain outcomes. Its stage spawn omits native
  `parentThreadId` today.
- The same dispatch function derives execution defaults from the preceding
  author, creates a managed Build worktree, and reuses it for independent Review.
  Repair and continuation use `threads.send` in the original Build thread.
- `factory/store.ts` saves records with optimistic versions and updates native
  thread ownership inside the same SQLite transaction.
- The installed Taskboard SDK declares parentage on creation and update. It
  exposes native `threads.spawn`, not an established empty-thread creation API.
- The UI/UX consult reviewed the revised spec and grouped-ticket mockup and found
  no remaining specification blockers. It explicitly did not run browser checks.

These are source and design observations. They do not establish successful native
coordinator creation, runtime parentage, browser behavior, or race-test results.

### Options

Candidate A keeps a coordinator field outside stage runs, then adds authenticated
agent stage requests and durable wake delivery. Candidate B keeps deterministic
service progression, then represents the coordinator as another run kind.

### Chosen approach

Choose separate coordinator metadata with the existing service-owned stage chain.
This combines A's data boundary with B's authority boundary. It avoids both a
second scheduling protocol and stage-selector changes unrelated to grouping.

The coordinator is a real native thread with a short initialization turn.
Taskboard creates and supervises its workers. The prompt does not ask the root
agent to plan, edit, dispatch children, or infer ticket completion.

### Durable intent and ownership

Store `pending`, `starting`, `uncertain`, `failed`, or `ready` coordinator state
in the existing versioned ticket document. Persist a unique starting intent
before native spawn. A ready state records the parent ID. Save that ID and its
reverse index atomically before worker dispatch.

Only the caller whose compare-and-swap saves the intent may perform the native
call. A losing service reloads and respects the winner's state. The in-process
ticket lock remains useful but is not the shared-database duplicate guarantee.

A lost native response, crash during starting, or failed post-spawn persistence
blocks as uncertain. It never authorizes a replacement. Explicit recovery checks
ticket identity, expected version, intent marker, project, creation window,
availability, and existing thread ownership before linking the native parent.

Use project defaults and a nonempty prompt for coordinator creation. The SDK
signature alone is insufficient evidence for empty-input behavior. Native root
turn completion is independent of ticket stage, capacity, and acceptance.

### Preserve execution behavior and historical records

Add the ready coordinator ID as `parentThreadId` on new stage spawns. Preserve
the preceding author as execution context, Build isolation, Review independence,
and original-Build repair reuse. Parentage does not select the checkout.

Read missing coordinator fields as legacy records without native side effects.
Only an explicit adoption action creates their coordinator. Historical parents
and workspaces remain unchanged. Subsequent new workers become children, while
a reused historical Build remains visibly legacy. This gives users an honest
hierarchy without rewriting provenance, replaying work, or inventing child links.

### Rejected alternatives

- Putting the coordinator in `runs` reuses dispatch fields but forces every stage
  selector, capacity check, result view, and recovery caller to distinguish a
  parent conversation from executable evidence.
- Agent stage requests and durable wakes add authentication, delivery uncertainty,
  and another request lifecycle that the accepted non-goals do not require.
- Direct worker creation by an LLM splits workflow decisions between prompts and
  the durable service and can bypass approval or workspace constraints.
- Promoting Investigation to coordinator removes Investigation from the grouped
  workers and mixes a bounded stage transcript with the ticket conversation.
- Reusing an arbitrary context thread can group unrelated tickets together.
- Automatic legacy reparenting changes historical native organization on read or
  polling. No legacy reparent operation is included in this implementation.
- Adding the BB Workflows plugin introduces another engine and install dependency
  without improving the current service's ownership or recovery guarantees.

### Trade-offs and risks

- A separate coordinator field adds a small creation lifecycle and reverse-index
  case. It avoids borrowing stage evidence or widening every stage consumer.
- The root agent does not make autonomous scheduling decisions. The factory
  service coordinates the ticket team, which matches the current contract.
- Native creation costs one initialization turn. An active root must be proven
  usable as a parent on the installed host rather than assumed from SDK types.
- Archived, deleted, missing, or foreign-project coordinators block future stages.
  Existing child observation continues. Recovery does not silently replace roots.
- Native users may change parentage. Detect conflicts before grouped dispatch or
  worker reuse and expose the mismatch without stealing the thread.
- The duplicate guarantee covers one shared Taskboard database. Provider status
  cannot provide atomic claims across independent installations.
- Legacy adoption can leave historical root sessions alongside new children.
  Labeling those sessions accurately preserves the original Build and evidence.

### Verification

Use focused behavior tests with real SQLite for two service owners racing on one
ticket, durable coordinator indexing, reload, and every intent/spawn/save crash
window. Mock native boundaries to prove one root and one first worker, all stage
parent IDs, uncertain recovery rejection and success, root completion without
stage advancement, parent unavailability, and preserved legacy behavior.

Assert Build and Review environment identity and original-Build repair reuse.
Cover scan-window fairness and project workflow blockers so hierarchy failures
remain visible after healthy provider scans. Run Taskboard checks from the root,
install and reload the local plugin, and capture desktop/mobile browser evidence
for grouped roles, keyboard actions, retained expansion, long content, and
coordinator recovery. Where available, use the existing native smoke to inspect
actual parent IDs and workspace IDs without enabling a live queue.

No coordinator implementation, native smoke, executable test, browser check,
fresh-context implementation review, or delivery gate ran for this design edit.
