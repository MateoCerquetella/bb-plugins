# Dockside Managed Marketplace Install Delta

## Purpose

Define the packaging and catalog metadata required for BB to install Dockside
reliably from its immutable monorepo release tags.

## ADDED Requirements

### Requirement: Managed Dockside releases include runtime dependencies

Each Dockside Git release SHALL declare every third-party package imported by
its runtime source under `dependencies`, keep build/test-only packages under
`devDependencies`, and carry a package version matching its immutable
`dockside/vX.Y.Z` release tag.

#### Scenario: Install Dockside through the marketplace

- **GIVEN** the marketplace resolves the newest Dockside tag in its configured
  semver range
- **WHEN** BB performs a clean managed installation of the Dockside subdirectory
- **THEN** Hugeicons, Radix Context Menu, Radix Select, `clsx`,
  `tailwind-merge`, and `zod` resolve without relying on development-only
  dependencies
- **AND** the plugin builds and loads from the selected immutable release

#### Scenario: Preserve the original Dockside release

- **WHEN** the dependency repair is released as the next patch version
- **THEN** its annotated `dockside/vX.Y.Z` tag peels to the reviewed release
  commit
- **AND** `dockside/v0.1.0` remains unchanged

### Requirement: Dockside marketplace metadata satisfies the current catalog contract

Dockside's marketplace entry SHALL declare a valid current category while
preserving its existing source, ownership, description, icon, and compatible
semver range.

#### Scenario: Validate the existing marketplace pull request

- **WHEN** marketplace pull request #162 is built and checked against the new
  Dockside release
- **THEN** the entry passes the required-category rule and managed source check
- **AND** the maintainer can repeat the managed installation review
