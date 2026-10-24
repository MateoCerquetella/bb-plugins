# BB Surf Marketplace Listing Delta

## Purpose

Keep the BB Community marketplace listing aligned with the BB Surf rename and
the violet BB Plugins visual identity.

## ADDED Requirements

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
