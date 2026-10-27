# Publish BB Surf 0.2.0

## Request

> Publish BB Surf 0.2.0 with the Jev engine: bump plugin version, tag steel-browser/v0.2.0, update the BB Community marketplace entry range

## Goal

BB Surf 0.2.0 is the published release that ships the Jev execution engine.
A user who installs from the BB Community listing or from the documented Git
range receives the merged `main` tree with Jev, while the existing local
installation keeps running.

## Acceptance Criteria

- [ ] [AC-1] `plugins/steel-browser/package.json` declares `0.2.0` and the root lockfile records the same version.
- [ ] [AC-2] Tag `steel-browser/v0.2.0` exists on the release commit merged into `main`, and its tree contains `plugins/steel-browser/jev-runtime.ts` and `plugins/steel-browser/engines.ts`.
- [ ] [AC-3] The root README and the plugin README install commands name `@^0.2.0`.
- [ ] [AC-4] `entries/steel-browser.json` in `get-bb/marketplace` uses range `^0.2.0` and the marketplace build validates the entry against the pushed tag.
- [ ] [AC-5] The local BB installation reports `steel-browser` running after a reload and still exposes the Jev credential settings.

## Scope

- `plugins/steel-browser/package.json`, `package-lock.json`, root `README.md`, `plugins/steel-browser/README.md`.
- The `steel-browser/v0.2.0` Git tag on `main`.
- `entries/steel-browser.json` in the `get-bb/marketplace` repository and its pull request.

## Non-goals

- No engine, protocol, or settings behavior change.
- No new plugin id, subdirectory, tag prefix, or display name.
- No changes to other plugins, including their pending release work.
- No force push, no history rewrite, no removal of the local installation.

## Risks

- The previous `steel-browser/v0.1.1` tag was cut from an unmerged branch, so a
  tag can point at a tree that does not contain the merged line. The release
  tag must be created on a commit that is already merged into `main`.
- A marketplace range that resolves to a tag without the Jev sources would
  ship the old engine under a new listing.
- Replacing the local path-source installation would delete the saved API keys.

## Verification

- `git ls-remote --tags origin steel-browser/v0.2.0` and `git ls-tree` on the tag show the release tree.
- `npm run check --workspace bb-plugin-steel-browser` (types, typecheck, tests, build).
- `npm run build` and `npm test` in the marketplace checkout.
- `bb plugin reload steel-browser`, `bb plugin list`, `bb plugin config steel-browser`.

## Capability Deltas

- `deltas/plugin-git-distribution.md`
- `deltas/bb-surf-marketplace-listing.md`
