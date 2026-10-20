# Merge The Dockside Filter Branch Filter By Bbplugins Thr Q7uptvnbap

## Request

> Merge the dockside filter branch filter-by-bbplugins-thr_q7uptvnbap into main and release Dockside v0.1.8: bump version (0.1.7 is already taken by an unrelated tag), update changelog/README if needed, run dockside checks, tag dockside/v0.1.8, push branch/tag, and verify the marketplace install resolves 0.1.8.

## Goal

Ship the reviewed Dockside sidebar grouping and status-filter work that exists
only on `filter-by-bbplugins-thr_q7uptvnbap`, as an immutable `dockside/v0.1.8`
Git release that the existing `^0.1.0` marketplace range resolves for users.

## Acceptance Criteria

- [ ] [AC-1] A merge commit on the release branch has
  `origin/filter-by-bbplugins-thr_q7uptvnbap` as an ancestor, and
  `plugins/dockside/lib/sidebar-sections.ts` exists on the release commit.
- [ ] [AC-2] `plugins/dockside/package.json` reports version `0.1.8`, and the
  annotated tag `dockside/v0.1.8` peels to a commit that contains the filter
  work.
- [ ] [AC-3] `npm run build`, `npm run typecheck`, and `npm test` pass for
  `plugins/dockside` at the released commit.
- [ ] [AC-4] The built app bundle contains the new grouping labels
  (`Projects`, `Status`, `Environment`) and the `Failed` status filter.
- [ ] [AC-5] A fresh Git install using the marketplace range/form
  (`@^0.1.0 --subdirectory plugins/dockside --tag-prefix dockside/`) resolves
  `0.1.8`, not `0.1.7`.
- [ ] [AC-6] `dockside/v0.1.7` and every earlier Dockside tag remain immutable
  at their original commits.

## Scope

- Merge the six filter commits into the release branch on top of current
  `origin/main`.
- Bump Dockside to `0.1.8`, update its README release-version reference if it
  names a range.
- Run the plugin build, typecheck, and tests.
- Create and push `dockside/v0.1.8` only after the merged release commit is
  verified.
- Verify semver resolution of the marketplace source.

## Non-goals

- Changing the marketplace entry JSON or its `^0.1.0` range.
- Changing BB SDK pins, plugin IDs, or unrelated plugins.
- Redesigning the filter UI beyond what the branch already contains.
- Force-pushing, rewriting history, or moving an existing tag.

## Verification

- `git merge-base --is-ancestor origin/filter-by-bbplugins-thr_q7uptvnbap HEAD`
- `node -p "require('./plugins/dockside/package.json').version"`
- `npm run build`, `npm run typecheck`, `npm test` in `plugins/dockside`
- `git ls-remote --tags origin dockside/v0.1.8` plus a peeled commit check
- Git source resolution for `dockside/` `^0.1.0` returning `0.1.8`
