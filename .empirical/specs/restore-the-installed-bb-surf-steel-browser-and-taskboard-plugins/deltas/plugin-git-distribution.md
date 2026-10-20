# Plugin Git Distribution Delta

## ADDED Requirements

### Requirement: Durable user-facing install sources

BB Surf and Taskboard SHALL document public immutable Git release ranges with
their monorepo subdirectories and tag prefixes. They SHALL NOT present a local
checkout, `/tmp` path, or disposable thread worktree as the normal install
source.

#### Scenario: Install BB Surf from the published release

- **WHEN** a user follows the BB Surf quick start
- **THEN** BB resolves `plugins/steel-browser` from the public repository using
  the `steel-browser/` tag prefix and a semver range
- **AND** the instructions do not require this repository to exist locally.

#### Scenario: Install Taskboard from the published release

- **WHEN** a user follows the Taskboard quick start
- **THEN** BB resolves `plugins/taskboard` from the public repository using the
  `taskboard/` tag prefix and a semver range
- **AND** the instructions do not point at `/tmp` or a thread worktree.

### Requirement: Durable local registration

A repaired local registration SHALL use a clone under the persistent
`~/.bb/plugin-sources` directory, preserving the existing plugin ID and
configuration while allowing BB's managed source cache to survive worktree
cleanup.

#### Scenario: Restart after source checkout cleanup

- **WHEN** the original repository worktree is removed
- **THEN** both plugin registrations still resolve their source directories
- **AND** both plugins remain reloadable without restoring settings manually.
