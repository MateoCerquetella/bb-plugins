# Host Monitor Native Modal Navigation

## Purpose

Define threshold-aware compact telemetry, a footer-only visible sidebar entry,
and reload-free handoff to the dedicated Host Monitor page.

## ADDED Requirements

### Requirement: Footer-only visible sidebar presence

Host Monitor SHALL hide only its exact semantic nav-panel row while retaining
the registered route and SHALL restore the row's prior state on disposal.

#### Scenario: BB remounts sidebar navigation

- WHEN BB recreates the plugin navigation rows
- THEN Host Monitor hides the new exact `host-monitor/host-monitor` wrapper
- AND no other navigation item is hidden, removed, or reordered.

### Requirement: Reload-free dedicated-page transition

Open Host Monitor SHALL activate BB's existing nav-row button so the host router
performs an SPA transition without document replacement.

#### Scenario: Operator opens the full dashboard

- GIVEN a marker exists on the current document and the mini-modal is open
- WHEN Open Host Monitor is activated
- THEN the URL becomes `/plugins/host-monitor/host-monitor`
- AND the same document and marker remain
- AND Settings is not opened.

### Requirement: Accessible CPU and RAM guides

The mini-modal SHALL project the configured CPU and RAM thresholds from the
fleet response and apply passive semantic treatment to current readings at or
above those guides.

#### Scenario: CPU crosses its guide

- GIVEN the CPU guide is 80 percent and a fresh reading is 82 percent
- WHEN the mini-modal renders the host
- THEN CPU receives the above-guide visual treatment
- AND its accessible label states the reading and 80 percent guide
- AND no badge, toast, or notification is created.

### Requirement: BB-native compact surface

The mini-modal SHALL follow BB's compact control, typography, spacing, focus,
surface, and responsive patterns using host theme tokens.

#### Scenario: Modal opens at 390px

- THEN it remains within viewport gutters with internal scrolling
- AND every action and metric remains legible and keyboard reachable.
