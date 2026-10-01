# Plan

1. Extend `TopbarDragState` with the initiating pointer ID.
2. Capture the primary pointer in `beginTopbarDrag`, filter move/up/cancel
   handlers to that pointer, and release capture in `endTopbarDrag`.
3. Add tab-button touch suppression and a near-maximum ordered stacking tier
   for the topbar, launcher, drop overlay, and drag ghost.
4. Strengthen the content-script contract tests for pointer lifecycle, touch
   behavior, and strict overlay ordering.
5. Run focused Action Topbar tests and typechecking.
6. Build/install/reload the local plugin and verify tab dragging, Action
   dragging, desktop overlap, and narrow-screen overlap in BB.
7. Submit the exact implementation and evidence through fresh-context review,
   verification, and integration gates.
