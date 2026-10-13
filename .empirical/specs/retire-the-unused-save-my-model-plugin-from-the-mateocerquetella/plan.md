# Plan: Retire Save My Model

1. Remove `plugins/save-my-model/` and
   `docs/marketplace-save-my-model.json`.
2. Remove the Save My Model entry from `.bb/plugins.json`.
3. Run `npm install` at the workspace root to regenerate `package-lock.json`;
   inspect the diff and retain only changes attributable to the retired
   workspace.
4. Validate catalog-to-directory alignment and search active source,
   documentation, and lockfile paths for stale package references.
5. Run the focused remaining workspace checks and then the root `npm run check`.
6. Confirm the historical Save My Model tags still resolve to the same commits,
   inspect the complete diff, and complete Empirical review and integration
   gates against `mine/main`.
