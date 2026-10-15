# Decisions: Improve Taskboard Ui Ux For Structured Completion Results Shown In

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The pinned SDK exposes a messageDirective slot. Factory validates final output
against Build and Review schemas. Existing recovery actions are state-owned.

### Options

Hide the old envelope in an HTML comment; encode the full result in attributes;
or use a small status directive followed by ordinary Markdown.

### Chosen approach

Use the small directive and Markdown. Share an error notice without moving
action ownership or changing state predicates.

### Trade-offs and risks

The header changes the protocol. Preserve legacy reads and reject malformed or
ambiguous headers. Avoid hidden-comment escaping and mutable-record coupling.

### Verification

Parser tests, existing Factory tests, typecheck/build, and browser inspection.

## D-002: Extend the existing run lifecycle

Status: Accepted

### Evidence

Source inspection confirms `FactoryRun` already carries thread, environment,
digests, parsed results, uncertainty, and recovery links. Two inherited design
proposals compare a new policy kernel against direct lifecycle changes.

### Options

Add a policy kernel and schema migration, persist separate handoff objects, or
extend the current lifecycle.

### Chosen approach

Extend the current lifecycle. Main stages get fresh threads and bounded
handoffs. Recovery keeps the original Build thread and managed worktree.
Count at most two automatic continuations per plan and scope from existing
run history. Keep the session selector separate from recovery ownership.

### Trade-offs and risks

Avoid a second scheduler and migration. Service complexity needs focused review.
Historical shared-thread records require newest-run-only reconciliation.
Counting all continuations can stop automation earlier but never exceeds its
bound. Exact plans stay intact while agent evidence uses bounded excerpts.

### Verification

Service tests cover fresh spawns, worktree reuse, safety stops, pagination,
live thread status, and concurrency. Browser tests cover selected navigation,
latest-run recovery, keyboard labels, and narrow layout.
