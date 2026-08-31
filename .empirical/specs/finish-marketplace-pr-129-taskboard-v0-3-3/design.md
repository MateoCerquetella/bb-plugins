# Design: Finish Marketplace PR 129 with Taskboard 0.3.3

## Superseding release boundary

Build one focused candidate from public `origin/main` commit `203f910`. The
published annotated tag `taskboard/v0.3.2` peels to sibling commit `2d90bd3`,
which carries the thread-header ticket icon but not the marketplace review
fixes. Preserve that tag and release exactly. Reconstruct the complete product
overlay as Taskboard `0.3.3`, carrying forward only the released icon behavior
and layering the already-verified production-install, Plan containment, GitHub
CLI, tests, and documentation changes.

No source or marketplace remote state changes during local preparation. The
eventual release uses a new annotated `taskboard/v0.3.3` tag on the exact
reviewed source commit.

## Production-only frontend build

Replace `contract.ts`'s runtime `defineRpcContract` SDK-root identity import
with a type-only `PluginRpcContract` import and the existing literal object
constrained by `satisfies`. This preserves method inference and compile-time
schema validation while erasing the SDK root from emitted frontend JavaScript.
Keep exact SDK `0.4.6` development-only.

The distribution suite recursively inspects every non-server Taskboard
TypeScript entry and rejects SDK-root value imports. The release-candidate probe
clones the complete candidate, applies tracked and validated untracked product
changes when present, tolerates an empty committed diff, installs production
dependencies only inside `plugins/taskboard`, proves root modules and the SDK
are absent, then builds and validates metadata.

## Strict native Plan issue drafting

Resolve project default execution options and the provider roster before spawn.
The selected default provider must advertise `accept-edits` plus a native Plan
action. Pin the provider and explicit permission provenance. Encode the Plan
action as structured initial command input with exact mention offsets rather
than a plain prompt or later turn, and keep the helper hidden only for
organization.

Require the proposed Plan body to be the strict tagged JSON draft envelope.
Reconciliation classifies pending interactions, captures only the expected
Plan, stops first, archives second, and persists last. Never approve, deny,
resolve, or plugin-cancel the Plan interaction. Unexpected interactions stop and
fail closed. An archive failure retains reconciliation state so a later pass can
archive and complete; idle compatible output remains a bounded fallback.

The prompt treats repository content as untrusted reference material and tells
the model not to implement. The modal still requires separate user confirmation
before any external issue mutation, and docs disclose selected-provider model
usage.

## GitHub CLI process boundary

Resolve `gh` only from fixed absolute POSIX or Windows candidates outside the
current project, requiring a regular executable file. Ignore `PATH` and
`PATHEXT`, then invoke the verified absolute path with a pure exact environment
projection.

The child environment contains only named GitHub tokens/host/config, standard
user configuration and keyring roots, upper/lower HTTP(S)/no-proxy settings,
TLS CA settings, conditional Windows `SYSTEMROOT`, and fixed noninteractive,
no-update, no-telemetry, `C` locale policy. It excludes unrelated BB/provider/
cloud/tracker secrets, `ALL_PROXY`, CGI state, runtime/loader injection, debug,
TTY, editor, pager, and browser controls.

## Carried-forward thread-header UI

Use the released `Ticket` icon for `TaskboardThreadHeaderAction`. Preserve the
existing `aria-label`, tooltip, compact ghost-button geometry, right-panel pin
state, and open behavior. Add a focused source test that isolates the component
and rejects regression to `PanelRight`; no broader layout or interaction change
is introduced.

## Version and marketplace alignment

Set Taskboard manifest, root lock record, root/plugin install docs, and focused
assertions to `0.3.3` / `^0.3.3`. Keep Usage Tracker entry source intent at
`^0.1.3`; its compatible range may resolve newer published patches without a
marketplace edit.

Prepare marketplace commit `822f0c7`'s three-file shape on current upstream,
changing only Taskboard's range from `^0.3.2` to `^0.3.3`:

- `A entries/taskboard.json`
- `A entries/usage-tracker.json`
- `A icons/taskboard-0b77950c.svg`

The icon remains the exact 414-byte source artwork with SHA-256
`0b77950cec05ed35134dcc8d0c8ff96460c806106cb8e28cedeb15903ccd08ef`.
The Taskboard copy discloses optional repository-aware native Plan drafting and
model usage. Marketplace build/schema/icon/diff validation runs locally; public
`^0.3.3` liveness is explicitly deferred until separate release approval. The
unchanged upstream Ports source failure, if still present, is reported rather
than attributed to this PR.

## Verification and release gate

Run focused Taskboard tests, typecheck, SDK types, root checks, build metadata,
cross-platform process contracts, clean production-only consumer verification,
and fresh-context code/security/UI review against the exact committed tree.
Verify the marketplace three-file diff, hashes, build, remote heads, and current
PR status.

Only a later exact approval packet may authorize branch push, new annotated tag,
GitHub Release, source PR, marketplace force-with-lease update, or PR comment.
Recheck every lease immediately before mutation and stop if any remote head has
changed.
