# Implementation plan

## 1. Baseline and package
- Import tracked plugins/agent-canvas files from the installed source checkout.
- Add root catalog/README entries and a root-compatible check script.
- Use the exact SDK shipped with the plugin's pinned bb-app and verify independent build/types.
- Run baseline tests before extending behavior.

## 2. Document and model
- Define bounded schemas for authored nodes, groups, connections, roles, collections, ensembles and workspace viewport state.
- Implement movement/resize, snapping, duplication, removal, groups, align/distribute/tidy, connected traversal and validated import/export as pure functions.
- Add meaningful invariant tests and bounded history with gesture commits.

## 3. Canvas interface
- Match approved square grid, insertion pill, sidebar, node headers and bottom-right minimap/zoom controls using BB tokens.
- Implement node insertion, note/text/drawing editors, authored links, marquee/multi-selection, grouping, arrangement, keyboard actions, lock/blur and lift/dock.
- Persist documents without overwriting old layouts; retain drafts on failures.
- Build accessible library/settings/search panels and stacked small-screen access.

## 4. Live agents and context
- Inspect actual pinned SDK interfaces for create/send/stop/archive, model selection and native composition.
- Implement role CRUD, explicit creation/composition and per-thread assignment.
- Add server-persisted connections and scoped context tools for notes and Maestro recruitment/reassignment/dismissal.
- Test denial for unrelated or stale identities and explicit launch semantics.

## 5. Resources and workspace features
- Add environment-bound file tree/search/editor with realpath containment.
- Adapt floors to BB worktree environments and prepare reviewable landing/PR flows.
- Bind portal actions to the existing Steel project session; retain capture-only labels where applicable.
- Implement ensemble/collection libraries, versioned import/export and BB automation-backed routines.
- Assess and record native-only capability gaps against actual host APIs.

## 6. Evidence and review
- Keep parity.md updated with code and evidence references, leaving unfinished features outstanding.
- Run root npm install and npm run check, plugin types/build and targeted invariant/authorization tests.
- Install/reload the local plugin and check CLI plus actual UI in the same project Steel session; collect desktop light/dark and narrow screenshots.
- Complete fresh-context review and all Empirical verification receipts.
- Integrate against an independent target only after review and verified acceptance criteria.

## Completion rule
Internal steps may be validated incrementally, but full portable parity and all acceptance evidence are required before this feature or user goal is complete. No fake agent, resource or integration replaces a real supported action.
