# Touch Bar reconnect resilience

## ADDED Requirements

### Requirement: Native polling recovers after transient BB failures

The native companion MUST retain its last good snapshot while a bounded failure
streak is visible, continue polling with bounded backoff, and publish a fresh
connected snapshot automatically after BB becomes healthy. It MUST NOT create
overlapping poll loops or stop retrying permanently.

#### Scenario: Failure streak enters reconnecting state

- GIVEN a previously healthy snapshot
- WHEN three consecutive snapshot commands fail or time out
- THEN the last good cards remain available and the published state is marked
  disconnected

#### Scenario: Recovery clears reconnecting automatically

- GIVEN the store is disconnected after a failure streak
- WHEN a later retry returns valid snapshot JSON
- THEN the store resets its failure streak, publishes connected state, and
  refreshes the visible panel without user intervention

#### Scenario: Backoff remains bounded

- GIVEN repeated command failures
- WHEN the store schedules retries
- THEN retry delays remain bounded and the store uses one polling loop

## ADDED Requirements

### Requirement: Reconnect behavior is testable

The implementation MUST expose a deterministic test seam for command outcomes or
retry timing so failure, retention, backoff, and recovery are covered without a
live Mac for every unit test.

#### Scenario: Malformed output recovers

- GIVEN malformed command output followed by valid JSON
- WHEN the retry loop runs
- THEN it reaches connected state and publishes the valid cards
