# Design: Retire Save My Model

## Approach

Remove `plugins/save-my-model/`, its `.bb/plugins.json` entry, and
`docs/marketplace-save-my-model.json`. Regenerate `package-lock.json` from the
root workspace after removing the package so npm removes the workspace link and
package records consistently. Do not hand-edit generated lockfile data.

## Boundaries

- Keep the README as already updated on `main`.
- Preserve Git tags `save-my-model/v0.1.0` through `v0.1.3`.
- Preserve unrelated `.empirical/` history and only update current repository
  context artifacts if validation reports them stale.
- Do not change the upstream marketplace or other plugin packages.

## Verification

1. Parse `.bb/plugins.json` and compare its entries to `plugins/*/package.json`.
2. Search active package, README, catalog, and lockfile files for
   `save-my-model` references.
3. Run `npm install` from the repository root and inspect lockfile changes for
   unrelated churn.
4. Run the root workspace check command.
5. Confirm the four historical tags still resolve to their original commits
   and review the complete implementation diff.

## Rollback

The package files, catalog entry, marketplace staging file, and lockfile can be
restored from the parent commit if verification fails. Historical tags are not
modified by this change.
