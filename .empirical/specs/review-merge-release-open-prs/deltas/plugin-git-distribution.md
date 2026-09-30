# Plugin Git Distribution Delta

## MODIFIED Requirements

### Requirement: Dockside release documentation is source-verifiable

Dockside's user-facing README SHALL identify its immutable Git release source,
provide a working monorepo subdirectory/tag-prefix install command, and describe
its live marketplace availability accurately. New fixes SHALL be published only
through a new immutable patch tag reachable from `main`; existing tags SHALL
never be moved.

#### Scenario: Marketplace resolves the touch-actions release

- **GIVEN** the live Dockside marketplace entry uses range `^0.1.0` and tag
  prefix `dockside/`
- **WHEN** the reviewed touch-action fix is merged and released
- **THEN** the next immutable Dockside patch tag resolves through that entry
- **AND** its release commit is reachable from `main`

## ADDED Requirements

### Requirement: Aura fixes release through its live Git marketplace source

Aura fixes SHALL be published as immutable plugin-prefixed Git tags reachable
from `main`, and its live BB Community marketplace source range and tag prefix
SHALL resolve the newest compatible patch without unnecessary entry churn.

#### Scenario: Marketplace resolves the readability and caching release

- **GIVEN** the live Aura marketplace entry uses range `^0.2.1` and tag prefix
  `aura/`
- **WHEN** the reviewed composer readability, immutable image caching, and
  rendering-efficiency fixes are merged and released
- **THEN** the next Aura patch tag resolves through that entry
- **AND** the GitHub release identifies the user-visible and performance fixes
