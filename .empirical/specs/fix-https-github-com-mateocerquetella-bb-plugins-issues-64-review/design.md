# Design

## Evidence

Issue #64 reproduces an explicit undefined own property from
`markProvidersInUse`. Existing activity tests compare only the property value.
PR #66 at 758384a21a97f35139f3a63e83a0c1ca8bc6818c adds empty groups but
`searchProjectThreadGroups` discards them even when their name matches.
PR #57 is unchanged at 203a79c5f2bff206670b17f0bfa081abe605f38e: draft,
conflicted, failing CI, and broad unrelated history. PR #69 at
47df5cb483d7c07b7037ebca347c2fce6581c8a5 is conflicted and explicitly WIP
with outstanding parity and verification obligations.

## Implementation

Use object rest to remove any prior `inUse` value when attribution is unknown.
Do not serialize and deserialize production data as a workaround. Preserve
positive activity and complete-count booleans.

Add tests for absent count API, rejected counts, omitted groups, mixed known
and unknown provider groups, and stale activity properties. Assert JSON
round-trip identity and property absence.

Prepare Usage Tracker 0.1.15 metadata and changelog without changing SDK
versions. Keep Dockside's existing UI; fix its search predicate to retain
matching project names. Integrate #66's contribution with its authorship intact,
and test empty/mixed/unknown project grouping and search.

## Integration

Commit each code fix separately. Verify before merging through GitHub with an
expected head SHA. Do not override checks or draft/conflict state. If updating
the contributor's branch is not authorized, integrate the correction through a
companion PR first so #66 becomes safe against the updated main.

Leave #57 and #69 open with their observed blockers. Root checks include plugin
builds with BB_CLI cleared. No new UI design or mockup is needed: existing
project headers and Usage Tracker strip retain their rendering contracts.

## Risks

Using `{ ...provider }` alone would retain a stale `inUse` value, so tests cover
both stale booleans. JSON stringify alone silently drops undefined; equality
after round-trip must be asserted. Current PR heads may move, so refresh them
before integration.
