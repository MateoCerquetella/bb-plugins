# Agent Progress

## Purpose
Make agent work understandable in BB without command-list clutter or forced
panel persistence, and retain direct access to the originating tracker issue.

## MODIFIED Requirements

### Requirement: Readable native progress
Taskboard SHALL show themed progress, collapsed commands, real per-file diffs,
restrained live motion and original-ticket navigation.

#### Scenario: Inspect progress
- GIVEN associated Factory work
- WHEN opening progress
- THEN reported phase, steps and command outcome counts are visible
- AND commands and their output expand independently on request
- AND Original ticket opens the existing Taskboard provider detail.

#### Scenario: Inspect changed code
- GIVEN a managed Build reports changed file paths and has an environment
- WHEN Changed files is expanded and a file is selected
- THEN Taskboard retrieves that file's current repository patch
- AND BB's native unified diff renderer displays the real additions and removals
- AND loading, empty, stale or unavailable patches are stated explicitly.

#### Scenario: Scan current and prior work
- GIVEN Factory work has multiple runs
- WHEN progress opens
- THEN the current run has one clear stage, status and activity hierarchy
- AND earlier runs remain compact until individually expanded
- AND stage headings are not duplicated within the same visible summary.

#### Scenario: Observe live work
- GIVEN the current run is starting or running
- WHEN Taskboard receives progress
- THEN a restrained active-status indicator communicates ongoing work
- AND completed, blocked and failed evidence remains still
- AND reduced-motion preferences disable nonessential animation.

### Requirement: Non-sticky navigation
Starting work SHALL NOT pin Taskboard.

#### Scenario: Close context
- GIVEN Start work opened the worker thread
- WHEN the user closes Taskboard
- THEN refreshes do not reopen it
- AND thread-header progress remains available.
