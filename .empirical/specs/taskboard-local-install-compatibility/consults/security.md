# Installation security consult

Specialist: security

Verdict: advisory

No blocking findings in the scoped installation design. Private credential preservation, a pinned loopback service, existing Codex authentication, and an empty queue are appropriate controls.

| Severity | Category | Location | Finding and recommendation |
| --- | --- | --- | --- |
| Low | Security verification | design.md native service verification; spec.md AC-3 | Loopback binding and token enforcement were not explicit verification criteria. Verify the running listener and rejection of missing or incorrect tokens using the harmless queue-read endpoint. |

The isolated specialist assessed only the specification, design, and delta; this was not a claim of implementation verification.

Installation follow-up: lsof confirmed that the Symphony process listens on 127.0.0.1:4000. Taskboard's authenticated queue route returned HTTP 401 both without credentials and with an invalid plugin token; neither check submits or starts work. The initial GET probe returned 404 because the queue route uses POST; the subsequent POST probe is the applicable authentication observation. The advisory is addressed by these observed checks without changing product source.
