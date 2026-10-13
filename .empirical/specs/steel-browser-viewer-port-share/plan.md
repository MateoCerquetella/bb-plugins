# Plan

1. Add a dependency-injected viewer share helper to provisioning.ts and call it
   from the server's healthy readiness callback (AC-1, AC-2, AC-3).
2. Add tests for exact-host API-only restoration, reuse, mismatches, command
   failure and validation failure; verify retry and cache semantics (AC-1-4).
3. Update Steel documentation and run focused plugin checks.
4. Install/reload the local plugin; confirm the real missing share is restored
   with existing endpoints and sessions retained.
5. Obtain independent review, record verification, create the fix PR and merge
   only after repository CI succeeds.
