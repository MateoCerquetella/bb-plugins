# Host Monitor Two-Stage Navigation

## Purpose

Define the compact footer telemetry modal and dedicated full-page dashboard
workflow while preserving notification-free multi-host monitoring.

## ADDED Requirements

### Requirement: Footer telemetry mini-modal

Host Monitor SHALL toggle one accessible, anchored mini-modal from its native
bottom sidebar action. The modal SHALL show a bounded summary row for every
enrolled BB machine using the existing fleet RPC.

#### Scenario: Mixed fleet opens

- GIVEN connected and disconnected machines are enrolled in BB
- WHEN the operator activates the bottom Host Monitor icon
- THEN one labelled mini-modal opens above it
- AND every host is listed independently with textual state
- AND available CPU, RAM, and disk readings are shown without notifications.

### Requirement: Dedicated page handoff

The mini-modal SHALL offer an explicit Open Host Monitor action that closes the
modal and navigates to the dedicated Host Monitor nav panel, never Settings.

#### Scenario: Operator needs full history

- GIVEN the mini-modal is open
- WHEN the operator activates Open Host Monitor
- THEN the modal closes
- AND `/plugins/host-monitor/host-monitor` opens with the full fleet dashboard,
  historical charts, and per-host panel editor.

### Requirement: Bounded modal lifecycle

The content script SHALL remove all owned DOM, timers, requests, and listeners
on close or disposal and SHALL render untrusted values through text APIs.

#### Scenario: Plugin reloads while modal is open

- WHEN the content-script abort signal fires
- THEN the modal and all owned resources are removed exactly once
- AND unrelated BB sidebar DOM remains unchanged.

### Requirement: Notification-free two-stage monitoring

The footer modal and page SHALL NOT emit a toast, notification, alert banner,
warning badge, IP field, process control, or draggable floating monitor.

#### Scenario: Fleet RPC fails

- WHEN the modal cannot load the fleet
- THEN it displays a compact inline retry state
- AND no out-of-surface notification appears.
