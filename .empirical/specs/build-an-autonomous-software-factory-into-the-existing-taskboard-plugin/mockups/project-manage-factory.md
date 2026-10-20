# Project Manage factory mockup

## Configured factory

```text
Project Manage
-----------------------------------------------------------------
Software factory                               Running

Factory enabled                               [on]
Provider             Linear / Engineering
Intake policy        Todo tickets
Concurrent workflows [ - ]  3  [ + ]
                                           [Save]

Queue                7 candidates
Active               2 of 3
Last scan            Healthy / 18 seconds ago
Blockers             None
```

Use the existing Project Manage form and status components, without a nested
card. Provider identity and intake policy are read-only summaries of the saved
configuration; intake is the existing todo-category policy, not a new rule
editor. Concurrency uses a numeric input or stepper bounded by the RPC schema.
The labeled enable switch and Save persist configuration. Turning the switch
off and saving pauses automatic admission and subsequent automatic stages.
Turning it on and saving resumes only after the existing eligibility checks.
There is no second independent pause flag.

The form shows unsaved changes until Save succeeds. A failed save leaves the
saved running state unchanged and shows the returned error next to the form.
Status values describe saved state, not the unsaved switch position.
Queue counts mean discovered candidates, not a promise of live eligibility.
Unknown queue size is `Unknown`, never zero; cached counts say `Last known`.
Active counts measure autonomous workflows against the saved capacity.

## Paused

```text
Software factory                               Paused
Factory enabled                               [off]
Provider             Linear / Engineering
Intake policy        Todo tickets
Concurrent workflows [ - ]  3  [ + ]
                                           [Save]

Queue                Last known: 7 candidates
Active               2 of 3
Last scan            Healthy / 4 minutes ago
Paused by operator
No new tickets or automatic stages will start.
```

Existing native threads remain visible and continue running. A newly configured
project with no enablement is labeled `Disabled`, with `Factory has not been
enabled` instead of implying it has previously run. Both use the same saved
off value; the distinction depends on existing workflow/scan history, not a
new setting.

## Missing configuration

```text
Software factory                               Needs configuration
Factory enabled                               [off] disabled
Provider             Not configured
Intake policy        Todo tickets
Concurrent workflows [ - ]  3  [ + ]

Configure an issue provider before enabling the factory.

Queue                Unknown
Active               0 of 3
Last scan            Never
```

Show the provider configuration section in the existing Manage flow. No
credential-entry or connection wizard is added. If configuration disappears
while enabled, preserve the saved enabled choice but show `Blocked` and
`Provider configuration missing`; disable resume and allow the operator to
turn the factory off.

## Provider error and stale data

```text
Software factory                               Blocked
Factory enabled                               [on]
Provider             Jira / Payments Platform
Intake policy        Todo tickets
Concurrent workflows [ - ]  3  [ + ]
                                           [Save]

Queue                Last known: 4 candidates
Active               1 of 3
Last scan            Failed / 2 minutes ago
Provider unavailable
Jira request timed out. Live eligibility is unconfirmed.

Blocked workflows
PAY-124              Provider status stale
                     Ticket read timed out.
```

Provider changes show `Provider changed` with saved and current provider
identities. They do not silently rebind the factory. Successful discovery does
not remove ticket blockers: `Blocked workflows` remains until each affected
workflow is actually unblocked. Each ticket identifier opens its existing
Taskboard detail, where the team and recovery controls are visible.

## Healthy idle

```text
Software factory                               Running
Queue                0 candidates
Active               0 of 3
Last scan            Healthy / 8 seconds ago
Blockers             None
```

The saved controls remain visible above these rows. Healthy idle requires a
successful scan; an error or never-scanned project cannot use this presentation.

## Narrow viewport

```text
Software factory
Blocked
----------------------------
Factory enabled         [on]

Provider
Jira / Payments Platform
Customer Operations

Intake policy
Todo tickets

Concurrent workflows
[ - ]  3  [ + ]
                      [Save]

Queue
Last known: 4 candidates
Active                 1 of 3
Last scan
Failed / 2 minutes ago

Provider unavailable
Jira request timed out.
Live eligibility is
unconfirmed.

Blocked workflows
PAY-124
Provider status stale
Ticket read timed out.
```

Long provider names, intake labels, and blocker reasons wrap. Label/value rows
stack before content can overflow. Controls keep stable hit targets, visible
focus, and accessible names; validation errors are associated with their input.
Status labels remain text so color is not the only distinction between states.
