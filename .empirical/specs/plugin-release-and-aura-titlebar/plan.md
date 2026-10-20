# Plan: Plugin releases and Aura title bar

1. Reproduce the Taskboard documentation failure and the Aura layer geometry
   with the existing focused test interfaces.
2. Update both Taskboard install examples to `^0.3.5`.
3. Add the framed-only Aura layer offset and extend the lifecycle regression to
   prove framed and unframed behavior.
4. Run the three plugin focused checks and the root workspace check.
5. Install and reload Aura in BB, then capture framed thread, framed new-thread,
   and unframed or narrow browser evidence through BB Surf.
6. Review and commit the exact source changes. Run the configured No Mistakes
   gate if its repository prerequisites are present.
7. Push the exact reviewed commit. Create and inspect the Action Topbar and
   Taskboard tags and GitHub releases.
8. Prepare the separate Taskboard marketplace change, validate it, and open or
   update its pull request. Do not alter private plugin listings or bypass PR
   #621's required label.
9. Merge only exact reviewed heads with passing checks. Confirm the merged Aura
   fix before closing issue #92.

## Affected tests

- `plugins/taskboard/test/distribution.test.ts`
- `plugins/aura/test/lifecycle.test.ts`
- `plugins/aura/test/live-browser.mjs`
