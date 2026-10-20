# Security Advisory

- Specialist: security
- Verdict: advisory

## Findings

- Severity: low
  - Category: supply-chain integrity
  - Location: `plugins/dockside/package.json`, `package-lock.json`, and the Git tag release
  - Finding: Dockside ships runtime dependencies resolved from the committed lockfile. A release built from a different lockfile or a mutable tag could execute code other than the reviewed code.
  - Recommendation: Build and test from the committed tree, publish an immutable annotated `dockside/v0.1.8` tag, and verify the peeled tag commit after pushing. Never force-move an existing tag.

- Severity: low
  - Category: authorization and remote mutation
  - Location: release delivery (PR merge, tag push, GitHub release)
  - Finding: Pushing the release branch, merging the PR, and pushing the tag act through the authenticated maintainer account; local test success does not prove authorization.
  - Recommendation: Keep the remote actions behind the user's explicit request, verify each pushed ref immediately after the push, and stop if a PR check is red.

## Exploit Review

The change adds no new network endpoint, credential path, input parser, or
dangerous sink. The filter UI reads and writes one browser-local storage key
inside `try/catch`, renders project and environment labels as text, and does not
interpret stored values as selectors or paths. The material boundary is release
provenance; the lockfile-bound build, immutable tag, and verification of the
public refs are the smallest controls that close it. No blocking finding.
