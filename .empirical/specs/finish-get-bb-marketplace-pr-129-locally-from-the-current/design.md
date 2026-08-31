# Design: Finish Marketplace PR 129 Locally

## Focused source and release boundary

The current checkout tree is byte-identical to fetched `origin/main` commit
`203f910`. Create a focused local `release/taskboard-v0.3.2` branch before
product edits and carry the approved Empirical records with it. Do not reuse or
cherry-pick local commit `2d90bd3`: it mixes 132 paths, unrelated Taskboard icon
UI, Usage Tracker `0.1.4`, Host Monitor, and historical workflow records while
leaving all marketplace review blockers unresolved.

The source candidate changes only the RPC build boundary, issue-draft safety
path, GitHub subprocess environment, focused tests, Taskboard version/install
documentation, root lock record, and approved capability records. The patch
version is `0.3.2`; the eventual immutable tag is `taskboard/v0.3.2`. No commit,
push, tag, GitHub Release, PR update, or comment occurs before exact approval.

## Production-only frontend build

`plugins/taskboard/contract.ts` value-imports `defineRpcContract` from the SDK
root. SDK `0.4.6` implements that helper as an identity function, but its value
import remains in the frontend graph and fails when BB correctly omits dev
dependencies during a Git subdirectory install.

Replace the helper with a type-only `PluginRpcContract` import and export the
same literal object using `satisfies PluginRpcContract`. This preserves exact
method inference and compile-time schema validation while erasing the SDK root
from emitted JavaScript. Keep exact SDK `0.4.6` in `devDependencies`; moving it
to production dependencies would conflict with `bb plugin types --check`.

Extend the distribution test to read `contract.ts` and assert the exact dev-only
pin, type-only import, absence of a value import, and `satisfies` constraint.
The decisive probe clones the candidate without local objects or a parent
`node_modules`, installs production-only dependencies in the Taskboard
subdirectory, asserts the SDK and root modules are absent, then runs
`bb plugin build .` and the build-metadata verifier.

## Strict native Plan-only issue drafting

The SDK has no `readonly` permission value. Native Plan mode is a separate,
provider-advertised composer action, so prompt wording or `accept-edits` alone
does not enforce the existing read-only claim.

Before spawn, resolve project default execution options and the provider roster.
The selected provider must advertise both `accept-edits` and a Plan action.
Missing defaults, provider mismatch, or missing capability throws before spawn;
the existing modal catches this and retains the editable original prompt. Pin
the preflighted provider on the spawn and set `executionInputSources.providerId`
and `.permissionMode` to `explicit` so a preference change cannot race the
preflight.

Add pure helpers in `issue-draft.ts` that:

- select and validate a provider's Plan command;
- build text beginning with the advertised trigger/name/trailing whitespace;
- attach an exact command mention spanning only the trigger plus name, with
  builtin command metadata;
- classify pending interactions into one expected Plan, unexpected pending
  interactions, or none.

Spawn with structured `input`, never the plain `prompt` field; use initial Plan
input to avoid the BB 0.38 later-turn Claude Plan bug. Retain the
project-default environment for repository context, use `accept-edits` only as
defense in depth, and keep background visibility hidden. Hidden is organization,
not the security boundary; native Plan mode is the boundary.

Update the drafting prompt to require the proposed Plan body itself to be the
tagged JSON ticket envelope, forbid implementation or leaving Plan mode, and
state that Taskboard will stop the worker without approval.

Reconciliation lists pending interactions before reading thread status/output.
For exactly one expected Plan, capture the plan text and call
`threads.stop()` first. Only after stop resolves, parse/validate and persist the
draft, publish the Taskboard signal, and archive. Do not call
`interactions.cancel`: BB 0.38 restricts it to plugin-owned interactions. Do not
call `interactions.resolve`: denial resumes the provider and can loop. Any
unexpected pending interaction follows the same stop-first path and records a
safe failure. Ordinary idle-output parsing remains as a compatibility fallback
for Plan providers that complete without a pending approval. UI polling already
reconciles every 700 ms, so no new BB event surface is required.

Tests cover provider capability success/failure, exact mention shape, tagged
Plan classification, unexpected interactions, explicit spawn settings,
stop-before-persist/archive order, and absence of `auto`, resolution, or
plugin-cancellation paths. The README calls the helper hidden and Plan-only,
explains repository reading and selected-provider model usage, and retains the
separate user-confirmed issue mutation boundary.

## GitHub CLI child environment

Resolve `gh` before spawn only from fixed common absolute install paths. Ignore
`PATH` completely, reject any candidate inside the server's current project
root, require a regular executable file, use only the fixed `gh.exe` name on
Windows, and cache only the verified absolute result.

Add a pure exported `githubCliEnvironment(source, platform)` helper in
`sources/github.ts` and pass its result to every absolute-path `execFile` call.
It sets:

- `GH_PROMPT_DISABLED=1`
- `GH_NO_UPDATE_NOTIFIER=1`
- `GH_TELEMETRY=0`
- `LANG=C`
- `LC_ALL=C`

It copies only GitHub/GitHub Enterprise tokens, `GH_HOST`, `GH_CONFIG_DIR`,
POSIX/Windows user config roots, Linux keyring bus, uppercase and lowercase
HTTP(S)/no-proxy values, TLS CA file/directory settings, and Windows
`SYSTEMROOT`. It never passes `PATH` or `PATHEXT` to the authenticated child.

Omit `ALL_PROXY`, CGI `REQUEST_METHOD`, BB/provider/cloud/tracker secrets,
`NODE_OPTIONS`, loader hooks, debug/forced-TTY/editor/pager/browser variables,
and every unnamed key. Injected source/platform/excluded-root arguments make
candidate and environment tests deterministic across hosts. Preserve existing
timeout, stderr handling, and 16 MiB output ceiling.

## Version, docs, and lock alignment

Bump only Taskboard from `0.3.1` to `0.3.2`. Update root and plugin direct Git
commands to `^0.3.2`, focused distribution assertions, and the root lockfile's
Taskboard version record. Keep Usage Tracker at `0.1.3`; do not import the local
unpublished `0.1.4` work. Integrate the approved capability deltas only after
review and clean verification.

## Marketplace PR result

PR #129 is based on `a683caa`; current upstream is `e937f46`, whose `69eb7b4`
commit deleted both stale npm entries and the Taskboard icon. Prepare the final
tree from current upstream, retaining both entries as additions and restoring
the exact 414-byte `icons/taskboard-0b77950c.svg` whose full SHA-256 is
`0b77950cec05ed35134dcc8d0c8ff96460c806106cb8e28cedeb15903ccd08ef`.

Taskboard uses `^0.3.2`, `plugins/taskboard`, and `taskboard/`; its description
discloses optional repository-aware Plan-only AI drafting and model usage before
user-confirmed creation. Usage Tracker remains unchanged at `^0.1.3` with
`ChartColumn`. The intended upstream diff is exactly:

- `A entries/taskboard.json`
- `A entries/usage-tracker.json`
- `A icons/taskboard-0b77950c.svg`

Run scripts-disabled marketplace dependency installation, schema/build/icon,
JSON, digest, and diff checks locally. `npm run check` is expected to report only
the absent `^0.3.2` public source until release approval; rerun it after the tag
is public and before any approved PR branch update.

## Approval and verification sequence

Complete focused and root checks, the isolated production-only build, a safe
live Plan-mode smoke test when available, independent code/security review, and
local marketplace build. Then show the authenticated account, repositories,
complete diffs, intended source and marketplace commits, package/version,
annotated tag, source range, current remote heads, and every state-changing
command.

Only explicit approval permits commits or remote mutations. After approval,
create the focused source commit and immutable annotated tag without moving old
tags, push, prove the public tag, rerun the real Git-source install and
marketplace liveness check, update the marketplace branch with
`--force-with-lease` against the freshly verified remote head, and post the
concise re-review reply.
