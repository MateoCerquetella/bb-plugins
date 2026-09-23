# Usage Tracker Distribution Delta

## MODIFIED Requirements

### Requirement: Immutable Usage Tracker Git release

Every Usage Tracker release SHALL bind one reviewed commit with matching active
manifest, lockfile, changelog, documentation, distribution tests, and build
metadata to one new annotated `usage-tracker/vX.Y.Z` tag and one GitHub Release.
Existing tags SHALL never move, and Usage Tracker SHALL remain a private,
non-publishable npm workspace distributed from Git. Preparing a patch SHALL
advance every active version assertion together without publishing or tagging.

#### Scenario: Prepare Usage Tracker 0.1.10 without publishing

- **WHEN** the Claude Keychain override is ready to merge
- **THEN** the manifest, lockfile, changelog, and cross-plugin distribution
  assertion agree on `0.1.10`
- **AND** the change is merged only after required CI passes
- **AND** no npm publication, Git tag, or GitHub Release is created
