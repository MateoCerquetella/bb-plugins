# Design: BB Surf 0.2.0 Release

## Outcome

One published release, `steel-browser/v0.2.0`, whose tree is the merged `main`
line with the Jev engine, plus a marketplace entry that resolves to it.

## Release shape

The plugin repo has three version-bearing surfaces and one resolution surface.

| Surface | File | Current | After |
| --- | --- | --- | --- |
| Plugin manifest | `plugins/steel-browser/package.json` | `0.1.0` | `0.2.0` |
| Lockfile record | `package-lock.json` | `0.1.0` | `0.2.0` |
| Documented Git range | root `README.md`, `plugins/steel-browser/README.md` | `@^0.1.0` | `@^0.2.0` |
| Marketplace resolution | `get-bb/marketplace` `entries/steel-browser.json` | `^0.1.0` | `^0.2.0` |

`bb plugin install git:…@^0.2.0 --subdirectory plugins/steel-browser --tag-prefix steel-browser/`
resolves the highest `steel-browser/v0.2.x` tag. The tag prefix is what keeps
this monorepo's releases independent.

## Tag point

The `steel-browser/v0.1.1` tag was cut from an unmerged branch, so the tag tree
is older than `main`. This release tags a commit that `main` already contains:
bump on `release/steel-browser-0.2.0` from `origin/main`, open the PR, merge,
then tag the merge commit (or the release commit, once it is an ancestor of
`main`). The tag tree therefore contains `jev-runtime.ts` and `engines.ts`.

## Marketplace path

`get-bb/marketplace` stores one entry per plugin. A source, name, or brand
change needs a new entry; a semver range bump is an entry update. The change is
a range edit plus a description that names the selectable engines, pushed from
the existing `fork` remote and opened as a PR against `get-bb/marketplace`.

Marketplace CI validates the entry and its remote source, so the tag must exist
before the PR is opened.

## Local installation

`steel-browser` is installed on this host from the worktree path, with both Jev
API keys saved as BB plugin secrets. Replacing the source with a Git install
would delete those secrets, so the local install stays a path source; the proof
that 0.2.0 works is the tag tree plus the reloaded running plugin.

## Failure modes

- **Tag on an unmerged branch** → users get an older tree. Prevented by tagging
  after the merge and checking `git merge-base --is-ancestor <tag> origin/main`.
- **Range bump without a tag** → marketplace CI fails to resolve the source.
  Prevented by pushing the tag first.
- **Unrelated release work pulled in** → other plugins' pending version bumps
  stay untouched.

## Verification plan

1. `npm run check --workspace bb-plugin-steel-browser` on the release commit.
2. `git ls-remote --tags` and `git ls-tree` on the pushed tag.
3. `npm run build` and `npm test` in the marketplace checkout.
4. `bb plugin reload steel-browser`, `bb plugin list`, `bb plugin config steel-browser`.
