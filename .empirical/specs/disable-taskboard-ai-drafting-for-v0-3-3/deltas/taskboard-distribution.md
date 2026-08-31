# Taskboard Distribution Delta

## MODIFIED Requirements

### Requirement: Marketplace range alignment

The BB Community Taskboard entry SHALL reference the public Git repository,
`plugins/taskboard` subdirectory, range `^0.3.3`, and `taskboard/` tag prefix.
It SHALL vendor the content-hashed icon and describe current manual Taskboard
behavior without AI, model-usage, repository-reading, or native-Plan claims.

#### Scenario: Resolve the no-AI release

- **WHEN** `taskboard/v0.3.3` becomes public and the marketplace validates it
- **THEN** the range resolves the reviewed manual-capture release from Git
- **AND** the existing `taskboard/v0.3.2` release remains unchanged

## ADDED Requirements

### Requirement: Production-only subdirectory build

Taskboard SHALL keep the exact SDK pin development-only and use no SDK-root
frontend value import. Authoritative release verification SHALL reject product
working-tree changes, compare the consumer clone to exact HEAD commit/tree IDs,
and build without root modules or a production SDK. Overlay verification SHALL
be explicitly non-authoritative.

#### Scenario: Verify the exact committed release

- **GIVEN** the Taskboard product tree is clean
- **WHEN** the authoritative consumer probe runs
- **THEN** its clone commit/tree matches HEAD
- **AND** the production-only subdirectory build and metadata checks pass
