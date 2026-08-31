# Board Capture Delta

## MODIFIED Requirements

### Requirement: Composer-assisted create remains available

Direct board capture SHALL coexist with optional composer-assisted drafting and
reuse the same validated backend create operation. Drafting SHALL preflight the
project-default provider and start a hidden, strictly native-Plan helper through
structured initial command input using `accept-edits`. Taskboard SHALL accept
only the tagged JSON draft, stop before persistence, archive after stopping,
never resolve the Plan interaction, and disclose model usage. No external issue
is created or mutated before separate user confirmation.

#### Scenario: Draft from a supported composer prompt

- **WHEN** a non-empty prompt uses a provider advertising native Plan and
  `accept-edits`
- **THEN** Taskboard pins that provider and starts the exact structured Plan
  command rather than a plain-text or auto-approved prompt
- **AND** a valid proposed Plan becomes editable only after the helper stops
- **AND** the provider Plan is never approved, denied, or otherwise resolved

#### Scenario: Archive initially fails

- **WHEN** the helper stops but its hidden thread cannot be archived
- **THEN** Taskboard does not persist the draft or discard reconciliation state
- **AND** a later reconciliation can archive it and complete safely

#### Scenario: Provider or interaction is unsupported

- **WHEN** provider defaults, native Plan, `accept-edits`, or the expected Plan
  interaction is unavailable
- **THEN** Taskboard avoids or stops the helper and restores the editable prompt
- **AND** it never weakens the flow to a writable auto-approved worker
