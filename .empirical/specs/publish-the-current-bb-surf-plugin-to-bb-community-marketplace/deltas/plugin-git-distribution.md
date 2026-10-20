# Plugin Git Distribution Delta

## ADDED Requirements

### Requirement: Publish the current BB Surf and Dockside releases

BB Surf and Dockside SHALL publish the reviewed current source through
plugin-specific Git tags. The tag version, package manifest version, GitHub
release, and BB Community compatible source range SHALL agree.

#### Scenario: Install the current BB Surf release

- **GIVEN** `steel-browser/v0.1.1` peels to the reviewed source commit
- **WHEN** BB resolves the marketplace source for `steel-browser`
- **THEN** it selects version `0.1.1` from `plugins/steel-browser`
- **AND** the installed plugin presents `BB Surf`
- **AND** the stable plugin id, storage, route, CLI, and tag prefix remain
  compatible

#### Scenario: Install the current Dockside release

- **GIVEN** `dockside/v0.1.7` peels to the reviewed source commit
- **WHEN** BB resolves the marketplace source for `dockside`
- **THEN** it selects version `0.1.7` from `plugins/dockside`
- **AND** the release includes mobile active-thread navigation

### Requirement: Keep marketplace presentation aligned with released behavior

The BB Community entry for `steel-browser` SHALL use the BB Surf display brand
while preserving its source identity. The Dockside entry SHALL mention its
released mobile navigation. Any frozen v1 field change SHALL use the
marketplace's explicit compatibility-review gate.

#### Scenario: Browse BB Surf in BB Community

- **WHEN** a user opens the `steel-browser` marketplace entry
- **THEN** the entry is named `BB Surf`
- **AND** its description and icon match the released plugin
- **AND** its Git source still uses `plugins/steel-browser` and the
  `steel-browser/` tag prefix

#### Scenario: Browse Dockside after 0.1.7

- **WHEN** a user opens the Dockside marketplace entry
- **THEN** its description includes mobile active-thread navigation
- **AND** its compatible source range resolves `dockside/v0.1.7`

### Requirement: Report repository plugins absent from BB Community

The release report SHALL compare the repository's declared installable plugin
ids with the live BB Community v2 marketplace ids and list every difference.
It SHALL mark work-in-progress and private manifests as context rather than
silently dropping them.

#### Scenario: Repository contains an unlisted work-in-progress plugin

- **WHEN** an id exists in `.bb/plugins.json` but not the live marketplace
- **THEN** the report includes that id
- **AND** it identifies work-in-progress or private status visible in the
  repository metadata
