# Security Consult

Specialist: security

Verdict: advisory

The new Jev entry point accepts a natural-language goal and runtime output across
process and HTTP boundaries. The plausible attacks are credential disclosure,
unauthorized paid execution, bridge impersonation, oversized requests, arbitrary
CDP method dispatch, and forged success output.

No blocking finding was identified. The implementation requires explicit
per-run authorization, reads only a private bounded credential file, returns
fixed diagnostics, binds the bridge to loopback with a timing-safe bearer token,
caps request size and lifetime, allowlists CDP methods, validates parameters,
and rejects malformed or non-terminal runtime output without replay.

Recommendation: retain these guards as invariant behavior and keep the bridge
and process-path tests in the focused BB Surf suite.
