# Steel Browser Viewer Specification

## Purpose

Keep project-isolated Steel viewers reachable through authenticated BB Connect
without treating local browser health as proof of viewer transport readiness.

## Requirements

### Requirement: Recover missing viewer shares

Steel SHALL check the host-specific BB Connect viewer share before marking a
healthy saved binding ready, restoring a missing API share only after validating
the dedicated container. It SHALL preserve the binding, profile and sessions,
never expose CDP, and fail closed on mismatched origins or Connect errors.

#### Scenario: Healthy browser loses its viewer share

- **GIVEN** the API and CDP are healthy but the viewer share is absent
- **WHEN** readiness is checked after the short cache expires
- **THEN** the validated API port is shared on the Steel host
- **AND** the returned origin must match the saved viewer origin
- **AND** no container is restarted or profile replaced

#### Scenario: Share recovery fails

- **WHEN** container validation or BB Connect fails
- **THEN** readiness reports the failure without caching success
- **AND** a later request can retry
