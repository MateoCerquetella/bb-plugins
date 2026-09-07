# Plan

1. Reconcile baselines and current contracts.
   - Install workspace dependencies and repin Save My Model to BB 0.42.1's
     exact Plugin SDK.
   - Compare Host Monitor v0.1.5 with `origin/main` and inventory the smallest
     released delta.
   - Re-read live marketplace entries, PR branches, CI failures, and current
     v2 schema before editing marketplace artifacts.

2. Implement Save My Model's supported workflow.
   - Add a typed RPC contract for BB host listing and per-host selection
     resolution using `bb.sdk.hosts.list` and
     `bb.sdk.system.executionOptions`.
   - Extract pure selection reconciliation and bounded error mapping for unit
     coverage.
   - Replace the read-only settings table as the primary surface with a
     responsive machine selector and BB's controlled host-routed provider/model
     picker; retain saved-record review and clear-all as secondary controls.
   - Preserve storage migration and validate unavailable/disconnected cases.
   - Update package metadata, README, and focused backend/frontend/storage tests.

3. Correct Action Topbar stacking.
   - Introduce one intermediate overlay-tier custom property and apply it to the
     launcher and drag artifacts.
   - Add contract coverage for relative page/launcher/host-dialog ordering and
     rerun all existing launcher interaction tests.

4. Reconcile released source and marketplace preparation.
   - Replay the exact Host Monitor v0.1.5 source and lockfile delta onto this
     branch while preserving current main changes and the immutable tag.
   - Repair Usage Tracker marketplace metadata on its existing PR branch only
     if the live range does not already make the requested update redundant.
   - Prepare new Save My Model, Action Topbar, and Touch Bar release versions
     and marketplace entry assets locally, deriving plugin IDs and validating
     every claim against observed behavior.
   - Do not push, tag, publish, update PR branches, or create releases until the
     exact account/repository/commit/version/source/commands are shown and
     separately approved.

5. Verify and hand off the release boundary.
   - Run configured focused, contract, portability, clean-consumer, and full-CI
     checks through Empirical receipts.
   - Install/reload changed plugins from this checkout in BB 0.42.1 and exercise
     Save My Model with multiple connected/disconnected hosts and Action Topbar
     over ordinary content plus a host dialog.
   - Capture light, dark, and narrow screenshots where required; perform
     fresh-context review and inspect the complete diff for unrelated changes.
   - Present exact release and marketplace remote mutations for approval, then
     stop if approval is not granted.
