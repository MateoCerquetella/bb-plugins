# Steel Browser Human Control

## Request

> Improve plugins/steel-browser thread and plugin-page responsiveness, reduce duplicate streams and requests, provide secure user-only copy/paste and human login controls, expose project-scoped saved service/account labels with honest verification status, research existing BB and Kernel patterns, test and visually verify, then commit and push the working branch. Preserve existing browser profiles, auth boundaries and paid-engine opt-in. Include a portable documented fix for the remote BB launcher issue if appropriate.

## Goal

Make self-hosted Steel usable for interactive account login from BB and reduce
unnecessary viewer load, without moving credentials into agent tools.

## Acceptance Criteria

- [ ] [AC-1] All viewer surfaces share a source/origin-validated clipboard bridge;
  paste is user initiated, has a native-paste fallback, and is never persisted,
  sent through RPC, logged, or included in CLI arguments.
- [ ] [AC-2] Only the latest inline directive streams; minimized/hidden viewers
  stop streaming. Opening expanded control uses one iframe rather than two.
- [ ] [AC-3] Per-project GitHub, Linear and Google sign-in records support
  explicit user confirmation, account labels, refresh and removal, and are
  clearly user-confirmed rather than automatically verified.
- [ ] [AC-4] Service login opens an allowlisted service URL in the selected
  project's browser without changing engine policy or invoking paid models.
- [ ] [AC-UI-1] Plugin page has a compact responsive operational layout and
  consistent control buttons; desktop and mobile checks show no overflow.
- [ ] [AC-5] Focused tests, typecheck, build and integration checks pass; changes
  are committed and pushed to this branch, with remaining limitations disclosed.

## Scope
Steel plugin, tests, documentation, and a documented portable launcher remedy.
Preserve existing independently installable packaging.

## Non-goals
Kernel/cloud credential vault, automatic password collection, automatic account
verification from cookie names, profile export, engine policy changes, new
streaming infrastructure, login to the user's accounts by the agent.

## Verification
Node tests for safe viewer URLs, message validation, account isolation and
allowlisted navigation. Mocked UI smoke tests through project Steel on desktop
and mobile. Test clipboard with dummy text only. Run root checks and installed
plugin smoke checks. No claimed frame-rate improvement without measurement.

## Capability Deltas

See deltas/steel-browser.md.
