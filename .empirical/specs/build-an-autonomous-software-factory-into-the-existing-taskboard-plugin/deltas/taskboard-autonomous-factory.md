# Taskboard autonomous factory

## Purpose

Admit ready provider tickets into Taskboard's durable native-agent workflow
without per-ticket manual starts, while keeping capacity, recovery, and human
acceptance boundaries explicit.

## ADDED Requirements

### Requirement: Explicit project factory admission

The factory MUST remain disabled until explicitly enabled for a project's
selected issue provider. It MUST discover eligible todo tickets and persist
admission before starting a native worker.

#### Scenario: An enabled project receives a ready ticket

- GIVEN a configured provider and an enabled project factory with capacity
- WHEN a previously unclaimed ticket is eligible in the live provider
- THEN Taskboard starts its investigation without a per-ticket click
- AND records the ticket identity before native dispatch.

#### Scenario: Duplicate admission and restart

- GIVEN a ticket with a durable factory claim
- WHEN concurrent ticks or a restarted service discover that ticket
- THEN no second workflow is admitted
- AND an uncertain dispatch is never automatically retried.

### Requirement: Bounded and observable automation

The factory MUST enforce its autonomous workflow capacity in code and expose
project settings and status through RPC, CLI, and project Manage.

#### Scenario: Pause during work

- GIVEN an enabled factory with a running native thread
- WHEN the operator pauses the factory
- THEN the thread remains visible and is not forcibly stopped
- AND no new queue-owned stage or ticket starts until resumed.

#### Scenario: Provider truth cannot be established

- GIVEN a factory bound to one provider configuration
- WHEN the provider changes or a live read fails
- THEN automatic dispatch stops with an observable error
- AND cached eligibility alone does not authorize a new dispatch.

### Requirement: Preserve execution and acceptance boundaries

Queue-owned tickets MUST reuse the existing managed build and independent review
workflow. Automatic processing MUST NOT merge, deploy, or close tracker tickets.

#### Scenario: Review passes

- GIVEN an implemented build and an independent passed review
- WHEN reconciliation observes the result
- THEN work remains awaiting human acceptance
- AND the ticket is not automatically closed.

#### Scenario: Ticket scope changes or closes

- GIVEN an automatically admitted ticket
- WHEN a live provider read reports changed scope or a terminal status
- THEN no subsequent automatic stage starts from the stale plan.
