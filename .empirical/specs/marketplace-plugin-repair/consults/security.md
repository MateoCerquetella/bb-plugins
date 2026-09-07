# Security consult

Specialist: security

Verdict: advisory

## Findings

- Severity: low
  Category: local navigation coordination
  Location: `plugins/host-monitor/server.ts`, `plugins/host-monitor/sidebar-modal.ts`
  Finding: the one-use Host Monitor open request is process-global, so another
  authenticated BB tab could consume it first. The request only causes an
  in-app navigation to an already enrolled host and expires after 15 seconds;
  it does not grant access, execute host work, or expose a credential.
  Recommendation: keep the one-use TTL and enrolled-host validation. Add a
  tab/session correlation field only if BB later exposes a public requester
  identity through the CLI or RPC surface.

- Severity: low
  Category: local data exposure and resource exhaustion
  Location: `plugins/host-monitor/server.ts`, `plugins/touchbar/native/Sources/AgentModel.swift`
  Finding: Touch Bar reads host resource summaries through the local BB CLI.
  The projection contains no process names, command lines, addresses, prompt
  text, or credentials, caps the host list at 100, caps native output at 1 MiB,
  and bounds command execution and termination waits.
  Recommendation: retain these projection, size, and timeout bounds when adding
  future Touch Bar fields.

- Severity: informational
  Category: preference integrity
  Location: `plugins/save-my-model/server.ts`, `plugins/save-my-model/lib/preferences.ts`
  Finding: Save My Model derives hosts and execution options from BB public SDK
  calls, validates explicit enrolled hosts, bounds persisted records, and does
  not create or modify threads. No independent registry or transport expands
  the trust boundary.
  Recommendation: continue reconciling stored preferences against the selected
  host's live catalog before presenting them as supported.

- Severity: informational
  Category: publication boundary
  Location: `.empirical/specs/marketplace-plugin-repair/spec.md`
  Finding: tags, releases, pushes, marketplace updates, and labels remain
  unexecuted pending an exact user approval naming the remote mutations.
  Recommendation: preserve that gate and use immutable plugin-prefixed tags.
