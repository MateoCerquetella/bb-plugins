# Usage Tracker Provider Usage Delta

## ADDED Requirements

### Requirement: Display reported provider credit usage

Usage Tracker SHALL show a localized USD used-and-limit line in an expanded
usage-window detail when BB supplies valid normalized cost data. It SHALL omit
the line when cost data is absent and SHALL NOT execute a provider CLI to obtain
it.

#### Scenario: Claude Code reports credits

- **WHEN** a Claude Code window contains `usedUsdCents` and `limitUsdCents`
- **THEN** its expanded row shows the localized used amount and limit
- **AND** its percentage, progress rail, and reset time remain visible

#### Scenario: A window has no credits

- **WHEN** BB reports a usage window with no cost object
- **THEN** the expanded row retains its existing percentage and reset content
- **AND** no placeholder or inferred dollar amount is displayed
