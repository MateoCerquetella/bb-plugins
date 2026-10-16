# PR85 Repair Plan

- Rebase on current main preserving native event reconciliation, header settings, and result/error UI.
- Run focused Taskboard checks, root checks, and browser fixture; fix material regressions.
- Review the current diff and record exact evidence; push existing PR with a lease, retain draft if live verification is incomplete, and do not merge.

## Affected tests

- plugins/taskboard/test/factory.test.ts
- plugins/taskboard/test/empirical-observation.test.ts
- plugins/taskboard/test/empirical-status.test.ts
- plugins/taskboard/test/empirical-serial.test.ts
