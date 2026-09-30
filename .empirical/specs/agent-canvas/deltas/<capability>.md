# Capability Delta: Agent Canvas

## ADDED Requirements

### Requirement: Spatial canvas workbench
The plugin MUST present visible BB threads as movable, bounded panes on a
dark spatial canvas with a persistent Coordinator dock.

#### Scenario: Open the workbench
- **WHEN** the user opens Agent Canvas
- **THEN** the canvas, workspace strip, pane controls, minimap, and Coordinator
  surface are visible without opening separate worktrees.

## MODIFIED Requirements

### Requirement: Persisted spatial layout
The existing worktree visibility capability is MODIFIED so pane position,
size, focus, and Coordinator identity are validated and persisted per browser
tab with bounded values.

#### Scenario: Recover layout
- **WHEN** the user reloads after moving a pane
- **THEN** the pane returns to its saved bounded position and size, or a safe
  default is used when persisted data is invalid.
