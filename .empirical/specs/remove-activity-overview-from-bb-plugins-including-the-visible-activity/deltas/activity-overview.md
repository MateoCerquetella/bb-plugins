# Activity Overview removal

## Purpose

Keep the repository collection and the installed BB interface free of the
retired Activity Overview plugin.

## ADDED Requirements

### Requirement: Activity Overview is absent

The repository SHALL NOT distribute or register an Activity Overview plugin.
BB's native thread layout SHALL remain the sole owner of the centered thread
content area without a contribution dashboard homepage section.

#### Scenario: Open a BB thread after removal

- **GIVEN** the repository plugins are installed without Activity Overview
- **WHEN** a user opens a BB thread
- **THEN** the thread occupies BB's native centered content column
- **AND** no `ACTIVITY / Overview` contribution dashboard appears

#### Scenario: Install the repository plugin collection

- **WHEN** a contributor installs dependencies or enumerates the plugin catalog
- **THEN** no Activity Overview package, workspace, or catalog entry resolves
