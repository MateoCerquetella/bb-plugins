# Design

## Release Shape

The source repository remains the canonical code owner. BB Surf advances from
`0.1.0` to `0.1.1`; Dockside is already versioned `0.1.7`. Both release tags
point to the same reviewed repository commit so the existing monorepo source
and independent tag-prefix model remain unchanged.

The BB Community registry continues to install both plugins from compatible Git
ranges. No version pin or new marketplace identity is introduced. The registry
change updates only presentation fields:

- `steel-browser` changes its display name to `BB Surf`, adopts the current
  source icon, and describes the current BB Surf workflow.
- `dockside` adds mobile active-thread navigation to its description.

Both edits touch frozen v1 fields and therefore travel in one pull request with
the marketplace's `v1-change` label.

## Sequence

1. Change only BB Surf's manifest version and lockfile workspace version.
2. Run focused checks, local install/reload, public CLI exercises, and the root
   workspace check.
3. Commit and pass repository review and integration gates.
4. Create and push annotated `steel-browser/v0.1.1` and
   `dockside/v0.1.7` tags at the reviewed commit, then create GitHub releases.
5. Fork or reuse the authenticated marketplace fork, update the two entries and
   vendored BB Surf icon, and validate the clean marketplace checkout.
6. Open one marketplace pull request and apply `v1-change`.
7. Read the live v2 marketplace document and diff its ids against
   `.bb/plugins.json`.

## Boundaries

- Tags are created only after the exact source commit passes verification.
- Marketplace validation runs only after the public tags exist, because its
  liveness check resolves those sources.
- The marketplace pull request is delivery, not live publication. A merged
  pull request and refreshed live document are separate future evidence.
- Generated Empirical state from unrelated completed features is excluded from
  the release commit.

## Verification

The release proof combines executable plugin checks, local BB installation,
public Git tag and release inspection, released-range resolution, marketplace
repository checks, and the opened pull request's CI state. The catalog
inventory uses machine-readable ids from the live v2 JSON rather than README
claims.
