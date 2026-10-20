# Security Advisory

- Specialist: security
- Verdict: advisory

## Findings

No security findings.

## Exploit Review

The change adds no new network entry point, credential path, authorization
decision, untrusted-input parser, or execution sink. It changes the public CLI
registration name while preserving the existing handler dispatch, plugin
identity, persisted storage, project bindings, and browser session ownership.

The practical security risk is accidental identity migration: renaming durable
keys or bindings could orphan an existing browser profile and provision a
second session with different cookies or credentials. Preserving every durable
`steel-browser` identifier while changing only the public `surf` command is the
smallest control that closes that path. No blocking finding remains.
