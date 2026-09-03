# Touch Bar Agent Monitor

## Purpose

Keep BB agent activity and explicit thread controls available on Intel MacBook
Pro Touch Bar hardware across application switches through a supported
BetterTouchTool presentation backed by BB-owned state.

## ADDED Requirements

### Requirement: Bounded BB activity snapshot

The Touch Bar plugin SHALL expose a bounded, deterministic compact projection of BB thread activity suitable for an intermittently refreshed hardware strip.

#### Scenario: Active work is prioritized

- **GIVEN** active, attention-requiring, idle, and archived threads exist
- **WHEN** the companion requests a snapshot
- **THEN** attention and active threads appear before ordinary recent threads
- **AND** archived threads do not appear
- **AND** the configured card limit and text bounds are enforced

#### Scenario: Hidden workers remain private by default

- **GIVEN** a hidden child or plugin worker thread exists
- **WHEN** hidden-thread display is disabled
- **THEN** that thread is excluded from the Touch Bar snapshot and counts

### Requirement: Explicit safe controls

The plugin SHALL mutate only the exact thread named by a supported CLI action after resolving its current BB state.

#### Scenario: Stop active thread

- **GIVEN** an existing active thread id
- **WHEN** the user invokes `bb touchbar stop <id>`
- **THEN** BB stops exactly that thread and reports success

#### Scenario: Reject unknown or ineligible stop

- **GIVEN** an unknown, archived, failed, or idle thread id
- **WHEN** the user invokes the stop action
- **THEN** the command returns nonzero and performs no mutation

### Requirement: Persistent all-app companion

The repository SHALL provide a BetterTouchTool companion that renders BB state and remains eligible under BTT's All Apps Touch Bar configuration.

#### Scenario: Import and refresh

- **GIVEN** BetterTouchTool and BB CLI are installed on an Intel Touch Bar Mac
- **WHEN** the user imports the supplied preset and enables it for All Apps
- **THEN** the strip periodically reads `bb touchbar snapshot`
- **AND** displays aggregate and per-thread controls
- **AND** a tap dispatches only the documented `open` action

#### Scenario: BB is unavailable

- **GIVEN** the BB CLI or server is unavailable
- **WHEN** the companion refreshes
- **THEN** it renders a concise disconnected state without exposing raw errors or continuously spawning overlapping requests

### Requirement: Independent distribution

The Touch Bar plugin SHALL follow the workspace's independent plugin packaging and verification conventions.

#### Scenario: Source and managed installation

- **WHEN** maintainers run the plugin and root checks
- **THEN** types, tests, companion validation, and plugin build pass
- **AND** the collection manifest and README identify the plugin directory and managed Git installation shape
- **AND** generated build output remains untracked
