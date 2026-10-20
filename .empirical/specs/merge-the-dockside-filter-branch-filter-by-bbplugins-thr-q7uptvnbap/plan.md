# Plan

## Steps

1. Merge `origin/filter-by-bbplugins-thr_q7uptvnbap` with `--no-ff` into the
   release branch (expected clean).
2. Bump `plugins/dockside/package.json` to `0.1.8`.
3. Update the Dockside README release link from `dockside/v0.1.5` to
   `dockside/v0.1.8`.
4. Build, typecheck, and test the Dockside workspace.
5. Confirm the built `dist/app.js` contains `Projects`, `Status`,
   `Environment`, and `Failed` grouping/filter labels.
6. Commit the release preparation, push the branch, and open a PR to `main`.
7. After CI passes and the PR merges, create and push `dockside/v0.1.8` on the
   merged `main` commit and publish release notes.
8. Verify the marketplace source form resolves `0.1.8`.

## Affected tests

- plugins/dockside/test/filter-ui-contract.test.ts
- plugins/dockside/test/thread-management.test.ts
- plugins/dockside/test/status-groups.test.ts
- plugins/dockside/test/thread-card-layout.test.ts
- plugins/dockside/test/reorder-ui-contract.test.ts
- plugins/dockside/test/mobile-navigation.test.ts

## Changed files

- plugins/dockside/package.json
- plugins/dockside/README.md
- plugins/dockside/{components,lib,test}/** (from the filter branch merge)
