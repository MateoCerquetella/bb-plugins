# Taskboard Distribution Delta

## MODIFIED Requirements

### Requirement: Marketplace range alignment

The BB Community Taskboard entry SHALL reference the public Git repository,
`plugins/taskboard` subdirectory, range `^0.3.3`, and `taskboard/` tag prefix so
the first selectable release contains the production-install, Plan-helper, and
GitHub CLI review fixes without rewriting the existing `0.3.2` release. The
entry SHALL vendor its content-hashed icon and disclose optional
repository-aware AI drafting and model usage.

#### Scenario: Resolve the superseding marketplace release

- **WHEN** the marketplace validates Taskboard after `taskboard/v0.3.3` is public
- **THEN** it resolves the immutable reviewed patch from the public repository
- **AND** installs from Git without relying on npm publication
- **AND** the earlier `taskboard/v0.3.2` tag remains unchanged

## ADDED Requirements

### Requirement: Production-only subdirectory build

Taskboard SHALL keep the exact compatible `@get-bb/plugin-sdk` pin as
development-only build and type tooling and SHALL use only type-erased SDK-root
imports in its frontend source graph. A Git subdirectory install with
development and optional dependencies omitted SHALL build both plugin bundles
without the SDK package present.

#### Scenario: Build from a clean Git source install

- **GIVEN** a clean source checkout with no monorepo-level dependencies
- **WHEN** production-only dependencies install in `plugins/taskboard` and BB
  builds the plugin there
- **THEN** no runtime SDK-root import needs resolution
- **AND** frontend and backend bundles build without a production SDK install
