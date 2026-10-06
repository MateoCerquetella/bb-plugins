# Security Advisory

- Specialist: security
- Verdict: advisory

## Findings

None. No blocking security issue remains in the reviewed specification, design,
or capability delta.

## Exploit Review

The earlier exploit required a local process to impersonate Steel on the saved
API port, satisfy liveness checks, and cause BB Connect to reuse or create a
share targeting the attacker-controlled listener. The revised design closes
that path by validating the running dedicated container's ownership before
listing, trusting, or creating any share. A listener that merely occupies the
saved port is therefore insufficient.

The smallest effective fix is the one now specified: make successful container
ownership validation a mandatory precondition for share inspection and API-port
exposure, propagate validation failures, and never cache success on failure.
