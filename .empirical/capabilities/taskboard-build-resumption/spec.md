# Taskboard Build Resumption Specification

## Purpose

Define safe explicit continuation and accurate pause reconciliation for native
Taskboard Builds without bypassing required decisions or repository gates.

## Requirements

### Requirement: Explicit blocked Build continuation

Taskboard SHALL resume blocked Builds only on an explicit Start task action,
in the same managed Build session with current scope and approval. Prompts
SHALL carry prior findings and preserve required repository and human gates.

#### Scenario: Resume a blocked Build
- **WHEN** Start task is requested for a blocked Build
- **THEN** one continuation is sent to its original thread and environment
- **AND** concurrent starts cannot duplicate the dispatch.

#### Scenario: Native work resumes
- **WHEN** a newer native Build turn starts
- **THEN** the obsolete Build-result pause is cleared
- **AND** scope or workspace errors are preserved.

#### Scenario: Completion remains gated
- **WHEN** a continued Build reports unresolved blockers or lacks a revision
- **THEN** automation pauses without review or tracker closure.
