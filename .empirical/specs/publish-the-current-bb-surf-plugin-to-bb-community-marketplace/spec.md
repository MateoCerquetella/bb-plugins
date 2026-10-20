# Publish BB Surf And Dockside To BB Community

## Request

> Publish the current BB Surf plugin to BB Community Marketplace, update the new Dockside version into the marketplace, and report every other plugin in this repository that is not currently listed in BB Community Marketplace.

## Goal

Publish immutable Git releases for the current BB Surf and Dockside sources,
make BB Community resolve those releases, update the marketplace presentation
where the released behavior or brand has changed, and give the user a
source-backed inventory of this repository's remaining unlisted plugins.

## Acceptance Criteria

- [ ] [AC-1] `steel-browser/v0.1.1` is a public GitHub release whose tag peels
  to the reviewed source commit and whose manifest reports version `0.1.1`.
- [ ] [AC-2] `dockside/v0.1.7` is a public GitHub release whose tag peels to
  the reviewed source commit and whose manifest reports version `0.1.7`.
- [ ] [AC-3] The BB Community entry for plugin id `steel-browser` presents the
  current `BB Surf` brand and resolves the new compatible release without
  changing its stable plugin id, source subdirectory, or tag prefix.
- [ ] [AC-4] The BB Community entry for `dockside` accurately describes the
  mobile navigation included in `0.1.7`, and its compatible Git range resolves
  the new release.
- [ ] [AC-5] Marketplace validation passes for the exact proposed registry
  changes, including build, tests, v1 gate with the required label, and source
  liveness.
- [ ] [AC-6] A marketplace pull request is open with the exact registry changes
  and release evidence. Publication is reported as pending until that pull
  request merges and the live marketplace document changes.
- [ ] [AC-7] The reported unlisted-plugin inventory is computed from the
  repository collection and the live BB Community marketplace ids, and
  distinguishes work-in-progress or private packages without excluding them.

## Scope

- Bump BB Surf's release manifest to `0.1.1` without changing behavior.
- Verify the current BB Surf and Dockside source at their public interfaces.
- Create and publish the two plugin-specific Git tags and GitHub releases.
- Update BB Community metadata for the BB Surf name/icon/description and
  Dockside's released mobile-navigation behavior.
- Open the marketplace pull request and apply the required `v1-change` label.
- Compare `.bb/plugins.json` ids with the live v2 marketplace document.

## Non-goals

- No BB Surf or Dockside feature work beyond release metadata.
- No plugin-id, storage-key, route, CLI compatibility, or source-layout change.
- No attempt to list every unlisted plugin in the marketplace.
- No merge of the marketplace pull request without maintainer review.
- No publication claim before the live marketplace document contains the
  merged update.

## Risks

- A tag placed before verification would make an unreviewed commit immutable.
- A marketplace v1 presentation change without the `v1-change` label would
  fail the compatibility gate.
- Marketplace source validation can resolve an older release if the manifest
  version, tag, and semver range disagree.
- Repository workflow artifacts from other completed features are unrelated
  and must not be included in release commits.

## Verification

- Run the focused complete checks for `bb-plugin-steel-browser` and
  `bb-plugin-dockside`.
- Install/reload both local plugins and exercise their public CLI/UI surface.
- Run the root `npm run check` contract before creating release tags.
- Inspect each tag's peeled commit and manifest version after pushing.
- Install or resolve each released Git range through BB.
- In a clean marketplace checkout run `npm ci`, `npm run build`, `npm test`,
  `npm run gate:v1`, and `npm run check`.
- Read the opened pull request and its checks, then compare repository ids
  against the live v2 marketplace JSON for the unlisted inventory.

## Capability Deltas

- `deltas/plugin-git-distribution.md`
