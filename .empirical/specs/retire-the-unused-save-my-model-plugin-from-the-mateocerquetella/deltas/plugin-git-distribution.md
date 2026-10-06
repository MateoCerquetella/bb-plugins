# Plugin Git Distribution Delta

## ADDED Requirements

### Requirement: Retired Save My Model is absent from active distribution

The main-line BB Plugins collection SHALL not offer Save My Model as an
installable workspace plugin. The root catalog, source directories, npm
workspace lockfile, and current repository marketplace staging data SHALL
agree on the remaining active plugin set. Existing immutable Git release tags
and historical workflow evidence SHALL remain unchanged.

#### Scenario: Inspect the active collection

- **WHEN** a contributor lists the root collection and installs the workspace
- **THEN** no Save My Model package or catalog entry is present
- **AND** every remaining collection entry resolves to its own plugin directory
- **AND** the root checks run without a stale Save My Model workspace link

#### Scenario: Inspect historical releases

- **WHEN** a user resolves a previously published Save My Model Git tag
- **THEN** that tag still points to its original release commit
- **AND** the retirement does not rewrite or delete historical Empirical records
