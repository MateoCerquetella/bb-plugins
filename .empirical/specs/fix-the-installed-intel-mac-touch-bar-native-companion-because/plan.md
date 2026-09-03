# Plan: Touch Bar input routing repair

1. Replace the incorrect child hit-test coordinate conversion with receiver-local
   bounds checks and remove all native controller `mouseDown` action dispatch.
2. Keep the standard horizontal `NSScrollView` lane and all existing settings,
   thread, snapshot, BTT, and exact-id behavior; strengthen source contract tests
   against regressions.
3. Run focused plugin tests and the root check, then compile/install on the
   enrolled Intel Mac and inspect the runtime marker and interaction log.
4. Record human hardware evidence, run fresh-context review, and integrate the
   reviewed capability delta.
