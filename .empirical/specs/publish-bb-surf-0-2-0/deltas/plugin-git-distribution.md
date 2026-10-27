# BB Surf 0.2.0 Release Tag

## ADDED Requirements

### Requirement: Release tags carry the merged line

A `steel-browser/vX.Y.Z` release tag SHALL point at a commit that is already
merged into `main` and SHALL declare the same version in
`plugins/steel-browser/package.json`. Release tags SHALL NOT be cut from
unmerged feature branches.

#### Scenario: Tag carries the current plugin surface

- GIVEN `main` contains the Jev execution engine in `plugins/steel-browser`
- WHEN the release is tagged `steel-browser/v0.2.0`
- THEN the tag commit is an ancestor of `main`
- AND the tag tree contains `jev-runtime.ts`, `engines.ts`, and a
  `package.json` that declares `0.2.0`

#### Scenario: Documented install range matches the release

- WHEN a user follows the documented Git install command for BB Surf
- THEN the command resolves `@^0.2.0` under the `steel-browser/` tag prefix
- AND it installs the subdirectory `plugins/steel-browser`
