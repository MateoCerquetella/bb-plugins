# Design: BB 0.45.0 Action-pane bridge port

## Constraints

The installed client is BB 0.45.0 at upstream commit
`129f621771a3e275773992db648316966ac207cf`. The preserved repair was made
against an older checkout and must be reconciled against this exact source
before any installed asset is replaced. The plugin remains the launcher and
drag initiator; the host owns pane routing, split persistence, and cleanup.

## Approach

1. Obtain a clean checkout of the exact 0.45.0 commit in an isolated build
   directory.
2. Apply the preserved patch as a candidate, then resolve conflicts by
   comparing each changed host module with the 0.45.0 baseline. Keep only the
   Action split-drag bridge, pane renderer/navigation, plugin frontend reload
   contract, and terminal auto-create behavior required by the acceptance
   criteria.
3. Run the focused host and SDK tests plus typechecks before packaging.
4. Back up the installed `bb-app/app/dist` tree with a timestamp and record
   its manifest/hash. Replace only after the isolated build succeeds, retaining
   the backup for rollback.
5. Reload the plugin and verify the launcher and a real Action drag in the
   bound Steel browser session, including a screenshot and cleanup after
   release/cancel.

## Compatibility boundaries

The port must preserve 0.45.0 route helpers, split-layout state formats, and
terminal/session APIs. Unsupported plugin hosts continue to receive the
existing compatibility message. No plugin-owned Action panel or unrelated
upstream changes are introduced.

## Failure handling

Any patch conflict, failed focused check, failed build, or ambiguous installed
asset layout stops before replacement. A replacement failure is recoverable by
restoring the timestamped backup. Browser verification is required for the UI
acceptance criterion and cannot be inferred from unit tests.
