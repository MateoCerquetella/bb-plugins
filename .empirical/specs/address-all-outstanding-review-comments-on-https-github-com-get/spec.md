# Address All Outstanding Review Comments On Https Github Com Get

## Request

> Address all outstanding review comments on https://github.com/get-bb/marketplace/pull/162 for the Dockside plugin: move every runtime-imported package from devDependencies to dependencies, verify a clean managed installation/build and the repository checks, prepare the required new matching plugin release, and update the existing marketplace PR. Do not perform any Git push, tag push, release publication, or PR mutation until the explicit release approval required by the submit-a-plugin workflow is obtained.

## Goal

Make Dockside installable through BB's managed Git marketplace path and leave
marketplace pull request #162 ready for maintainer re-review.

## Acceptance Criteria

- [ ] [AC-1] Dockside declares Hugeicons, Radix Context Menu, Radix Select,
  `clsx`, `tailwind-merge`, and `zod` as runtime dependencies rather than
  development-only dependencies.
- [ ] [AC-2] The root lockfile agrees with the Dockside manifest, and a clean
  production dependency installation can resolve every package imported by
  Dockside at runtime.
- [ ] [AC-3] Dockside's tests, typecheck, and BB plugin build pass after the
  dependency correction.
- [ ] [AC-4] A new patch version and matching immutable `dockside/vX.Y.Z` tag
  are prepared from the reviewed release commit without moving v0.1.0.
- [ ] [AC-5] Marketplace pull request #162's entry has one valid current
  category and passes the marketplace build/check suite against the new
  matching Dockside release.
- [ ] [AC-6] The maintainer is told which release was published and asked to
  repeat the managed installation check.

## Scope

- `plugins/dockside/package.json` and the matching root lockfile records.
- A patch release of Dockside from this repository.
- The existing `MateoCerquetella:submit-dockside` marketplace branch and pull
  request #162.
- The smallest marketplace metadata update required by the current contract.

## Non-goals

- No Dockside UI, behavior, persistence, or permission changes.
- No unrelated plugin dependency or version changes.
- No replacement or deletion of the existing `dockside/v0.1.0` tag.
- No marketplace source, branding, icon, description, or ownership change.
- No Git push, tag push, release publication, or PR mutation before the
  submit-a-plugin workflow's explicit release approval.

## Verification

- Audit Dockside's source-level runtime imports against `dependencies`.
- Perform a clean production-only install and resolve each runtime dependency.
- Run Dockside tests, typecheck, and `bb plugin build` with `BB_CLI` cleared.
- Run the repository-wide `npm run check` from the workspace root.
- Validate the marketplace branch with its documented install, build, test,
  v1 gate, and check commands.
- Confirm the public Git tag, PR checks, and review state after approved
  delivery.

## Capability Deltas

- `deltas/dockside-managed-marketplace-install.md`
