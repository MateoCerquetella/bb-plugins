## Purpose
Provide a selectable automatic router with visible, bounded per-thread model history and user-controlled colors in BB.

## ADDED Requirements

### Requirement: Selectable Jev routing
BB offers Jev routing only with an operational backend on the execution machine.

#### Scenario: Select and execute
Given Dyaus has routing configured, selecting Jev and sending a prompt reaches Jev and returns a response from a selected model.

### Requirement: Bounded per-thread history
History remains per-thread, paginated and dismissible. All model IDs have configurable colors.

#### Scenario: Close and customize
Opening history from the badge shows at most eight changes. Close hides it. Saving a model color updates the badge and survives reload.
