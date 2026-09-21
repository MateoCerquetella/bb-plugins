# Security Advisory

Specialist: security

Verdict: advisory

## Findings

### S-001: Release-tag race or replacement

- Severity: medium
- Category: authorization / supply-chain integrity
- Location: release sequence and marketplace resolution in `design.md`
- Finding: a conflicting tag created after local verification but before push,
  or any attempt to move an existing tag, could make the marketplace resolve
  content other than the reviewed release commit.
- Recommendation: fetch remote tags immediately before publication, refuse if
  either exact tag exists, create annotated tags only after the release commit
  is reachable from remote `main`, push without force, then verify the peeled
  remote object IDs and `main` ancestry.

### S-002: Marketplace source confusion

- Severity: low
- Category: untrusted-input / distribution identity
- Location: Git source and marketplace requirements in `spec.md` and the
  `plugin-git-distribution` delta
- Finding: publishing to npm or using an unprefixed tag could select the wrong
  package or repository version despite correct local manifests.
- Recommendation: publish only `dockside/v0.1.5` and `aura/v0.2.2`, retain the
  existing subdirectories and tag prefixes, and validate the live marketplace
  JSON plus semver resolution after publication.

No blocking exploit path remains if both recommendations are enforced as
release gates. The reviewed changes add no credential handling, authentication
surface, command interpolation, or new untrusted-input sink.
