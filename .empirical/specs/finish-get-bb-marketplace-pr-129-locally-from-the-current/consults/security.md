# Security Consult

specialist: security
verdict: advisory

## Findings

### Repository text can poison an otherwise valid draft

- severity: medium
- category: prompt injection / unintended disclosure
- location: `design.md` → “Strict native Plan-only issue drafting”; `deltas/board-capture.md` → “Repository content attempts to redirect the helper”
- exploit: Malicious repository text can steer the model to place deceptive links, control characters, or sensitive repository snippets inside a schema-valid tagged draft. Native Plan mode prevents implementation, but it does not make generated content trustworthy; disclosure occurs only if the user later confirms the visible draft.
- recommendation: Treat every returned field as untrusted text, enforce conservative length and control-character validation, render the complete draft safely, and retain the separate explicit confirmation with no automatic issue mutation.

### Forwarded proxy and CA values remain trusted routing input

- severity: low
- category: credential transport / configuration trust
- location: `design.md` → “GitHub CLI child environment”; `deltas/taskboard-github-cli.md` → “Authenticate through supported GitHub CLI state”
- exploit: An attacker who can alter the plugin server's allowlisted proxy and CA variables together can route authenticated `gh` traffic through a trusted-by-configuration interception point. The narrowed child environment prevents unrelated secret leakage but cannot establish that inherited network settings are benign.
- recommendation: Document proxy and custom-CA variables as trusted administrator-controlled inputs, preserve TLS verification, and never fall back to broader proxy or certificate variables. The fixed absolute non-project executable resolver and omission of `PATH`/`PATHEXT` should remain regression-tested.
