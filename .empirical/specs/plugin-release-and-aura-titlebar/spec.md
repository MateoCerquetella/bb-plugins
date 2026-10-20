# Plugin Release And Aura Titlebar

## Request

> Fix Taskboard distribution documentation test, verify and release Action Topbar 0.1.2 and Taskboard 0.3.5, fix Aura issue #92 with regression and visual evidence, and merge reviewed changes only with required passing checks. Preserve marketplace PR #621 and its maintainer-only v1-change blocker; leave private plugins unlisted.

## Goal

Publish the already-versioned Action Topbar and Taskboard sources only after
their distribution contracts pass, and repair Aura's framed macOS title-bar
containment regression before closing issue #92.

## Acceptance Criteria

- [ ] [AC-1] Action Topbar `0.1.2` passes its focused check and a public
  `action-topbar/v0.1.2` GitHub release points to that verified source.
- [ ] [AC-2] Taskboard's documented direct Git install range is `^0.3.5`, its
  focused check passes, and a public `taskboard/v0.3.5` GitHub release points
  to that verified source.
- [ ] [AC-3] The marketplace contribution describes Taskboard's current
  GitHub, GitLab, Gitea, Linear, and Jira support and preserves its stable
  source id, subdirectory, semver range, and tag prefix.
- [ ] [AC-UI-1] [UI] Aura wallpaper begins below the framed desktop title bar
  on thread and new-thread routes, without changing unframed or narrow layouts.
- [ ] [AC-5] Aura has a regression test and browser screenshot evidence for
  the title-bar boundary, and issue #92 closes only after the fix merges.
- [ ] [AC-6] Every merged PR uses the reviewed exact head and has passing
  required checks; marketplace PR #621 remains pending until a maintainer adds
  `v1-change`, and private unlisted plugins remain unlisted.

## Scope

- Correct Taskboard release documentation.
- Publish Action Topbar `0.1.2` and Taskboard `0.3.5`.
- Update the existing marketplace contribution for Taskboard's current
  provider list.
- Contain Aura's wallpaper below the framed desktop title bar.
- Add automated and browser verification for the Aura regression.

## Non-goals

- Do not list private plugins.
- Do not bypass GitHub permissions, required checks, or marketplace labels.
- Do not change plugin ids, source subdirectories, tag prefixes, or persisted
  data.
- Do not claim marketplace publication before the upstream PR merges.

## Verification

- Run complete focused checks for Action Topbar and Taskboard before tagging.
- Run Aura unit, type, build, and browser regression checks.
- Inspect each public tag's peeled commit and manifest version.
- Build and validate the exact marketplace patch, then inspect upstream CI.
- Verify merged PR heads before closing issue #92.

## Capability Deltas

- `deltas/plugin-git-distribution.md`
- `deltas/aura-activity-overview.md`
