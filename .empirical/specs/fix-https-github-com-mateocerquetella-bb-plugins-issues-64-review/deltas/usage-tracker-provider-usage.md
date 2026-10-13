# Usage Tracker Provider Usage Delta

## ADDED Requirements

### Requirement: Provider activity remains JSON-safe when attribution is incomplete

Usage Tracker MUST distinguish unknown activity by omitting `inUse`, and MUST
only emit the property when its value is a JSON boolean.

#### Scenario: Thread attribution is incomplete

- **GIVEN** BB cannot count active threads or cannot map every active provider
- **WHEN** Usage Tracker builds the `getUsage` response
- **THEN** providers not known to be active have no own `inUse` property
- **AND** the complete response round-trips through JSON serialization

#### Scenario: Activity attribution is complete

- **GIVEN** BB reports complete active and starting thread counts
- **WHEN** Usage Tracker builds the `getUsage` response
- **THEN** active providers have `inUse: true`
- **AND** inactive providers have `inUse: false`

#### Scenario: A provider is known active despite incomplete attribution

- **GIVEN** at least one provider is positively identified as active
- **AND** attribution for other providers is incomplete
- **WHEN** Usage Tracker builds the response
- **THEN** the identified provider has `inUse: true`
- **AND** unknown providers omit `inUse`
