# Action Topbar Distribution Specification

## Purpose

Make the experimental Action Topbar source installable from the plugin
repository while preventing accidental use with an incompatible BB core or
marketplace publication before its required SDK surface is accepted.

## Requirements

### Requirement: Installable experimental plugin source

The repository SHALL include the complete Action Topbar plugin source as an npm
workspace package under `plugins/action-topbar`.

#### Scenario: Install from Git

- GIVEN a BB installation with Plugin SDK 0.4.33 and the matching experimental
  core split-drag API
- WHEN a user runs the documented Git install command against `main`
- THEN BB installs the Action Topbar plugin from `plugins/action-topbar`

#### Scenario: Install from a local checkout

- GIVEN a local checkout of the plugin repository
- WHEN a user runs the documented local-path install command
- THEN BB installs Action Topbar from the local plugin directory

### Requirement: Experimental compatibility warning

Action Topbar documentation SHALL use product-owned language, retain the
experimental Plugin SDK/core warning, and show real light-mode and dark-mode BB
screenshots of the topbar and Action launcher.

#### Scenario: User evaluates Action Topbar before installation

- GIVEN a user opens the Action Topbar README
- THEN no third-party comparison name appears
- AND the matching-core and SDK 0.4.33 warning remains visible
- AND light and dark screenshots show the installed topbar and searchable
  Action launcher

#### Scenario: Repository wording audit

- WHEN authored repository files are searched case-insensitively
- THEN the removed third-party product name has no matches outside generated
  dependencies or immutable historical evidence

### Requirement: Launcher overlay stacking
Action Topbar's launcher SHALL render above ordinary BB page content and SHALL remain below host-owned modal, dialog, approval, and interaction layers.

#### Scenario: Open over a plugin marketplace page
- **GIVEN** a BB page with positioned or scrolling content
- **WHEN** the user opens Action Topbar's launcher
- **THEN** the complete launcher remains visible and interactive above the page
- **AND** no page card, header, or scroll container paints over it

#### Scenario: Host dialog opens
- **GIVEN** Action Topbar's launcher is visible
- **WHEN** BB opens a host-owned modal or dialog
- **THEN** the host surface remains visually and interactively above the launcher

#### Scenario: Preserve launcher interaction
- **WHEN** stacking is corrected
- **THEN** keyboard navigation, action activation, outside-click dismissal, viewport positioning, and supported drag behavior remain unchanged
