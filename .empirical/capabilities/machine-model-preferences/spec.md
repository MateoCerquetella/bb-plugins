# Machine Model Preferences Specification

## Purpose

Remember execution choices per machine so users can keep different defaults on local and remote hosts.

## Requirements

### Requirement: Host-scoped provider and execution preferences
The plugin SHALL enumerate BB's enrolled machines through the public SDK and SHALL render BB's controlled provider/model/reasoning picker routed to the selected machine. A coherent picker change SHALL persist provider by host and model/reasoning by host and provider. The plugin SHALL NOT claim that these preferences override BB's built-in composer.

#### Scenario: Configure two machines
- **GIVEN** BB exposes connected host A and disconnected host B
- **WHEN** the user saves different picker values for each host
- **THEN** revisiting either host restores only its saved coherent value
- **AND** both machines retain BB's identity and connection state

#### Scenario: Reconcile an obsolete value
- **GIVEN** a stored model or provider is no longer supported by the selected host
- **WHEN** BB's controlled picker resolves that host's current catalog
- **THEN** the surface remains usable and presents a supported resolved value
- **AND** it does not send, create, or modify a thread automatically

### Requirement: Safe localStorage handling
The plugin SHALL bound and validate persisted values, migrate supported legacy values, and keep settings usable when storage is unavailable or malformed.

#### Scenario: Invalid persisted record
- **GIVEN** a malformed or oversized preference record
- **WHEN** the host configuration surface loads
- **THEN** the invalid record is ignored
- **AND** the host-owned picker remains available when its routed catalog loads

### Requirement: Native machine preference states
The settings surface SHALL visibly distinguish loading, no enrolled machines, connected, disconnected, and provider-catalog failure states using BB-native visual conventions at narrow and wide widths.

#### Scenario: Disconnected machine
- **GIVEN** an enrolled machine is disconnected
- **WHEN** the user selects it
- **THEN** the machine remains visible and identified as disconnected
- **AND** unavailable picker data does not erase its previously saved record
