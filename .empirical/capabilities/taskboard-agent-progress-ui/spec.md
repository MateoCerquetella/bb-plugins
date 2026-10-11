# Taskboard Agent Progress Ui Specification

## Purpose

Make agent work understandable in BB without command-list clutter or forced
panel persistence, and retain direct access to the originating tracker issue.

## Requirements

### Requirement: Readable native progress
Taskboard SHALL show themed progress, collapsed commands and original-ticket navigation.

#### Scenario: Inspect progress
- GIVEN associated Factory work
- WHEN opening progress
- THEN reported phase, steps and command outcome counts are visible
- AND commands and their output expand independently on request
- AND Original ticket opens the existing Taskboard provider detail.

### Requirement: Non-sticky navigation
Starting work SHALL NOT pin Taskboard.

#### Scenario: Close context
- GIVEN Start work opened the worker thread
- WHEN the user closes Taskboard
- THEN refreshes do not reopen it
- AND thread-header progress remains available.
