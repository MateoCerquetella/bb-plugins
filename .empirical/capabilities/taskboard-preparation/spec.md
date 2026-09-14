# Taskboard Preparation Specification

## Purpose

Help BB users turn repository-informed requests and prototype decisions into durable preparation packets before starting implementation.

## Requirements

### Requirement: Prepare a project change before implementation
Taskboard SHALL offer a durable project/environment/thread-linked preparation workspace with bounded source-backed editable briefs, conversational refinement, 1–4 versioned interactive alternatives, safe preview, selection and explicit ready/export.

#### Scenario: Explore and export
- GIVEN a selected BB project and reachable chosen environment
- WHEN the user submits a request, edits the generated brief, generates two alternatives, refines/selects one and reopens the workspace
- THEN versions, sources, conversation and selection remain available and export creates an Empirical-readable preparation packet without starting implementation.

#### Scenario: Partial failure and stale work
- GIVEN one generation fails or BB restarts during work or the brief is edited while generation runs
- WHEN the workspace is reopened
- THEN failures are visible and individual retries preserve successful versions and user edits, with artifacts linked to their generating brief revision.

#### Scenario: Target and preview isolation
- GIVEN a local or remote selected project with secrets and generated files
- WHEN context is retrieved and previews are generated
- THEN host routing is explicit, context is bounded and filtered, target production files are unchanged, and generated code executes only in an isolated frame.

#### Scenario: Reuse New thread selections
- GIVEN the user has selected project, machine, branch, provider/model and permissions in the native New thread composer
- WHEN Prepare work is enabled and the user sends the request through that composer
- THEN preparation binds to the resulting thread and resolved settings, without another configuration form or substituting project defaults.

#### Scenario: Reuse the project's Taskboard connection
- GIVEN Taskboard already has a GitHub, Linear or Jira source configured for this BB project
- WHEN the user optionally links an existing Taskboard task
- THEN the preparation and export preserve that task reference using the existing connection, without new credentials or remote writes; no connection still permits preparation.
