# BB Surf Listing Release Range

## ADDED Requirements

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
