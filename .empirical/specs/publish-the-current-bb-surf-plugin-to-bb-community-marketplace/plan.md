# Plan

## 1. Prepare The Source Release

- Change BB Surf's manifest and lockfile workspace version from `0.1.0` to
  `0.1.1`.
- Leave Dockside at its already prepared `0.1.7`.
- Confirm the source diff contains release metadata only for this feature.

## 2. Verify The Plugin Commit

- Run both focused plugin checks.
- Install and reload both plugins from local paths.
- Exercise `bb surf project`, `bb surf status`, Dockside registration, and the
  relevant installed UI.
- Run the root workspace check and capture receipts.
- Complete independent review and integrate the exact release commit.

## 3. Publish Immutable Releases

- Create annotated `steel-browser/v0.1.1` and `dockside/v0.1.7` tags on the
  reviewed commit.
- Push the commit and tags without rewriting existing refs.
- Create GitHub releases with concise behavior and verification notes.
- Re-read remote refs, release metadata, and both tagged manifests.
- Resolve or install both public Git ranges through BB.

## 4. Update BB Community

- Create or refresh a clean fork branch from `get-bb/marketplace:main`.
- Update the BB Surf display name, description, and content-addressed icon.
- Update Dockside's description to include mobile active-thread navigation.
- Keep both source ranges, subdirectories, ids, and tag prefixes unchanged.
- Run all marketplace checks after the public releases exist.
- Commit, push, open one pull request, and apply `v1-change`.
- Read back the pull request diff and checks.

## 5. Report The Catalog Difference

- Download the live v2 marketplace document.
- Compare its plugin ids with `.bb/plugins.json`.
- Annotate each missing id with the repository display name, manifest privacy,
  and README work-in-progress status.
- Report release URLs, pull request state, verification, and the exact
  distinction between released and live-marketplace publication.

## Affected tests

- `plugins/steel-browser/test/distribution.test.ts`
- `plugins/steel-browser/test/projects.test.ts`
- `plugins/steel-browser/test/provisioning.test.ts`
- `plugins/dockside/test/distribution-contract.test.ts`
- `plugins/dockside/test/mobile-navigation.test.ts`
- `plugins/dockside/test/mobile-navigation-ui-contract.test.ts`
