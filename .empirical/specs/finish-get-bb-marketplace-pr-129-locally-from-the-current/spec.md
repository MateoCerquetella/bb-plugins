# Finish Marketplace PR 129 Locally

## Request

> Finish get-bb marketplace PR 129 locally from the current origin/main tree: prepare Taskboard 0.3.2 by replacing the runtime SDK-root RPC identity import with an equivalent type-only contract constraint so production-only subdirectory installs build while the exact SDK remains dev-only; replace the hidden auto-approved issue-drafting worker with a capability-preflighted structured native Plan-mode worker using accept-edits, consume the proposed plan as the draft, stop before archive, and never approve or resolve it; allowlist the gh child environment; add focused tests and documentation; verify root and clean production-only builds; and prepare the existing marketplace PR branch on current upstream with its vendored icon, a ^0.3.2 source floor, AI/model-usage disclosure, and the unchanged ready Usage Tracker entry. Do not commit, push, tag, publish, force-update, comment, or otherwise mutate remote state without a separate exact approval.

## Goal

Produce a review-ready local Taskboard `0.3.2` patch candidate and a
current-base marketplace PR update that close every actionable maintainer item,
while keeping commits, pushes, tags, releases, force-updates, PR comments, and
all other remote mutations behind a separate exact approval.

## Acceptance Criteria

- [ ] [AC-1] In a clean checkout with no parent `node_modules`, Taskboard can
  run `npm install --ignore-scripts --omit=dev --omit=optional` in its
  subdirectory and then `bb plugin build .`; the frontend graph contains no
  runtime SDK-root import and builds without installing
  `@get-bb/plugin-sdk` as a production dependency.
- [ ] [AC-2] Taskboard's manifest, root lockfile, focused distribution tests,
  living distribution contract, and direct-install documentation agree on
  version `0.3.2`, the exact development-only SDK pin, private Git-only
  distribution, and the `taskboard/` tag prefix.
- [ ] [AC-3] Composer-assisted drafting preflights the project-default provider
  for `accept-edits` and an advertised Plan action, pins that provider and
  execution provenance, and starts the helper with structured initial Plan
  input rather than a plain prompt. Unsupported providers fail closed to the
  existing editable original-prompt fallback without spawning a worker.
- [ ] [AC-4] A pending provider Plan is parsed as the issue draft, then the
  helper is stopped before the draft is persisted and the thread is archived.
  Taskboard never approves, denies, resolves, or plugin-cancels the provider
  interaction; any unexpected pending interaction stops the helper and fails
  closed. Idle Plan-compatible output remains a fallback.
- [ ] [AC-5] The drafting prompt remains injection-resistant and explicitly
  requires a read-only Plan body in the tagged JSON envelope. Focused tests pin
  provider capability checks, exact command mention offsets/metadata,
  `accept-edits`, hidden background visibility, explicit provider provenance,
  Plan classification, and stop-before-archive behavior. Taskboard docs and the
  marketplace copy disclose that optional repository-aware AI drafting consumes
  model usage before separately confirmed issue creation.
- [ ] [AC-6] Every Taskboard `gh` subprocess receives a deliberate
  cross-platform environment allowlist containing only GitHub
  authentication/configuration, user config/keyring roots, proxy/TLS,
  conditional executable lookup, Windows runtime lookup, and fixed noninteractive
  locale/policy values. Unrelated server secrets and process-injection variables
  are absent, with focused exact-output tests.
- [ ] [AC-7] Focused Taskboard tests, typecheck, SDK type check, plugin build,
  build-metadata verification, root checks, `git diff --check`, and the clean
  production-only install/build probe pass from the final local source
  candidate.
- [ ] [AC-8] The existing PR #129 result is prepared against current
  `get-bb/marketplace:main` with exactly the Taskboard and Usage Tracker entries
  plus the content-hashed Taskboard icon. Taskboard starts at Git range
  `^0.3.2`; Usage Tracker remains at reviewed `^0.1.3`; marketplace schema,
  icon, build, and diff checks pass locally, with source-liveness validation
  deferred only until the approved Taskboard tag becomes public.
- [ ] [AC-9] Before any commit, push, annotated tag, GitHub Release,
  force-with-lease update, PR comment, or other remote mutation, the user
  receives the authenticated account, repositories, complete candidate diffs,
  intended commit plan, package/version, tag/source, current remote heads, and
  every state-changing command for explicit approval.

## Scope

- Taskboard RPC contract import, patch version, lockfile, distribution tests,
  install docs, and living capability contract.
- Issue-drafting provider preflight, structured Plan input, reconciliation and
  stop/archive lifecycle, prompt/docs, and focused regression coverage.
- GitHub CLI child-process environment construction and exact tests.
- Clean production-only subdirectory installation and BB build verification.
- Local preparation of the existing marketplace PR result, entry copy, icon,
  source range, and marketplace validation.

## Non-goals

- Changing provider issue fields, credentials, tracker mutations, board/list
  UI, composer modal layout, or creation confirmation semantics.
- Publishing Taskboard to npm; it remains private and Git-only.
- Including the unrelated local Taskboard ticket-icon, Host Monitor, Usage
  Tracker `0.1.4`, or historical Empirical changes in the source patch.
- Splitting Usage Tracker into a separate PR unless the user later requests it.
- Committing, pushing, tagging, releasing, force-updating the marketplace PR,
  commenting on GitHub, or merging before the separate approval gate.
- Claiming `readonly` or `plan` is a public BB permission value; the boundary
  uses an advertised structured Plan composer action plus supported
  `accept-edits` defense in depth.

## Risks

- Replacing the SDK identity helper with a type-only contract assertion can
  weaken inference if the `satisfies` constraint or exported literal type is
  written incorrectly.
- Plan mode is separate from permission mode and provider-specific; a plain
  `/plan` string, later-turn Plan command, unsupported provider, or interaction
  resolution would weaken the boundary or leave the draft stuck.
- Stopping a Plan interaction after persisting the draft could race execution;
  stop must complete before persistence and archive.
- An over-tight `gh` environment can break token, keychain/config, enterprise,
  proxy, TLS, or Windows behavior; an over-broad list preserves the leakage
  concern or enables process injection.
- Replaying a delete/modify-conflicted marketplace branch rewrites history; its
  force-with-lease push requires exact approval and a fresh remote-head check.
- Marketplace source-liveness cannot accept `^0.3.2` until the separately
  approved immutable tag is public, so local validation must distinguish this
  expected gate from schema/build/icon failures.

## Verification

- Focused contract-import, distribution, issue-draft Plan, server lifecycle,
  GitHub environment, and existing Taskboard tests.
- Taskboard typecheck, SDK types check, `bb plugin build .`, and build metadata.
- Root `npm run check` and `git diff --check`.
- Fresh temporary source clone with no root modules, production-only Taskboard
  install, absence of the SDK package, plugin build, and metadata verification.
- Live Plan-mode smoke check on the available BB provider when safe, proving no
  working-tree mutation; unsupported providers remain covered by deterministic
  tests.
- Marketplace scripts-disabled install, build, entry/icon/diff audit, and
  post-tag source-liveness check.
- Independent code and security review before the exact remote-action approval
  packet.

## Capability Deltas

- `deltas/board-capture.md`
- `deltas/taskboard-distribution.md`
- `deltas/taskboard-github-cli.md`
