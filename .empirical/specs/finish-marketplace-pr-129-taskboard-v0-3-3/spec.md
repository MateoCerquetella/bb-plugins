# Finish Marketplace PR 129 with Taskboard 0.3.3

## Request

> Finish get-bb marketplace PR 129 locally with Taskboard 0.3.3: preserve the immutable published Taskboard 0.3.2 tag and carry forward its ticket-icon change; apply the already verified production-install, native Plan-mode drafting, GitHub CLI environment, tests, documentation, and marketplace disclosure fixes; prepare the marketplace source floor at ^0.3.3 with the unchanged Usage Tracker entry; verify source and marketplace candidates; and do not push, tag, publish, comment, or mutate remote state without separate exact approval.

## Goal

Produce a review-ready local Taskboard `0.3.3` source candidate and a current-base
marketplace PR update that preserve the already-published `0.3.2` UI change,
close every actionable review and security item on get-bb/marketplace#129, and
remain behind an exact remote-release approval gate.

## Acceptance Criteria

- [ ] [AC-1] Taskboard's manifest, root lockfile, focused distribution tests,
  living distribution contract, and direct-install documentation agree on
  version `0.3.3`, exact development-only SDK `0.4.6`, private Git-only
  distribution, Git range `^0.3.3`, and tag prefix `taskboard/`.
- [ ] [AC-2] In a clean checkout with no root `node_modules`, a production-only
  dependency install in `plugins/taskboard` followed by `bb plugin build .`
  succeeds without installing `@get-bb/plugin-sdk`; every non-server Taskboard
  TypeScript entry is free of an SDK-root runtime import.
- [ ] [AC-3] Composer-assisted drafting preflights the project-default provider
  for `accept-edits` and an advertised native Plan action, pins provider and
  permission provenance, and starts a hidden helper with structured initial
  Plan input rather than a plain or auto-approved prompt.
- [ ] [AC-4] Taskboard accepts only the strict tagged JSON draft envelope, stops
  the helper before persistence, archives it after stopping, never approves,
  denies, resolves, or plugin-cancels the Plan interaction, and keeps a stopped
  draft retryable when archive initially fails.
- [ ] [AC-5] Unsupported providers or unexpected interactions fail closed to
  the editable original-prompt fallback; Taskboard documentation and marketplace
  copy disclose repository-aware AI drafting, untrusted repository context, and
  model usage before separately confirmed issue creation.
- [ ] [AC-6] Every Taskboard `gh` subprocess resolves only a verified executable
  from fixed absolute non-project locations and receives an exact child
  environment allowlist. `PATH`, `PATHEXT`, unrelated secrets, loader hooks,
  debug, editor, and pager controls are neither used for discovery nor forwarded.
- [ ] [AC-UI-1] [UI] The thread-header action carried forward from the immutable
  `taskboard/v0.3.2` release uses Taskboard's `Ticket` icon, retains its accessible
  pin label and behavior, and does not regress to the generic panel icon.
- [ ] [AC-7] Focused Taskboard tests, typecheck, SDK type check, build metadata,
  root checks, `git diff --check`, and the clean production-only consumer probe
  pass from the final committed `0.3.3` source candidate.
- [ ] [AC-8] The prepared marketplace result is based on current
  `get-bb/marketplace:main` and changes exactly the Taskboard entry, unchanged
  reviewed Usage Tracker entry, and content-hashed Taskboard icon. Taskboard uses
  `^0.3.3`; Usage Tracker stays at `^0.1.3`; schema, icon, build, and diff checks
  pass, with only public `0.3.3` source liveness deferred until release approval.
- [ ] [AC-9] The existing annotated `taskboard/v0.3.2` tag and GitHub Release
  remain untouched at commit `2d90bd3be0aab8a3641e368536bbe441150e6580`.
  No branch push, tag, release, force-with-lease update, PR comment, or other
  remote mutation occurs without a separate packet of exact commands and fresh
  remote-head checks approved by the user.

## Scope

- Taskboard patch version, lockfile, install docs, distribution tests, and clean
  production-only release-candidate verifier.
- Type-only RPC contract identity, native Plan helper lifecycle, strict draft
  parsing, GitHub CLI executable/environment boundary, and focused tests/docs.
- The `0.3.2` thread-header ticket icon and its regression test.
- Local preparation of the current-base marketplace Taskboard and Usage Tracker
  entries plus vendored Taskboard icon.

## Non-goals

- Moving, deleting, or replacing `taskboard/v0.3.2` or its GitHub Release.
- Publishing Taskboard to npm; it remains private and Git-only.
- Changing provider issue fields, credentials, board/list semantics, creation
  confirmation behavior, or unrelated Host Monitor and Usage Tracker code.
- Making Taskboard appear in the hosted BB Community catalog before PR #129 is
  merged and the catalog refreshes.
- Any source or marketplace remote mutation before separate exact approval.

## Risks

- Releasing `0.3.3` without the `0.3.2` ticket-icon change would regress an
  immutable published behavior because the two candidates began as sibling
  commits.
- A runtime SDK-root frontend import can make clean Git subdirectory builds fail
  when development dependencies are intentionally omitted.
- Incorrect Plan lifecycle ordering can persist a draft before the helper stops
  or accidentally resolve a provider interaction.
- An over-broad `gh` environment leaks server secrets; an over-tight environment
  can break supported authentication, enterprise, proxy, TLS, keyring, or
  Windows behavior.
- The marketplace source check cannot pass for `^0.3.3` until the separately
  approved immutable tag is public; local validation must report this expected
  gate separately from unrelated upstream failures.

## Verification

- Focused Taskboard unit, lifecycle/fault, distribution, UI-source, and
  cross-platform GitHub CLI contract tests.
- Taskboard typecheck, SDK types check, plugin build, and metadata verification.
- Root workspace check and `git diff --check`.
- Clean independent clone with no root modules, production-only Taskboard
  install, SDK-absence assertion, BB build, and metadata verification.
- Fresh-context code/security review of the final committed source tree.
- Marketplace build, schema/icon/diff audit, exact three-file comparison, and
  post-release public range-resolution check.

## Capability Deltas

- `deltas/taskboard-distribution.md`
- `deltas/board-capture.md`
- `deltas/taskboard-github-cli.md`
- `deltas/taskboard-browser.md`
