# Plan: Finish Marketplace PR 129 Locally

## 1. Isolate the Taskboard patch

- Confirm the current tree matches `origin/main` and contains only the new
  Empirical feature records.
- Create local branch `release/taskboard-v0.3.2` from that tree without
  touching the existing remote Usage Tracker branch.
- Keep unrelated local Taskboard icon, Usage Tracker `0.1.4`, Host Monitor, and
  older workflow changes out of the branch.

## 2. Add focused failing contracts

- Extend distribution tests for version `0.3.2`, exact dev-only SDK placement,
  type-only RPC contract import, absence of an SDK-root value import, and direct
  Git range `^0.3.2`.
- Extend issue-draft tests for provider capability selection, exact structured
  Plan input, tagged pending Plan classification, and unexpected interactions.
- Add a server lifecycle source/logic guard for explicit provider provenance,
  `accept-edits`, hidden Plan-only spawn, stop-before-archive, and no provider
  interaction resolution/plugin cancellation.
- Add exact GitHub child-environment tests covering preserved authentication,
  config/keyring, proxy/CA, bare/absolute executable, Windows runtime, fixed
  policy/locale, and excluded secrets/injection variables.

## 3. Repair the production-only build graph

- Replace `defineRpcContract` with a type-only `PluginRpcContract` constraint
  while preserving exported literal inference.
- Keep SDK `0.4.6` exact and development-only.
- Bump Taskboard to `0.3.2`, update root lock record, root/plugin install docs,
  and focused distribution assertions.

## 4. Enforce Plan-only drafting

- Add pure Plan-action resolution, structured command-input construction, and
  pending-interaction classification helpers.
- Update the prompt so the Plan body is exactly the tagged ticket envelope and
  no implementation/Plan exit is requested.
- Preflight project defaults/provider capabilities, pin provider/provenance,
  and spawn with initial structured Plan input plus `accept-edits`.
- Reconcile interactions before status/output; stop an expected or unexpected
  pending interaction first, then persist a valid draft or safe failure and
  archive.
- Preserve idle-output and original-prompt fallbacks and document hidden
  Plan-only model usage.

## 5. Scrub the GitHub CLI environment

- Resolve and verify one absolute `gh` only from fixed common non-project
  install paths, then implement the pure child allowlist with fixed noninteractive
  and locale policy, no PATH/PATHEXT, and Windows-only runtime lookup.
- Pass it to every `execFile` call while preserving timeouts and output limits.
- Confirm tests reject empty/relative/project-local counterfeit executables and
  exclude representative BB/provider/cloud/tracker secrets, search state,
  process-injection hooks, CGI mode, and UI/debug variables.

## 6. Verify the source candidate

- Run focused Taskboard tests and typecheck during implementation.
- Run Taskboard SDK type check, full tests, build, and build-metadata verifier.
- Run root `npm run check` and `git diff --check`.
- Clone to a fresh temporary directory with no root modules, run the exact
  production-only Taskboard install, assert no SDK production package, and
  build/verify there.
- Run a safe live Plan smoke check with the available provider if practical,
  proving the inspected repository remains unchanged.

## 7. Prepare the marketplace result locally

- On the exact PR #129 checkout, confirm remote head and current upstream.
- Prepare the current-upstream three-file result: both entry additions and the
  verified content-hashed Taskboard icon.
- Set Taskboard range `^0.3.2` and Plan-only AI/model-usage disclosure; preserve
  Usage Tracker exactly at accepted `^0.1.3`.
- Install marketplace dependencies without scripts; run build, JSON/icon/diff
  audits, `git diff --check`, and record the expected source-liveness-only block
  until the tag exists.

## 8. Review and stop at the remote gate

- Run independent security and code review; repair findings and repeat focused
  and root verification as required.
- Produce an exact approval packet with account, repositories, source and
  marketplace diffs, intended commits, package/version, annotated tag, source
  range, current remote heads, and every commit/push/tag/release/force-with-
  lease/comment command.
- Do not commit or mutate remote state until the user approves that packet.
- After approval, create/push the immutable release, prove public source and
  real Git install, rerun marketplace liveness, update the PR branch safely,
  and request maintainer re-review.
