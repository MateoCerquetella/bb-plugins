# Taskboard Prepare Work

## Request
Enhance Taskboard with the user's project-linked preparation flow: investigate, edit a brief, explore multiple interactive prototypes, refine and select, reopen, and export input for Empirical. Use Hamster's discovery-to-brief approach as inspiration with an original visual design.

## Goal
A BB user prepares an evidenced change and explores alternatives without implementing it in the target repository or starting Empirical.

## Acceptance Criteria
- [ ] [AC-1] Prepare work uses the existing New thread composer and its selected project, model, reasoning, service tier, permission mode, machine, workspace and branch. It introduces no duplicate settings form. Bind the preparation to the submitted thread and resolve its actual environment and host explicitly; never substitute project defaults for current selections. Tracker setup remains optional.
- [ ] [AC-2] Bounded, secret-filtered repository context includes a broad inventory and relevant documentation, features, components, tokens, routes and available Empirical contracts; source paths/excerpts are visible and target production files remain unchanged.
- [ ] [AC-3] Configured BB agent execution produces an editable title and description covering problem, outcome, behavior, scope, acceptance and questions. Original request, direct edits, conversation, and brief revisions persist; existing behavior, proposals and assumptions are distinguished.
- [ ] [AC-4] Generation accepts an integer count 1–4, default 2, and optional direction. Each distinct interactive standalone prototype has sample data, generation progress, a brief revision and immutable version history. Partial failure and individual retry/refinement preserve successful alternatives.
- [ ] [AC-5] Prototype previews run in sandboxed frames without host origin, network, popup or top-navigation privileges. Artifacts persist outside target production sources. Selection feeds a recorded decision into the brief.
- [ ] [AC-6] Workspace/project/environment/host/thread linkage, sources, jobs, brief revisions, prototype versions and selection survive panel closure and plugin reload; interrupted jobs are recoverable without silent duplicate generation or stale brief overwrite.
- [ ] [AC-7] Ready/export produces an agent-readable packet with brief, source references, selected prototype, original request and unresolved questions. Export never launches implementation or claims Empirical specification/mockup/validation gates passed.
- [ ] [AC-8] An optional existing task reference reuses the selected BB project's Taskboard connection, scope, credentials and cached task listing for GitHub, Linear or Jira. Store provider, locator, title and URL with the preparation/export; no duplicate connection setup, new remote search, ticket creation or synchronization is required. Missing or failed tracker connections never block preparation.
- [ ] [AC-UI-1] [UI] In real BB select a project, submit a request, inspect/edit brief and sources, generate two alternatives, refine/select, reopen, and export. Demonstrate screenshots and record unchanged target production files plus any SDK limitations.

## Scope
Taskboard only inside bb-plugins, independent of empirical-sdd. Add preparation backend, persisted data, bounded context retrieval, BB agent jobs and panel. Keep current tracker browsing. Align Taskboard SDK with pinned workspace bb release as needed.

## Non-goals
New external tracker search, ticket creation or status synchronization (existing Taskboard task selection and reference linking are in scope); changes to empirical-sdd; implementation in selected targets; publication; automatically starting Empirical; a general arbitrary package execution service.

## Risks
Untrusted repository content and generated HTML; remote-host confusion; stale generation racing edits; provider/host failure and reload; large context; undocumented composer capabilities. Validate boundaries, isolate artifacts/previews and use explicit host routing. Report host/provider failures and actual supported composer behavior.

## Verification
Focused persistence, validation, context exclusion, remote routing and failure/retry tests; package build/typecheck; workspace npm install and npm run check. Live browser end-to-end against BB with configured agent execution and before/after target production digest. Independent code review and immutable evidence.

## Capability Deltas
See deltas/taskboard-preparation.md.

## State clarifications from UI review
When an agent finishes against an older brief revision, keep its result as a proposal and preserve the current user edits; applying it is explicit. A project change must never retarget existing persisted preparations: switch the list to the selected project's work, while retaining the original project/environment/host binding of each saved preparation. Unavailable environments show a retryable error. Generation batches append and preserve earlier alternatives, decisions and versions.

## New thread settings and Taskboard connection refinement
User feedback on September 14: reuse the settings already selected in BB New thread and reuse Taskboard's Linear/GitHub/Jira configuration. The side-panel/composer view API exposes project and draft but does not expose all unsent execution/environment selections. Use native submission and bind to the resulting thread; prototype/research jobs use that resolved configuration, with artifact isolation handled separately. Do not claim interception or automatic panel navigation. The exact preparation marker, correlation and safe agent bootstrap require implementation validation before shipping. The host-owned experimental_NewThreadComposer can submit a complete NewThreadRequest when embedded, but a second instance cannot be assumed to inherit unsent root selections and is not a substitute for this requirement.

Optional task linkage reads existing per-project configuration through getProjectConfig, existing cached listItems and getItem adapters. Show only safe connection summaries; open existing Taskboard settings for configuration. Record explicitly selected task references alongside repository sources, clearly labeled as external context. Do not publish anything to the tracker.
