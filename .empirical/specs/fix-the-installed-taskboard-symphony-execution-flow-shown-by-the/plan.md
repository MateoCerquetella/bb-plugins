# Implementation plan

1. Add a Git execution-defaults resolver with deterministic attached and
   detached branch inference and actionable boundary errors.
2. Use the resolver from the existing `executionDefaults` RPC without changing
   request, routing, approval, engine, verification, or tracker contracts.
3. Format shared-schema validation issues in the existing review dialog.
4. Add focused tests for attached, detached, fallback, invalid repository, and
   form-validation behavior.
5. Run the Taskboard checks, review the change, copy the verified commit into
   the stable local source, and reload the live plugin.
