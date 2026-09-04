# Capability Delta: Usage Tracker

## Purpose

Track provider quotas and present them reliably in the BB sidebar.

## ADDED Requirements

### Requirement: Responsive provider usage display

The usage tracker SHALL adapt its provider cards and labels to normal, narrow, and ultra-compact sidebar widths without clipping essential quota information.

#### Scenario: Compact sidebar

- **WHEN** the sidebar is reduced to its minimum supported width
- **THEN** provider marks remain visible and text uses the compact layout rules

### Requirement: Provider discovery and branding

The usage tracker SHALL discover Google Antigravity quota data from supported local installations and use the official provider mark where available.

#### Scenario: Antigravity installed on macOS

- **WHEN** Antigravity credentials/cache exist in a supported path
- **THEN** the probe returns normalized quota data for the sidebar

## Verification Notes

Covered by the PR's unit tests and repository checks.
