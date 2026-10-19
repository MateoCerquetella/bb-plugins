# Taskboard Native Github Specification

## Purpose

Let Taskboard own the GitHub issue workflow it exposes, using the authenticated
GitHub CLI and the selected BB project's repository without another BB plugin.

## Requirements

### Requirement: Native GitHub issue source

Taskboard SHALL read and mutate GitHub issues through the authenticated GitHub
CLI without calling or requiring BB's separate GitHub plugin. Taskboard SHALL
scope every operation to the GitHub repository resolved from the selected BB
project.

#### Scenario: Refresh without the GitHub BB plugin

- **GIVEN** a BB project whose Git remote resolves to `owner/repo`
- **AND** `gh auth status --hostname github.com --active` succeeds
- **WHEN** Taskboard refreshes the project's GitHub source
- **THEN** Taskboard fetches that repository's issues through `gh`
- **AND** persists them under the existing `github` source identity
- **AND** no `github` BB plugin is installed or called.

#### Scenario: Open and update an issue

- **GIVEN** a GitHub issue cached by Taskboard
- **WHEN** a user opens it or changes its Open or Closed state
- **THEN** Taskboard reads or mutates the exact scoped issue through `gh`
- **AND** returns the same Taskboard work-item shape used before the migration.

### Requirement: Native GitHub failure containment

Taskboard SHALL validate GitHub CLI responses at the provider boundary and
SHALL preserve the last successful Taskboard cache when repository discovery,
authentication, network access, or response validation fails.

#### Scenario: GitHub CLI is unavailable

- **WHEN** a configured GitHub project refreshes without an available and
  authenticated `gh` CLI
- **THEN** Taskboard reports an actionable GitHub connection error
- **AND** retains the previous cached items and last successful sync time.

#### Scenario: Project has no GitHub repository

- **WHEN** the selected BB project's Git remote does not resolve to
  `github.com/owner/repo`
- **THEN** Taskboard reports that no GitHub repository is mapped
- **AND** does not query repositories outside that BB project.

### Requirement: GitHub setup documentation

Taskboard SHALL instruct users to install and authenticate the GitHub CLI.
Taskboard SHALL NOT instruct users to install, enable, or reload BB's GitHub
plugin.

#### Scenario: Set up GitHub for Taskboard

- **WHEN** a user reads Taskboard's GitHub connection instructions
- **THEN** the instructions require `gh auth login`
- **AND** state that Taskboard discovers the repository from the BB project.
