# Plugin Git Distribution Specification

## Purpose

Define the shared active distribution boundary for repository plugins whose
installable releases live in Git rather than the npm registry.

## Requirements

### Requirement: Active Git-only install surfaces

Taskboard, Usage Tracker, and Host Monitor SHALL expose only BB Community and
immutable Git release sources in current user-facing documentation,
automation, and marketplace metadata. Host Monitor's sole active plugin id
SHALL be `host-monitor`. Their main-line workspaces SHALL be private and SHALL
omit npm publication configuration and hooks.

#### Scenario: Discover the renamed Host Monitor

- **WHEN** a user reads the catalog, resolves the collection entry, or installs
  the direct Host Monitor Git range
- **THEN** the id, subdirectory, package, and tag prefix resolve as
  `host-monitor`, `plugins/host-monitor`, `bb-plugin-host-monitor`, and
  `host-monitor/`
- **AND** no active alias or duplicate `machine-monitor` listing is offered

#### Scenario: Build the renamed Git-only workspace

- **WHEN** a contributor installs dependencies and runs the root check
- **THEN** Host Monitor resolves BB 0.40 / plugin SDK 0.4.21 under its renamed
  workspace identity
- **AND** its tests and server/app/host artifacts all report `host-monitor`

### Requirement: Preserve Git-build package tooling

Git-only distribution SHALL retain the package manifests, stable package names,
workspace/lockfile dependency graph, source entry points, and package-manager
development commands required to install dependencies, build, test, and derive
BB plugin identity.

#### Scenario: Distinguish tooling from distribution

- **WHEN** an active audit encounters `package.json`, lockfile package records,
  `@get-bb/plugin-sdk`, or npm install/run development commands
- **THEN** those build and identity contracts remain intact
- **AND** none is treated as evidence that either plugin is published to npm

### Requirement: Preserve distribution history

The retired annotated `machine-monitor/v0.1.0` tag SHALL remain immutable at
its original release commit. New Host Monitor distribution SHALL begin at a
separate annotated `host-monitor/v0.1.0` tag on the reviewed rename commit.

#### Scenario: Publish the renamed identity

- **WHEN** the approved rename release and marketplace metadata are delivered
- **THEN** the new tag, subdirectory, marketplace entry, icon, and install
  commands use only `host-monitor`
- **AND** the retired tag still peels to
  `9db09cc35553493113f31e5352a44911ae92bc73` without being moved or deleted

### Requirement: Migrate a local Host Monitor identity safely

The local development installation SHALL retain its effective non-secret
threshold settings while moving to the new plugin id, and SHALL never retain
two active Host Monitor samplers after migration completes.

#### Scenario: Replace the installed local path identity

- **GIVEN** `machine-monitor` is installed from a local path
- **WHEN** the rename is exercised live
- **THEN** its settings are captured before `host-monitor` is installed and
  applied to the new id
- **AND** the retired id is removed only after the new plugin and sampler are
  running successfully

### Requirement: Dockside release documentation is source-verifiable

Dockside's user-facing README SHALL identify its immutable Git release source,
provide a working monorepo subdirectory/tag-prefix install command, and show
theme-accurate compact screenshots of the released sidebar and inline child
agents. It SHALL NOT describe an open marketplace submission as already merged
or imply that the similarly named npm package is an approved source.

#### Scenario: User installs or evaluates Dockside v0.1.0

- **GIVEN** `dockside/v0.1.0` peels to the reviewed main merge
- **WHEN** a user reads the Dockside README
- **THEN** the direct Git command resolves `plugins/dockside` with the
  `dockside/` tag prefix and `^0.1.0` range
- **AND** light, dark, and expanded-subagent screenshots load from the plugin's
  own documentation media
- **AND** marketplace availability is described according to the current pull
  request state

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

### Requirement: Publish verified Action Topbar and Taskboard releases

Action Topbar `0.1.2` and Taskboard `0.3.5` SHALL be published from source that
passes each plugin's complete focused check. Documentation, manifest versions,
tag versions, and compatible marketplace source ranges SHALL agree.

#### Scenario: Taskboard documentation is stale

- **WHEN** the distribution test expects `^0.3.5`
- **THEN** both root and Taskboard installation documentation use `^0.3.5`
- **AND** the complete Taskboard check passes before its tag is created

#### Scenario: Marketplace metadata is updated

- **WHEN** Taskboard supports GitHub, GitLab, Gitea, Linear, and Jira
- **THEN** the marketplace entry names the current provider set
- **AND** preserves its id, source subdirectory, semver range, and tag prefix

### Requirement: Respect external release gates

Publication and merge operations SHALL preserve required reviews, checks,
labels, and repository permissions.

#### Scenario: A contributor cannot apply a required label

- **WHEN** marketplace validation requires a maintainer-only label
- **THEN** the pull request remains pending
- **AND** the release report identifies the exact blocker without bypassing it
