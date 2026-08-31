# Disable Taskboard AI Drafting for v0.3.3

## Request

> Disable Taskboard repository-aware AI drafting for v0.3.3: never spawn a helper thread or invoke a model; open composer capture with the editable original prompt and separate issue confirmation; remove obsolete drafting RPC lifecycle, model-usage documentation, tests, and marketplace claims; retain the released Ticket icon, clean Git install fix, GitHub CLI containment, committed-only release verification, and ^0.3.3 marketplace result; verify locally; and do not push, tag, publish, comment, or mutate remote state without separate exact approval.

## Goal

Ship a review-ready Taskboard `0.3.3` candidate whose composer capture is fully
manual and local: the user's original prompt becomes editable issue fields, no
model or helper thread runs, and creation remains a separate confirmation. Keep
the distribution, GitHub CLI, icon, and marketplace fixes needed for PR #129.

## Acceptance Criteria

- [ ] [AC-1] Composer-assisted capture never calls a drafting RPC, provider, or
  thread-spawn API. It immediately derives an editable title and description
  from the original prompt and keeps the existing separate Create confirmation.
- [ ] [AC-2] Taskboard's RPC contract, server, subscriptions, storage cleanup,
  tests, and frontend contain no issue-draft helper lifecycle, Plan command,
  model-output parser, hidden drafting thread, retry control, or model-usage
  state. No `threads.spawn` path remains in Taskboard.
- [ ] [AC-3] Active Taskboard documentation and marketplace copy make no AI,
  model, repository-reading, or Plan-only drafting claim. They accurately
  describe manual prompt capture and provider-confirmed external issue creation.
- [ ] [AC-4] Manifest, lockfile, install docs, distribution tests, and living
  contract agree on private Git-only Taskboard `0.3.3`, exact dev-only SDK
  `0.4.6`, direct range `^0.3.3`, and tag prefix `taskboard/`.
- [ ] [AC-5] A clean production-only Taskboard subdirectory install and BB build
  succeeds with no root modules or production SDK package; every non-server
  Taskboard TypeScript source is free of SDK-root value imports.
- [ ] [AC-6] Taskboard's GitHub CLI resolver continues to ignore `PATH` and
  `PATHEXT`, use verified fixed absolute non-project candidates, and pass only
  the tested explicit auth/config/proxy/TLS/runtime environment allowlist.
- [ ] [AC-7] The authoritative release probe rejects tracked or untracked
  product dirt, clones the exact HEAD commit/tree, and runs the production-only
  build. Its explicit working-tree overlay mode is development-only.
- [ ] [AC-UI-1] [UI] The thread-header action retains the released `Ticket`
  icon, accessible pin label, and existing right-panel behavior.
- [ ] [AC-8] Focused/full Taskboard tests, typecheck, SDK check, build metadata,
  root checks, browser evidence, `git diff --check`, and committed-only consumer
  verification pass against the final source commit.
- [ ] [AC-9] The current-base marketplace result remains exactly Taskboard
  entry, unchanged reviewed Usage Tracker entry, and content-hashed Taskboard
  icon. Taskboard uses `^0.3.3` with no AI claim; Usage Tracker stays `^0.1.3`.
- [ ] [AC-10] Published `taskboard/v0.3.2` remains untouched. No source or
  marketplace push, tag, release, force-with-lease update, PR comment, or other
  remote mutation occurs without a fresh exact command packet and approval.

## Scope

- Remove Taskboard's repository-aware drafting backend, RPCs, storage/events,
  parser/provider helpers, frontend polling/status/retry UI, tests, and docs.
- Preserve manual composer-to-issue-field capture and explicit issue creation.
- Preserve and verify the `0.3.3` clean-install, GitHub CLI, ticket-icon, release
  verifier, and marketplace changes.

## Non-goals

- Replacing AI drafting with another model, provider, script, or background
  worker before BB exposes a genuinely restricted worker API.
- Changing issue-provider fields, credentials, filters, board/list behavior, or
  external issue confirmation semantics.
- Moving/deleting the immutable `0.3.2` release, publishing to npm, or making
  any remote change before separate exact approval.

## Risks

- Leaving one dormant RPC/event/storage path could reintroduce model execution
  or mislead reviewers and users about behavior.
- Manual fallback must not erase or mutate the original prompt before review.
- Release verification must build the exact commit rather than an overlay.
- `^0.3.3` intentionally trusts future protected compatible patch tags; it is
  not an exact artifact pin.

## Verification

- Static search proving no Taskboard model/Plan/helper/thread-spawn path or
  active AI/model copy remains.
- Focused UI/distribution/GitHub tests, full Taskboard suite, typecheck, SDK
  check, build, metadata, and root workspace check.
- Real browser exercise of composer capture plus sanitized screenshot of the
  retained Taskboard header/panel identity.
- Default committed-only production consumer probe and explicit dirty-tree
  refusal test.
- Marketplace schema/build/icon/hash/exact-diff audit; public `^0.3.3` liveness
  remains deferred until the separately approved release.
- Fresh-context security and code review of the final committed tree.

## Capability Deltas

- `deltas/board-capture.md`
- `deltas/taskboard-distribution.md`
