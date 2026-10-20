# Decisions

## D-001: Keep one distribution unit

Status: Accepted

### Evidence

Both plugins use the same public monorepo and the marketplace liveness check
must resolve both release tags.

### Options

Separate release and registry features; one combined distribution feature.

### Chosen approach

Keep one feature and one marketplace pull request.

### Trade-offs and risks

The verification run covers two plugins, but avoids a registry change that
temporarily references only one prepared release.

### Verification

Inspect both tags and run marketplace liveness in the same clean checkout.

## D-002: Publish BB Surf as a patch release

Status: Accepted

### Evidence

The existing marketplace range is `^0.1.0`; the stable plugin id and
compatibility contract remain unchanged, while the source has unreleased UI,
viewer, CLI, and branding improvements.

### Options

Retag `0.1.0`; publish `0.1.1`; introduce `0.2.0`.

### Chosen approach

Publish `0.1.1`.

### Trade-offs and risks

The patch includes a substantial implementation delta, but preserves the
established pre-1.0 compatible range and does not move an existing tag.

### Verification

The tag manifest reports `0.1.1`, and BB resolves the marketplace-compatible
range to that tag.

## D-003: Preserve marketplace source ranges

Status: Accepted

### Evidence

Both current ranges are `^0.1.0` with plugin-specific tag prefixes and already
admit the requested versions.

### Options

Raise the lower bound; pin exact versions; retain the ranges.

### Chosen approach

Retain the ranges.

### Trade-offs and risks

The entry does not spell out the newest version, but BB can receive future
compatible releases without registry churn.

### Verification

Marketplace source validation resolves the newly published tags.

## D-004: Update frozen presentation fields

Status: Accepted

### Evidence

The live BB Surf entry still displays `Steel Browser`, and the Dockside entry
omits its released mobile navigation.

### Options

Publish tags only; update v2-only overview files; update the canonical v1
presentation fields.

### Chosen approach

Update display name, description, and icon where applicable, and apply
`v1-change`.

### Trade-offs and risks

Maintainer review is required for frozen v1 differences.

### Verification

`npm run gate:v1` passes in the labeled pull request, and generated v1/v2
documents retain the same plugin ids and sources.

## D-005: Compute the unlisted inventory

Status: Accepted

### Evidence

The root collection is the repository's installable directory registry, while
the live v2 document is the deployed marketplace catalog.

### Options

Infer from README badges; compare the two machine-readable id sets.

### Chosen approach

Compare `.bb/plugins.json` with the live v2 marketplace.

### Trade-offs and risks

Recently merged but not yet deployed entries would appear absent; the report
will state its live-document timestamp.

### Verification

Save both id sets and the set difference as task evidence.
