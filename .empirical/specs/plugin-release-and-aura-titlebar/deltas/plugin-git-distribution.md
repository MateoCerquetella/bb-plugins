# Plugin Git Distribution Delta

## ADDED Requirements

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
