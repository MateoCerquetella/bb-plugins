# Security Consult

- specialist: `security`
- verdict: `advisory`

## Findings

### SEC-1

- severity: `medium`
- category: `data-integrity / boundary-safety`
- location: `deltas/usage-tracker-provider-usage.md`, scenario “Thread attribution is incomplete”; design “Implementation”
- finding: If an unknown activity state is represented as an own `inUse: undefined` property, the in-memory response can carry a value outside the declared JSON contract. A caller that consumes the object before serialization, performs own-key checks, or applies a different serializer can misclassify unknown activity as an explicit state. A stale boolean is a more direct integrity issue: spreading the provider without removing the old key can report a provider as active or inactive after attribution becomes incomplete.
- recommendation: Construct the unknown-activity branch by explicitly removing `inUse` (object rest/destructuring), and only assign `true` or `false` when the corresponding activity fact is known. Keep regression assertions for own-key absence, JSON round-trip equality, and stale `inUse` removal. This is the smallest fix that closes the state-confusion path without changing frontend semantics.

### SEC-2

- severity: `low`
- category: `information-disclosure`
- location: `deltas/dockside-thread-management.md`, requirement “Projects remain reachable before their first thread”
- finding: Preserving an empty project group and its launcher exposes the existence and name of a known project even when it has no visible threads. If the surrounding project list can include names outside the current user's intended visibility scope, search can become an existence oracle. The delta itself does not introduce an authorization boundary, so this is a deployment/integration risk rather than evidence of a required blocker.
- recommendation: Preserve the existing authorization/source filtering before grouping and searching; apply the empty-group behavior only to projects already returned as visible by BB. Add a regression case asserting that an unauthorized or out-of-scope project cannot be reintroduced merely because its name matches the search term. Do not broaden project discovery as part of this fix.

### SEC-3

- severity: `medium`
- category: `change-control / supply-chain`
- location: `spec.md` AC-6/AC-8 and `design.md` Integration
- finding: Merging a moving, conflicted, draft, failing, or explicitly WIP pull request can integrate unreviewed code and bypass the stated verification boundary. A stale head or overridden check also makes the review evidence non-reproducible, which can turn an otherwise narrow fix into an unintended code execution or data exposure change.
- recommendation: Treat the exact observed head SHA, current review state, mergeability, and passing focused/root checks as merge preconditions. Merge only with an expected head SHA; leave #57 and #69 open when their blockers remain. This is the smallest process control that closes the unsafe-integration path and requires no product-code change.

## Security Conclusion

The requested correction is security-relevant primarily because it restores a trustworthy JSON boundary and preserves review gates. No blocking vulnerability is established by the scoped design. The medium findings should be covered by the specified tests and merge procedure; the empty-project visibility check is the only additional low-cost hardening recommendation.
