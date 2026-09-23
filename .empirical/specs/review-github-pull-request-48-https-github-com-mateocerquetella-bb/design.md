# Design

## Chosen approach

1. Bring the PR head into the isolated branch and preserve its focused
   Keychain implementation as the starting point.
2. Tighten the service validator to the documented Claude service forms and
   keep the Keychain command argumentized through `execFile`.
3. Replace raw caught exception text with fixed user-safe messages and bound
   any provider error payload at the adapter boundary.
4. Pass the override only when `loadUsageSnapshot` is loading the primary
   machine. Remote-thread snapshots continue to use BB's host-specific data.
5. Add regression cases for request origin/header construction, malformed
   service names, safe transport errors, and remote-host behavior.
6. Advance Usage Tracker to `0.1.10`, update its changelog and the distribution
   assertion that currently hard-codes `0.1.8`, then update the lockfile only if
   the workspace metadata requires it.
7. Run focused checks first, then the repository check, push the reviewed head,
   wait for GitHub CI, comment on the PR, and merge only after the exact head is
   green.

## Boundaries

- The Keychain item is an input boundary; service validation happens before any
  command invocation.
- The Anthropic URL is a fixed outbound boundary; no user-controlled URL or
  header is accepted.
- RPC output is a trust boundary; access tokens, command output, and raw
  exceptions never cross it.
- A remote thread host is a separate authority; server-local credentials cannot
  override its usage.
- Version assertions are a distribution boundary; all active references must
  agree before delivery.

## Trade-offs and risks

- The PR's direct Anthropic request duplicates BB core behavior until BB fixes
  its Keychain derivation. Keeping the override opt-in and local limits this
  compatibility surface.
- Account email remains null because the selected Keychain item does not carry
  it; the UI must retain its existing null-safe rendering.
- CI may expose unrelated base-branch drift. Only failures causally connected
  to the PR or its release metadata will be fixed on this branch.
- No local macOS Keychain can be used in CI. Tests use injected dependencies and
  dummy tokens only.
