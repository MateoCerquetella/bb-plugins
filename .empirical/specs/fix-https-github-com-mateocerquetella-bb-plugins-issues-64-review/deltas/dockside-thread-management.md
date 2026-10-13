# Dockside Thread Management Delta

## ADDED Requirements

### Requirement: Projects remain reachable before their first thread

Dockside MUST list known projects even when they contain no threads, and MUST
preserve an empty project's launcher when its project name matches search.

#### Scenario: A project has no threads

- **GIVEN** BB reports a project with no visible threads
- **WHEN** Dockside groups the inbox by project
- **THEN** the project appears with an empty family list
- **AND** its new-thread action remains available

#### Scenario: Search matches an empty project

- **GIVEN** an empty project appears in Dockside
- **WHEN** the user searches for part of the project name
- **THEN** Dockside keeps the project group in the results
- **AND** its family list remains empty
