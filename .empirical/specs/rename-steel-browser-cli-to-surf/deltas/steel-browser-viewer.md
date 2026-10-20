# Steel Browser Viewer Delta

## ADDED Requirements

### Requirement: Surf command identity

BB Surf SHALL register `surf` as its public top-level CLI command. The plugin
SHALL preserve the `steel-browser` plugin ID, package name, storage keys,
project browser bindings, UI route, and `::steel-browser{}` handoff directive.
User-facing command guidance SHALL use `bb surf`. Steel SHALL remain the name
of the upstream browser engine and service.

#### Scenario: User opens command help

- **WHEN** the user runs `bb surf --help`
- **THEN** BB lists the existing browser subcommands
- **AND** the help identifies BB Surf as the browser command

#### Scenario: Existing project browser is reused

- **GIVEN** a project already has a browser binding stored by the
  `steel-browser` plugin
- **WHEN** the user runs `bb surf project`
- **THEN** the existing binding and browser profile are reused
- **AND** no persistent data migration is required

#### Scenario: Agent requests browser work

- **WHEN** an agent receives a browser task
- **THEN** its injected instructions and bundled skill direct it to
  `bb surf project`
- **AND** visible browser handoffs still emit `::steel-browser{}`
