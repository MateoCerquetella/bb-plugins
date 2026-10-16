# Plan

1. Extend `thread-management.ts` with a preset-or-project filter selection and
   one pure group-filtering function.
2. Add project choices and active project labeling to `filter-menu.tsx`.
3. Wire the selection and live project list through `thread-inbox.tsx`, including
   recovery when a selected project disappears.
4. Add behavioral coverage for project scoping and preserve preset assertions.
5. Update UI contract coverage for the Projects section and inbox wiring.
6. Run focused tests, Dockside typecheck and tests, install/reload the plugin,
   and verify the live filter in BB.

## Affected tests

- plugins/dockside/test/thread-management.test.ts
- plugins/dockside/test/filter-ui-contract.test.ts
