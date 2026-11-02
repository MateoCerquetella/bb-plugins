# Security Consult — Factory Bots Hardening

- Specialist: security
- Verdict: advisory

## Scope

The follow-up changes config loading, MCP child spawning, start-command display,
service retry behavior, and the panel poll loop. The plugin remains a read-only
observer of the Empirical Factory.

## Findings

### Finding

- Severity: low
- Category: hardening
- Location: plugins/factory-bots/lib/mcp-client.ts
- Recommendation: Keep the allowlisted child environment and shell:false argv; add any future required runtime variable deliberately.

The child no longer inherits provider tokens or other BB process secrets; it
gets runtime paths, locale/timezone, Windows home keys, and the config's own
`env`.

### Finding

- Severity: low
- Category: information exposure
- Location: plugins/factory-bots/lib/config.ts
- Recommendation: Add a conservative user:pass@ redaction fallback if malformed credential-bearing URLs become supported.

`redactUrl` strips userinfo when the value parses as a URL. A malformed
credential-bearing value falls back to the raw string.

### Finding

- Severity: low
- Category: correctness
- Location: plugins/factory-bots/lib/config.ts
- Recommendation: Restrict script validation to the first non-flag script or an explicit script field.

The scanner validates path-like command/args and skips `://` URLs; a path-like
non-script argument can still be treated as a required file. It fails closed
with a configuration message and cannot execute anything.

## Conclusion

No exploitable write path, authentication bypass, credential exposure, or
command injection was found. The read-only tool surface and the fail-closed
behavior are intact. Advisory only; no blocking security finding.
