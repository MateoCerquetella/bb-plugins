# Security Advisory

- Specialist: security
- Verdict: blocking

## Finding SEC-001: Existing shares can bypass container ownership validation

- Severity: high
- Category: trust boundary / project isolation
- Location: `design.md` matching-share path and AC-3
- Finding: If the saved dedicated container is gone or mismatched, an
  attacker-controlled local process can bind the saved API and CDP ports and
  answer the liveness probes. When a matching Connect share already exists,
  accepting it without validating container ownership leaves the authenticated
  viewer routing to that process. Exact origin comparison does not close this
  path because the existing share already has the expected origin.
- Recommendation: Run the existing dedicated-container verifier before
  accepting either a matching share or creating a missing one. On mismatch,
  propagate a non-recreation readiness failure, do not cache success, permit a
  later retry, and cover the matching-share/container-mismatch case with a
  regression test that proves no expose call or browser recreation occurs.

## Exploit Review

The viewer-origin mismatch and Connect-error guards otherwise respond
correctly: failures propagate, success is not cached, and the container repair
path is not entered. SEC-001 remains blocking until every healthy-looking
viewer path validates ownership of the dedicated project container.
