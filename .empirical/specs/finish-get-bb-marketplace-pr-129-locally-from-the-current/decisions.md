# Decisions: Finish Marketplace PR 129 Locally

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Enforce issue drafting with structured native Plan mode

Status: Accepted

### Evidence

Taskboard `0.3.1` spawns with `permissionMode: 'auto'`, hidden visibility, and
only prompt-level read-only instructions. SDK `0.4.6` accepts
`accept-edits`, `auto`, and `full`; it has no public `readonly` or `plan`
permission value. Providers advertise Plan separately as a structured composer
action, and pending Plan text arrives as a provider approval interaction.

### Options

- Keep the hidden auto-approved worker and rely on prompt text.
- Change only to visible `accept-edits`, which still permits workspace edits.
- Preflight native Plan support, use structured initial Plan input with
  `accept-edits`, consume the plan, and stop without resolving it.
- Remove repository-aware drafting.

### Chosen approach

Preflight project defaults and the provider roster for `accept-edits` plus an
advertised Plan action. Pin the provider and execution provenance, send the
Plan command as structured initial input, keep the background thread hidden,
consume a valid pending Plan as the draft, stop the runtime before persistence,
and archive afterward. Never approve, deny, resolve, or plugin-cancel the
provider interaction. Unsupported or unexpected cases fail to the original
editable prompt.

### Trade-offs and risks

Plan drafting is unavailable for providers without the advertised action. A
hidden thread avoids sidebar noise and prevents a user racing to approve the
plan; visibility is not treated as a security boundary. Initial structured
input avoids the BB 0.38 later-turn Claude Plan-mode bug.

### Verification

Unit-test provider selection and exact mention metadata. Test pending Plan and
unexpected interaction paths, stop-before-persist/archive ordering, and absence
of interaction resolution/cancellation. Run a safe live provider smoke test
when available.

## D-002: Erase the SDK-root runtime import

Status: Accepted

### Evidence

`contract.ts` value-imports `defineRpcContract`, an SDK `0.4.6` identity
helper. BB's production-only subdirectory install omits the dev-only SDK, so the
frontend graph cannot resolve that value. BB type generation/checking requires
the exact SDK pin to remain in `devDependencies`.

### Options

- Depend on monorepo hoisting, which the real Git install does not provide.
- Move the SDK into production dependencies, conflicting with BB's generated
  type placement contract.
- Replace the identity helper with a type-only `PluginRpcContract` constraint.

### Chosen approach

Import `PluginRpcContract` type-only and export the existing contract object
with `satisfies PluginRpcContract`. Keep exact SDK `0.4.6` development-only and
add manifest/source regression assertions.

### Trade-offs and risks

The source becomes slightly more explicit but emitted JavaScript loses an
unnecessary dependency. `satisfies` retains literal inference and rejects a
malformed RPC contract at typecheck time.

### Verification

Run SDK types check and typecheck, assert the source has no SDK-root value
import, then build after a clean production-only subdirectory install with no
SDK package or root module tree present.

## D-003: Allowlist the GitHub CLI child environment

Status: Accepted

### Evidence

`runFile` currently inherits the complete plugin-server environment. A bare
`gh` lookup would also let an empty, relative, or project-writable leading PATH
entry choose the executable that receives GitHub credentials. `gh api`
legitimately needs GitHub token/config/host state, platform config roots,
optional keyring bus access, proxy/TLS settings, and Windows runtime support,
but not child executable search state or unrelated variables.

### Options

- Keep full inheritance and only pin locale.
- Pass just `PATH`, `HOME`, and `GH_TOKEN`, preserving hijack risk and breaking
  supported configurations.
- Resolve a verified absolute executable from sanitized candidates, then use an
  exactly tested cross-platform child allowlist without search state.

### Chosen approach

Resolve only fixed common absolute candidates outside the current project,
ignore PATH entirely, require a regular executable file, and invoke the
verified absolute path. Copy only GitHub tokens/host/config, standard POSIX/Windows config roots,
Linux keyring bus, upper/lowercase HTTP(S)/no-proxy, TLS certificate variables,
and Windows `SYSTEMROOT`. Set noninteractive/no-update/no-telemetry flags and
fixed `C` locale. Never pass `PATH` or `PATHEXT` to the authenticated child.

### Trade-offs and risks

The list is larger than a token-only environment so persisted/keychain,
enterprise, corporate proxy, CA, and Windows installs keep working. Custom
relative/project-local `gh` launchers fail closed. It excludes `PATH`,
`PATHEXT`, `ALL_PROXY`, CGI `REQUEST_METHOD`, debug/TTY/editor/pager values,
dynamic loader hooks, and every unrelated variable.

### Verification

Exact-output tests cover token/config/keyring/proxy/CA preservation, fixed
absolute POSIX/Windows candidate resolution, counterfeit PATH rejection,
Windows runtime variables, fixed policy/locale, and omission of search state,
representative secrets, and injection variables.

## D-004: Rebase the marketplace source floor to the corrected patch

Status: Accepted

### Evidence

Marketplace commit `69eb7b4` deleted the stale npm entries and Taskboard icon,
so PR #129 now has delete/modify conflicts. Usage Tracker `0.1.3` is accepted;
Taskboard `0.3.1` is the broken lower bound. The plugin icon bytes hash to the
existing `0b77950c` filename.

### Options

- Keep `^0.3.1`, allowing liveness to resolve the known-broken tag.
- Split Usage Tracker into a separate PR.
- Replay both accepted entry migrations, restore the icon, and raise only the
  Taskboard floor to `^0.3.2`.

### Chosen approach

Prepare the existing PR result on current upstream as three additions:
Taskboard entry, unchanged Usage Tracker entry, and the content-hashed
Taskboard icon. Set Taskboard to `^0.3.2` and disclose optional Plan-only AI
drafting plus model usage.

### Trade-offs and risks

The eventual update rewrites the conflicting PR branch and needs
force-with-lease. Local schema/build/icon validation can complete before the
tag; source-liveness must wait for the separately approved immutable tag.

### Verification

Audit the exact three-path diff, icon digest, JSON source fields and description,
run marketplace build before release, then run full source-liveness after the
public tag and before the approved branch update.
