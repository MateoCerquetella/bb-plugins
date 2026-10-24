# Plan

1. Update the two branding icons that still inherit host color:
   - `plugins/aura/assets/icon.svg`
   - `plugins/steel-browser/assets/nav-icon.svg`
2. Remove Agent Canvas:
   - delete `plugins/agent-canvas`
   - drop its entry from `.bb/plugins.json`
   - drop its row from `README.md`
   - run `npm install` to regenerate `package-lock.json`
3. Update the marketplace checkout:
   - rewrite aura, dockside, host-monitor, lavender, and steel-browser icons
     with explicit `#7c3aed`
   - rename each to its content hash and update the matching `entries/*.json`
   - keep the BB Surf listing metadata unchanged
4. Verify:
   - focused Aura check
   - full workspace check
   - Agent Canvas reference scan
   - marketplace build and icon color sample
5. Commit each repository separately and report the exact validation results.

## Affected tests

- `plugins/aura/test/lifecycle.test.ts`
- `plugins/steel-browser/test/distribution.test.ts`
