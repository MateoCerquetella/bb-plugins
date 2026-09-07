## Purpose

Ensure the native Touch Bar monitor remains self-healing when a BB CLI process or one of its descendants does not shut down cleanly.

## ADDED Requirements

### Requirement: Native snapshot polling recovers from transient command failure

The native app MUST bound BB CLI invocations, MUST NOT wait for stdout EOF from descendants after the invoked process exits, and MUST continue polling after failures while preserving the last good cards.

#### Scenario: Helper retains stdout after timeout

- **GIVEN** a BB command launches a helper that retains stdout
- **WHEN** the command exceeds its deadline
- **THEN** the runner returns within a bounded cleanup interval
- **AND** polling proceeds to later attempts

#### Scenario: BB becomes available again

- **GIVEN** three consecutive snapshot attempts fail after a good snapshot
- **WHEN** a later attempt succeeds
- **THEN** cards show reconnecting during the outage
- **AND** reconnecting clears with current data without restarting the app
