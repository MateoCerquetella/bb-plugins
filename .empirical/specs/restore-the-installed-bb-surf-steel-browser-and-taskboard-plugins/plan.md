# Plan

1. Confirm missing-path registrations and marketplace publication.
2. Clone source outside temporary and BB worktree directories. Install
   dependencies and relocate both registrations through BB without uninstall.
3. Reload both plugins and run their status commands. Record remaining
   external-service limitations without changing disabled dependencies.
4. Correct normal installation instructions and document safe relocation.
5. Review the documentation diff, run scoped checks, and open one focused PR.
   Full-suite execution requires the user's approval through Empirical.

6. Complete the native GitHub adapter with validated CLI responses, bounded
   open/closed issue reads, live details, comments and state changes.
7. Resolve repositories from the selected project's local checkouts on the
   server host, falling back to project metadata only when no local source
   can be read. Remove all Taskboard calls to the GitHub plugin.
8. Preserve creation behavior and replace old RPC fixtures with native CLI
   behavior tests. Add coverage for discovery, auth, scoping, malformed
   responses, concurrent reconciliation and retained cached items on failure.
9. Update setup text. Build and install into the persistent source directory
   without uninstalling Taskboard. Verify live refresh with GitHub absent.
10. Review the final diff and report any verification or delivery gates that
    remain pending.

## Affected tests

- plugins/taskboard/test/github-native.test.ts
- plugins/taskboard/test/create-metadata.test.ts
- plugins/taskboard/test/gitea-integration.test.ts
- plugins/taskboard/test/settings.test.ts
- plugins/taskboard/test/distribution.test.ts
