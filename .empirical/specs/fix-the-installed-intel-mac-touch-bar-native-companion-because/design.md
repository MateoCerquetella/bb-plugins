# Design: reliable Touch Bar input routing

## Approach

Keep the existing horizontal `NSScrollView` and stack layout. Remove custom
`mouseDown` dispatch from native child buttons so AppKit's tracking can cancel a
click when the contact becomes a horizontal drag. Keep
hit-test overrides for composite buttons, converting AppKit's superview-coordinate
point exactly once to each receiver's local coordinates. The
scroll view itself must not override `hitTest` or `mouseDown`; its existing
horizontal `scrollWheel` handling remains the only gesture behavior.

The server snapshot, CLI commands, BTT companion, settings model, and red close
control remain unchanged. The focused source contract test explicitly rejects
the five correct conversions and rejects controller `mouseDown` overrides.

## Failure handling

- A failed `bb touchbar open` logs an error and does not activate BB.
- A malformed or unknown command continues to fail without mutation.
- If the snapshot cannot be read, the native store keeps its last good state and
  eventually renders the existing reconnecting state.

## Verification plan

1. Run the focused Touch Bar tests and the full repository check.
2. Build and install on the enrolled Intel Mac; confirm the new runtime marker.
3. Physically tap a settings control, swipe to a later card, tap that card, and
   inspect the log for one completed action with no spurious action on drag.
4. Run fresh-context review against the committed diff and retain receipts.
