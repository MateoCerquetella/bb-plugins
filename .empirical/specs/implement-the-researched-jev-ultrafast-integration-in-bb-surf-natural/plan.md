# Plan

1. Capture the existing focused tests and installed project policy.
2. Register both API keys as native BB secret settings and merge nonblank saved
   values over the optional private dotenv environment at runtime.
3. Remove frontend inference based on unavailable secret values and document
   the credential precedence and paid-run boundary.
4. Add behavioral tests for saved-only credentials, per-key fallback, missing
   credentials, file validation, and paid authorization.
5. Review the exact diff, run focused checks, repair substantive findings.
6. Install/reload the local owning plugin and verify the settings UI, project
   CLI, and browser operations. Make paid calls only after explicit approval.
7. Record evidence and remaining live-model/full-suite limitations; consolidate
   into context, review and QA gates.

## Throughput checkpoint
- Blocking first steps: specification and design precede implementation.
- Independent workstreams: parent owns environment evidence; worker owns code.
- Shared mutable state: only parent drives the real project browser.
- Smallest safe decomposition: extend the existing settings and preflight path
  without a custom credential API or frontend state.

## Affected tests
- plugins/steel-browser/test/projects.test.ts
- plugins/steel-browser/test/engines.test.ts
- plugins/steel-browser/test/jev-runtime.test.ts
- plugins/steel-browser/test/distribution.test.ts
- plugins/steel-browser/test/actions.test.ts

## Checks
- Node test runner with JUnit output for the owning plugin.
- npm run check --workspace bb-plugin-steel-browser
- Installed bb surf --help and project.
- Real project Steel settings, navigation and inspection; separately authorized
  live model calls are measured and reported without changing the default.
- Full workspace suite after explicit approval where required by policy.
