# Marketplace Plugin Repair

## Request

> Fix Save My Model so its per-machine provider, model, and reasoning preference is connected to BB 0.42.1's supported model-selection flow and resolve marketplace PR #154. Reconcile Host Monitor v0.1.5 onto main, repair the Usage Tracker marketplace update, prepare Action Topbar and Touch Bar for release and marketplace submission without publishing until separately approved, and fix Action Topbar launcher stacking so its popover renders above BB page content while remaining below host-owned modal and dialog layers. Preserve unrelated plugin behavior and verify focused tests, workspace checks, managed installation, and live BB behavior.

## Goal

Ship reviewable fixes that make Save My Model useful on the live BB 0.41+
public Plugin SDK surfaces, correct Action Topbar overlay stacking, reconcile
released plugin sources with the default branch, and leave each outstanding
marketplace entry either live or backed by a validated, truthful submission.

## Acceptance Criteria

- [ ] [AC-1] Save My Model lists every machine returned by BB, including its real name, identity, and connected/disconnected state, without maintaining a second host registry.
- [ ] [AC-2] Selecting a machine renders BB's controlled provider/model/reasoning picker routed to that host; a coherent picker change persists for that host and reselecting it restores the saved value.
- [ ] [AC-3] Two hosts and two providers retain independent selections, while malformed, unavailable, or obsolete stored selections safely reconcile to a host-supported value instead of breaking the settings surface.
- [ ] [AC-UI-1] [UI] Save My Model uses BB-native controls and clearly presents loading, empty, connected, disconnected, and provider-unavailable states at narrow and wide widths.
- [ ] [AC-4] Save My Model documentation and marketplace metadata describe the behavior actually shipped on BB 0.41+/SDK 0.4.46 and do not claim to override BB's built-in New Thread picker.
- [ ] [AC-UI-2] [UI] Action Topbar's launcher renders above ordinary BB page content while remaining below host-owned modal and dialog layers, in both light and dark themes and at a narrow viewport.
- [ ] [AC-5] Action Topbar's stacking fix preserves launcher keyboard control, outside-click dismissal, positioning, action activation, and drag behavior.
- [ ] [AC-6] The complete Host Monitor v0.1.5 release source is reconciled onto the repository's default-branch line without changing the immutable release tag or losing unrelated main-line work.
- [ ] [AC-7] Usage Tracker's live marketplace source continues resolving the latest compatible v0.1.8 tag, and its pending metadata update validates against the current marketplace contract.
- [ ] [AC-8] Save My Model's submission has accurate status and passing validation; Action Topbar and Touch Bar have release-ready manifests, immutable-source plans, marketplace entries, icons, screenshots, and truthful compatibility requirements.
- [ ] [AC-9] Focused tests cover Save My Model picker persistence/reconciliation and Action Topbar stacking. Every changed plugin passes typecheck, tests, build, managed-install checks where applicable, and the root workspace check.
- [ ] [AC-10] The changed plugins are installed or moved to this checkout, reloaded in the live BB 0.41 server/SDK 0.4.46 runtime, and exercised against connected and disconnected machines without regressing existing plugin behavior.


## Scope

Save My Model integration through current public Plugin SDK host and picker APIs; its persistence, tests, UI, documentation, manifest, and marketplace submission; Action Topbar overlay stacking and regression tests; Host Monitor release reconciliation; Usage Tracker marketplace metadata repair; and release/submission preparation for repository-owned plugins identified by the marketplace audit.

## Non-goals

Changing BB core, intercepting BB's private DOM, claiming that Save My Model controls the built-in composer, creating another host registry or transport, changing Host Monitor telemetry, redesigning unrelated plugin UI, merging marketplace pull requests, or publishing/pushing/tagging/releasing any new artifact before separate exact release approval.

## Verification

Use focused unit and frontend-harness tests, exact SDK type checks, production plugin builds, package/managed-install checks, the root workspace check, and a live BB 0.41 server/SDK 0.4.46 browser exercise with at least two hosts including a disconnected host. Inspect the final default-branch-relative diff and current marketplace CI. Capture screenshots for each changed or newly submitted visible surface.

Risks include persisting a picker value unsupported by the selected host, confusing plugin preferences with BB's native compose defaults, placing the launcher above security-sensitive host dialogs, releasing from a source that does not match its manifest, and overwriting concurrent main or marketplace work. Preserve immutable tags and stop for exact approval before remote release mutations.

## Capability Deltas

See `deltas/machine-model-preferences.md`, `deltas/action-topbar-distribution.md`, and `deltas/marketplace-release-alignment.md`.
