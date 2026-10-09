# Plan

## Iteration 4

1. Add bounded image schema, signature validation and Linear native upload.
2. Add paste/file selection previews and user-gesture clipboard capture.
3. Split Create only and Start now with synchronous duplicate-submit guard.
4. Strengthen drafting prompt and add focused regression coverage.
5. Typecheck, build, install and inspect creation controls.

1. Extend the factory run schema/state with backward-compatible continuation
   provenance and add prompt support for the previous blocked Build result.
2. Add a guarded service path that resumes a blocked Build in its original idle
   managed session and routes explicit Start task to it.
3. Reconcile obsolete Build pause state only after a newer native turn starts.
4. Add focused regression tests for same-session resume, prompt contents,
   idempotence, hard gates, uncertainty, persistence, and review continuation.
5. Update Taskboard documentation and run focused then complete verification.
6. Add bounded ticket improvement contract/parser and owned hidden-helper
   start/status/cancel lifecycle using project execution defaults.
7. Connect existing Create modal fields to Improve, cancel, Undo, and guarded
   asynchronous result application; preserve metadata and explicit Create.
8. Add parser/lifecycle/UI regression tests and document verification pending
   under the iterative workflow.
# Iteration 2

1. Replace run insights with themed phase/step overview and collapsed history.
2. Style header progress and route Original ticket to existing detail.
3. Remove implicit pin calls without removing manual pin controls.
4. Build, install and reload; add focused regression tests and inspect browser.

# Iteration 3

1. Extend the typed Factory RPC contract with a bounded per-run, per-path diff
   response and authorize requests against the durable record before calling
   BB's environment patch API.
2. Add service and handler tests for a real patch, an unknown run/path, missing
   environment and an unavailable or truncated workspace response.
3. Replace the Changed files path list with a selectable unified viewer backed
   by `experimental_Diff`, including loading, empty and unavailable states.
4. Refactor current progress into one stage/status/activity hierarchy, collapse
   updates and commands by default, and make earlier runs dense summary rows.
5. Add a live-status glyph and update-arrival animation only for starting or
   running work, guarded by `prefers-reduced-motion`.
6. Update preview fixtures and focused UI assertions, run typecheck and focused
   tests, then build, install, reload and inspect wide/panel/phone layouts in
   light, dark and reduced-motion modes.
