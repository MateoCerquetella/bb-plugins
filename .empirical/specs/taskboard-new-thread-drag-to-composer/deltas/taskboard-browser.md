# Taskboard Browser Delta

## MODIFIED Requirements

### Requirement: Restrained responsive List presentation

Taskboard SHALL render List rows as compact flat content with semantic state
shape and restrained color, and SHALL keep Kanban at full available width with
provider-native movement behavior. On the constrained right-panel surface,
List rows and Kanban cards SHALL expose a bounded ticket drag payload that a BB
composer can accept without changing the existing click-to-detail behavior.

#### Scenario: Drag a constrained List ticket

- **WHEN** the user starts dragging a List ticket from the right panel
- **THEN** the ticket advertises a copy operation carrying only its Taskboard
  mention identity
- **AND** clicking or keyboard-activating the row still opens ticket detail

#### Scenario: Preserve Kanban movement

- **WHEN** the user drags a Kanban card to another valid provider-status lane
- **THEN** Taskboard performs the existing optimistic status move
- **AND** the same gesture can be dropped on the main composer as a copy without
  moving the provider ticket

## ADDED Requirements

### Requirement: New Thread Taskboard panel

Taskboard SHALL register its constrained panel for BB's root New Thread Actions
list as well as the existing-thread Actions list. It SHALL follow the project
selected by the root composer, including a clear choose-project state.

#### Scenario: Open Taskboard beside New Thread

- **WHEN** the user opens BB's right panel, opens New tab, and selects Taskboard
  from Actions on the root New Thread surface
- **THEN** the Taskboard panel renders beside the composer
- **AND** choosing another composer project refreshes the panel scope
