# Taskboard Build Resumption

## Purpose

Define safe explicit continuation and accurate pause reconciliation for native
Taskboard Builds without bypassing required decisions or repository gates.

## MODIFIED Requirements

### Requirement: Explicit blocked Build continuation

Taskboard SHALL resume blocked Builds only on an explicit Start task or
Continue in thread action,
in the same managed Build session with current scope and approval. Prompts
SHALL carry prior findings and preserve required repository and human gates.
Continue in thread SHALL invoke guarded factoryStartTask with loading/error
feedback and navigate only after successful resumption. Other run states SHALL
use Open session for navigation only. Failed/canceled Retry SHALL NOT appear
beside a duplicate Start build action. Broken Git checkout failures SHALL
remain blocking.

Explicit Review-to-Build repair or blocked-Build continuation SHALL restore an
archived original Build only in its ready managed worktree, after validating
scope and approval. Polling SHALL preserve completed results without reopening
archived sessions. Deleted sessions and unavailable, moved or busy workspaces
SHALL remain blocking. Restoration SHALL revalidate identity and readiness
before dispatch and SHALL NOT create a replacement checkout.

#### Scenario: Return to an archived authoring session
- **WHEN** the user explicitly resumes Build after archiving its authoring thread
- **THEN** the original thread is unarchived only after its managed worktree is validated
- **AND** one continuation carries review findings or prior Build blockers
- **AND** failed restoration or changed workspace prevents dispatch.

#### Scenario: Resume a blocked Build
- **WHEN** Start task or Continue in thread is requested for a finished blocked Build
- **THEN** one continuation is sent to its original thread and environment
- **AND** concurrent starts cannot duplicate the dispatch.

#### Scenario: Native work resumes
- **WHEN** a newer native Build turn starts
- **THEN** the obsolete Build-result pause is cleared
- **AND** scope or workspace errors are preserved.

#### Scenario: Completion remains gated
- **WHEN** a continued Build reports unresolved blockers or lacks a revision
- **THEN** automation pauses without review or tracker closure.
