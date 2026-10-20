# Finish Pr 83 Keep The Aura New Thread Composer Thread

## Request

> Finish PR 83. Keep the AURA new-thread composer/thread centered at every viewport size, remove the duplicated Activity overview heading shown in the installed UI, reconcile the branch with current main without losing the existing activity overview behavior, verify the live installed AURA UI and repository checks, update the pull request, and make it merge-ready.

## Goal

PR 83 is merge-ready on current `main`. In the installed AURA plugin, BB's
native New Thread composer stays horizontally centered at desktop and mobile
widths, whether the optional activity overview is enabled or disabled. The
activity overview shows one accessible title, keeps its existing authenticated
GitHub behavior, and remains reachable below the composer.

## Acceptance Criteria

- [ ] [AC-UI-1] [UI] The native New Thread composer is horizontally centered
  at desktop and 390px mobile widths with AURA enabled or disabled.
- [ ] [AC-UI-2] [UI] Enabling the activity overview renders exactly one visible
  "Activity overview" heading and keeps the overview below the composer.
- [ ] [AC-UI-3] [UI] The page has no horizontal overflow, and the composer,
  project/provider controls, activity controls, and overview remain reachable.
- [ ] [AC-1] Existing AURA wallpaper, saved-slot, draft, authenticated activity,
  empty, partial, unavailable, error, retry, and stale-response behavior remains
  intact.
- [ ] [AC-2] The branch incorporates current `origin/main`, resolves its
  `package-lock.json` conflict without dropping either side's dependencies, and
  passes the repository's focused and root checks.
- [ ] [AC-3] PR 83 points to the verified commit and GitHub reports no merge
  conflict, failing check, or unresolved review blocker.

## Scope

The existing AURA plugin's New Thread layout rules, activity overview markup,
behavioral tests, installed local plugin, branch conflict resolution, and PR 83.
Preserve the host-owned composer and homepage slot. Reuse BB's slot title as the
overview's single heading.

## Non-goals

No cloned or reparented composer, host application patch, new plugin, fabricated
activity data, credential change, release publication, or PR merge.

## Risks

The host owns the composer layout and may change its generated classes or
`data-testid` structure. Keep selectors limited to stable IDs, test IDs, and
existing roles observed in the live DOM. Merging current `main` may change AURA
dependencies or SDK behavior, so regenerate the lockfile through npm and rerun
the full workspace check.

## Verification

Run AURA's focused tests, typecheck, and build, followed by `npm run check`.
Install and reload AURA from this checkout. Use the bound Steel browser to
inspect the real New Thread page at desktop and 390px mobile widths with the
activity overview enabled and disabled. Confirm one visible activity heading,
horizontal centering, no document overflow, native draft preservation, and
working activity controls. Review the exact branch diff, push the verified
commit, and use the GitHub PR watcher until PR 83 is merge-ready.
## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
