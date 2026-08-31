# Board Capture Delta

## MODIFIED Requirements

### Requirement: Composer-assisted create remains available

Direct board capture SHALL coexist with an optional composer-assisted drafting
flow and SHALL reuse the same validated backend create operation. The drafting
flow SHALL preflight the selected provider and start a hidden but strictly
Plan-only BB helper through structured initial command input using the
least-privileged supported permission mode. Taskboard SHALL consume the proposed
Plan as an editable issue draft, stop the helper before persistence and archive,
never resolve the provider interaction, and disclose model usage. No external
issue is created or mutated before separate user confirmation.

#### Scenario: Draft from a supported composer prompt

- **WHEN** the user invokes Taskboard from a non-empty prompt and the selected
  provider advertises Plan and `accept-edits`
- **THEN** Taskboard pins that provider and starts native Plan mode through an
  exact structured command mention rather than a plain-text or auto-approved
  prompt
- **AND** a valid proposed Plan becomes the editable draft only after the helper
  has stopped
- **AND** the provider Plan is never approved, denied, or otherwise resolved

#### Scenario: Provider or interaction is unsupported

- **WHEN** project defaults, Plan support, `accept-edits`, or the expected Plan
  interaction is unavailable
- **THEN** Taskboard stops or avoids spawning the helper and falls back to the
  original editable prompt
- **AND** it never weakens the flow to a writable auto-approved worker

#### Scenario: Repository content attempts to redirect the helper

- **WHEN** repository text conflicts with the tagged draft output contract
- **THEN** the prompt treats it only as untrusted context
- **AND** native Plan mode prevents the inspection turn from implementing it
