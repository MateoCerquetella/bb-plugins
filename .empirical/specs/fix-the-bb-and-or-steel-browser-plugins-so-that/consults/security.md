# Security Advisory

Specialist: security

Verdict: advisory

## Assessment

The change only adds agent-facing wording and source assertions. It does not
accept credentials, read browser storage, expose CDP or Connect URLs, alter
session provisioning, or change the iframe origin checks. The smallest safe
implementation is therefore the current instruction-only change.

## Findings

- Severity: low
- Category: hardening
- Location: `plugins/steel-browser/server.ts` and
  `plugins/steel-browser/skills/steel-browser/SKILL.md`
- Recommendation: Keep the explicit prohibition on requesting credentials in
  chat and on opening external viewers; retain the existing viewer's auth
  failure behavior.
