# Plan

1. Capture the existing focused tests and installed project policy.
2. Delegate one scoped implementation owner for engine/process boundary tests,
   validated outputs, timing and safe preflight diagnostics. Preserve UI/defaults.
3. Review the exact diff, run focused checks, repair substantive findings.
4. Install/reload the local owning plugin and verify existing project CLI and
   browser operations. Never make paid calls without explicit approval.
5. Record evidence and remaining live-model/full-suite limitations; consolidate
   into context, review and QA gates.

## Throughput checkpoint
- Blocking first steps: specification and design precede implementation.
- Independent workstreams: parent owns environment evidence; worker owns code.
- Shared mutable state: only parent drives the real project browser.
- Smallest safe decomposition: one code owner avoids concurrent adapter edits.

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
- Real project Steel navigation and inspection, no model calls.
- Full workspace suite after explicit approval where required by policy.
