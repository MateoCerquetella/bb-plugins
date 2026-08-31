# Security Consult

- Specialist: security
- Verdict: advisory

## Finding SEC-001: Repository text can poison a schema-valid draft

- Severity: medium
- Category: prompt injection / unintended disclosure
- Location: `design.md` native Plan-only issue drafting; `deltas/board-capture.md` repository-content scenario
- Recommendation: Continue treating every returned field as untrusted text, enforce conservative length and control-character validation, render the complete draft safely, and retain separate explicit confirmation with no automatic issue mutation. Native Plan mode prevents implementation but does not make generated content trustworthy.

## Finding SEC-002: Forwarded proxy and CA values remain trusted routing input

- Severity: low
- Category: credential transport / configuration trust
- Location: `design.md` GitHub CLI child environment; `deltas/taskboard-github-cli.md` authenticated CLI scenario
- Recommendation: Keep proxy and custom-CA variables documented as administrator-controlled inputs, preserve TLS verification, and never broaden the allowlist. Retain the fixed absolute non-project executable resolver and regression coverage excluding `PATH`, `PATHEXT`, unrelated secrets, loader hooks, debug, editor, and pager controls.
