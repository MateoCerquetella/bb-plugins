# Live installation evidence

Observed on 2026-09-28:

- The stable Taskboard source checkout is at commit
  `c52c63fdd025bc47d5adb11f76ab067a2abdab13`.
- `bb plugin reload taskboard` reported
  `taskboard@0.3.5-symphony.0 running` from
  `/Users/mateocerquetella/.local/share/taskboard-symphony/plugin-source/plugins/taskboard`.
- A live `executionDefaults` RPC for BB project `proj_e3szvcfset` returned
  `Repository: configure an accessible Git repository for this BB project`.
- The former `Git validation failed: symbolic-ref` error was not returned.
- `bb project show proj_e3szvcfset --json` identifies its default source as
  `/Users/mateocerquetella/Developer/projects/Roten-App`.
- Git reports that configured source is not a Git repository, so managed
  execution correctly remains blocked until the BB project points to a Git
  checkout.

No Symphony execution was submitted during this check.
