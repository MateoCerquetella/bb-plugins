# Plugin Git Distribution Delta

## MODIFIED Requirements

### Requirement: Active Git-only install surfaces
Repository-owned marketplace plugins SHALL resolve immutable plugin-prefixed semantic-version tags whose source manifests match the selected version and current BB compatibility. Host Monitor's default-branch source SHALL contain the complete v0.1.5 released implementation. Usage Tracker's live compatible range SHALL continue resolving v0.1.8.

#### Scenario: Resolve current released plugins
- **WHEN** BB resolves Host Monitor or Usage Tracker from the Community catalog
- **THEN** the selected immutable tag contains the matching package version
- **AND** the plugin builds against its declared BB and Plugin SDK ranges

## ADDED Requirements

### Requirement: Marketplace submissions match observed behavior
Every new or changed marketplace entry SHALL describe behavior verified from its public immutable source, use a current category and vendored icon, include real screenshots for visible surfaces, and pass the marketplace's managed source validation.

#### Scenario: Submit Save My Model
- **GIVEN** the public release exposes the host-routed controlled picker flow
- **WHEN** the marketplace validates the entry
- **THEN** the description makes only observed claims
- **AND** the source, icon, screenshots, category, and author satisfy the v2 contract

### Requirement: Release approval boundary
New tags, GitHub releases, pushes, and marketplace branch updates SHALL occur only after exact approval names the authenticated account, repository, commit, package, version, source, and remote-mutating commands.

#### Scenario: Preparation completes without approval
- **WHEN** source, tests, release metadata, and marketplace artifacts are ready
- **THEN** the work stops at the approval boundary
- **AND** no remote release or marketplace state has changed
