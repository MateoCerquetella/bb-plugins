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

- Severity: low
- Category: correctness
- Location: `plugins/dockside/test/thread-card-layout.test.ts`
- Recommendation: Keep the integration repair test-only. Aligning the stale
  grid-column assertion has no runtime attack surface and avoids changing the
  Dockside component or its rendered UI.
