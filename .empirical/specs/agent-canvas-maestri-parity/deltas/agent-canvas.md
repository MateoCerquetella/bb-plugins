# Agent Canvas

## Purpose
Provide a persistent spatial workbench for live BB agent threads, connected shared context, reusable team compositions and host-bound resources, matching the portable observable interactions and visual conventions of the Maestri reference.

## ADDED Requirements

### Requirement: Portable spatial workbench
Agent Canvas SHALL provide the portable canvas and node operations in AC-3 through AC-5, preserving live native BB surfaces.

#### Scenario: Arrange a connected team
Given a workspace with two live BB threads, when the user adds a note, connects it to both, groups the three nodes and moves the group, then positions and authored links persist after reload and the native chats remain usable.

### Requirement: Explicit live orchestration
Agent Canvas SHALL use scoped BB operations for roles, messages and Maestro recruitment and SHALL never start or message agents on load or from import alone.

#### Scenario: Recruit with a role
Given a configured BB environment and provider, when the user explicitly recruits a Reviewer, then a real BB thread is created with the chosen role and environment and the resulting relationship is visible.

### Requirement: Reusable validated compositions
Agent Canvas SHALL save and import ensembles and note collections with versioned bounded validation, preserving internal links and groups without treating saved thread IDs as newly running agents.

#### Scenario: Restore an ensemble
Given an exported ensemble with two node templates and a connection, when the user imports and places it, then both templates and their connection appear; execution requires an explicit launch action.

### Requirement: Host-bound resources
File, floor and portal operations SHALL bind to the selected BB host/environment and project browser session, with unsupported capabilities clearly reported.

#### Scenario: Deny an unrelated resource
Given a connected note belonging to workspace A, when an unconnected thread from workspace B requests it, then access is rejected and the note remains unchanged.

### Requirement: Honest reference parity
Agent Canvas SHALL reproduce the inspected visual conventions and track every reference feature and demonstrated native capability gap.

#### Scenario: Review parity
When a reviewer inspects parity.md, then each reference feature has a functional implementation/evidence reference, demonstrated platform limitation, or an outstanding status, and incomplete portable features prevent a full-parity completion claim.
