# Plan

1. Replace Action Topbar's `task` SVG path data with the target/dart geometry
   already established by Taskboard.
2. Run the focused Action Topbar tests.
3. Install/reload Action Topbar and inspect the Taskboard launcher/tab icon in
   BB Surf.
4. Review the exact diff for unnecessary scope or structural regressions.

## Affected tests

- plugins/action-topbar/test/action-catalog.test.ts
- plugins/action-topbar/test/content-script-contract.test.ts
- plugins/action-topbar/test/tab-model.test.ts
