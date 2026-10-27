# Bb Surf Marketplace Listing Specification

## Purpose

Keep the BB Community marketplace listing aligned with the BB Surf rename and
the violet BB Plugins visual identity.

## Requirements

### Requirement: BB Surf marketplace entry

The `steel-browser` marketplace entry SHALL keep its plugin ID, Git source
subdirectory, compatible semver range, and `BB Surf` display name while
referencing a violet BB Surf icon. Changing the icon SHALL follow the catalog's
content-addressed asset convention and pass the marketplace build.

#### Scenario: Browse BB Surf in the marketplace

- **GIVEN** the marketplace catalog is built from the updated entry
- **WHEN** a user finds BB Surf in the BB Community marketplace
- **THEN** the listing reads **BB Surf**
- **AND** its icon shows the violet browser-frame mark
- **AND** the install source is still `plugins/steel-browser` with the
  `steel-browser/` tag prefix

#### Scenario: Install from the listing

- **GIVEN** the updated listing is merged
- **WHEN** a user installs BB Surf from the marketplace
- **THEN** BB resolves the same `steel-browser` plugin ID as before
- **AND** existing installations and `::steel-browser{}` handoffs remain valid

### Requirement: Listing range resolves to the current engine surface

The `steel-browser` marketplace entry SHALL reference a compatible semver range
whose resolved tag contains the currently published BB Surf surface, including
the selectable Playwright and Jev execution engines. The listing description
SHALL name the engines a user can choose.

#### Scenario: Install from the listing

- GIVEN the marketplace entry range is `^0.2.0`
- WHEN a user installs BB Surf from BB Community
- THEN BB resolves tag `steel-browser/v0.2.0`
- AND the installed plugin exposes the Playwright, Jev, and Auto engine policy

#### Scenario: Catalog build validates the range

- WHEN the marketplace build runs against the updated entry
- THEN the entry still names the `steel-browser` id, the
  `plugins/steel-browser` subdirectory, and the `steel-browser/` tag prefix
- AND the build reports no entry validation error
