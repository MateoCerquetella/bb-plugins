# Remove Activity Overview

## Request

> Remove Activity Overview from bb-plugins, including the visible ACTIVITY / Overview contribution dashboard shown on the BB home surface, and center the thread in the resulting layout. Verify the human UI and repository checks, then create a pull request.

## Goal

Remove the Activity Overview plugin and its homepage contribution dashboard so
BB's native thread experience occupies the centered content column without an
Activity Overview section below it.

## Acceptance Criteria

- [ ] [AC-1] The repository plugin catalog and workspace dependency graph do
  not contain `activity-overview`.
- [ ] [AC-2] The Activity Overview package, source, tests, assets, and
  documentation no longer exist under `plugins/`.
- [ ] [AC-3] The root plugin catalog no longer advertises Activity Overview.
- [ ] [AC-UI-1] [UI] A BB thread renders in the native centered content column
  without the `ACTIVITY / Overview` dashboard.
- [ ] [AC-4] The root repository check passes after the workspace removal.

## Scope

- Remove the independently installable Activity Overview plugin.
- Remove its root catalog, workspace lockfile, and README references.
- Remove the active local installation for human UI verification.

## Non-goals

- Change BB core thread layout or add replacement centering CSS.
- Change any other plugin's registrations or presentation.
- Preserve Activity Overview data or settings.

## Verification

- Run `npm install` to reconcile the workspace lockfile.
- Run `npm run check` from the repository root.
- Inspect the installed plugin list and the live BB thread UI after removal.
- Capture a screenshot that shows the centered thread without Activity
  Overview.

## Risks

- A stale workspace or installed-plugin reference could keep the removed
  package visible or make root dependency installation fail.
- UI verification could mistake a hidden dashboard for a removed registration.

## Capability Deltas

- `deltas/activity-overview.md` removes the Activity Overview capability.
