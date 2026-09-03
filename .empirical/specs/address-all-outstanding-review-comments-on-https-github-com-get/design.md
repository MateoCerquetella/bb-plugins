# Design

## Overview

Repair Dockside's Git distribution at the package boundary, release it as
`dockside/v0.1.1`, and make the smallest current-contract update to the existing
marketplace submission.

## Source repository changes

1. Bump `plugins/dockside/package.json` from `0.1.0` to `0.1.1`.
2. Keep Hugeicons and `zod` in `dependencies`, and move Radix Context Menu,
   Radix Select, `clsx`, and `tailwind-merge` there from `devDependencies`.
3. Leave type packages, TypeScript, and packages referenced only by type imports
   in `devDependencies`.
4. Regenerate only the affected root `package-lock.json` workspace records.
5. Extend Dockside's distribution contract test so a future regression fails
   before publication.

## Verification design

- Statically compare Dockside's external runtime imports with its manifest.
- Pack/copy the plugin into an isolated temporary consumer, install with
  development dependencies omitted, and resolve all six reviewed packages.
- Run Dockside's focused test, typecheck, build, contract, portability, and
  system checks with `BB_CLI` cleared where BB is invoked.
- Run the root workspace check and full CI command selected by Empirical.
- Independently review the diff in a fresh context.

## Release and marketplace delivery

After local verification, create a source-repository release commit and present
the authenticated account, remote, commit, package/version, source, tag, and all
remote-changing commands for explicit approval. Once approved:

1. Push the source branch and annotated `dockside/v0.1.1` tag.
2. Verify that the public tag peels to the approved release commit and that
   `dockside/v0.1.0` is unchanged.
3. Reuse the submitter fork's `submit-dockside` branch in a clean marketplace
   clone, add `"category": "thread-management"`, and preserve the existing
   `^0.1.0` range because it already selects v0.1.1.
4. Run the marketplace repository's documented validation commands and push the
   one-file metadata correction to the existing PR branch.
5. Reply to PR #162 with the new release tag and verification results, asking
   the maintainer to repeat the managed installation check.

## Failure and recovery

- Never move or delete v0.1.0; stop if v0.1.1 already exists remotely.
- Do not push a source tag unless the release commit is the exact reviewed
  commit.
- Do not push the marketplace branch unless it is based on the existing PR head
  and contains only the expected entry edit.
- If the public managed-install validation fails, retain the local fixes and
  report the exact failing step without rewriting published tags.
