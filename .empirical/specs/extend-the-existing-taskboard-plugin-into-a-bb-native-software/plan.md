# Implementation Plan

1. Align Taskboard's SDK pin with the workspace BB release, retaining all
   unrelated dependencies. Verify native thread/environment/event contracts.
2. Implement typed factory records, additive persistence, revision guards,
   lifecycle gates and focused transition/recovery tests.
3. Implement the native BB runtime adapter and dispatch/reconcile service.
   Preserve original tracker identity and project permissions.
4. Wire typed RPCs and native progress reporting into Taskboard. Keep tracker
   mutations entirely separate and all terminal acceptance gates explicit.
5. Add compact progress and lifecycle controls to existing item detail. Navigate
   to the native working thread and restore the originating ticket in the
   existing right panel after navigation/reload.
6. Run Taskboard checks, root checks, isolated native execution and Steel
   desktop/mobile inspection. Record exact results, remaining limitations, and
   independent review evidence. Never install over live Taskboard.
7. Complete workflow only to the highest evidenced level. Do not merge, deploy,
   publish, close tracker items, or erase unrelated Empirical journal changes.
