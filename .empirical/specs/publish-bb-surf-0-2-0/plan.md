# Plan: BB Surf 0.2.0 Release

## Steps

1. **Baseline** — confirm `origin/main` contains the Jev engine (`jev-runtime.ts`,
   `engines.ts`) and still declares `0.1.0` in `plugins/steel-browser/package.json`.
2. **Version** — set `plugins/steel-browser/package.json` to `0.2.0` and sync the
   root lockfile record with `npm install --package-lock-only`.
3. **Docs** — change the documented Git install range to `@^0.2.0` in the root
   `README.md` and `plugins/steel-browser/README.md`.
4. **Focused gate** — `npm run check --workspace bb-plugin-steel-browser`
   (types:check, typecheck, tests, build) on the release commit.
5. **Merge** — push `release/steel-browser-0.2.0`, open a PR, wait for CI, merge
   into `main`.
6. **Tag** — create and push `steel-browser/v0.2.0` on a commit that
   `git merge-base --is-ancestor` accepts against `origin/main`; verify the tag
   tree contains the Jev sources.
7. **Marketplace** — in the `get-bb/marketplace` checkout, set the entry range to
   `^0.2.0`, name the selectable engines in the description, add the `jev` tag,
   run `npm run build` and `npm test`, push a branch to `fork`, open the PR.
8. **Local install** — reload the running `steel-browser` plugin and confirm it
   is healthy with the Jev settings intact; refresh the catalog.
9. **Evidence** — record receipts for each acceptance criterion, then integrate
   and deliver.

## Risks during execution

- Marketplace CI validates the remote tag, so step 6 must finish before step 7.
- The release branch starts from `origin/main`; no unrelated plugin changes are
  included.
- The local plugin stays a path source, so no secrets are rewritten.

## Affected tests

- plugins/steel-browser/test/distribution.test.ts
- plugins/steel-browser/test/engines.test.ts
