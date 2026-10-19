# Plan

## Implementation

1. Update the Steel Browser server registration and every user-facing CLI
   usage string to `bb surf`.
2. Update the bundled skill, README examples, runtime guidance, and error
   messages while preserving internal `steel-browser` identifiers and the
   viewer directive.
3. Extend distribution tests to prove the `surf` registration and unchanged
   internal identity.
4. Run focused plugin checks and build.
5. Install and reload the plugin from this worktree, then exercise
   `bb surf --help` and a read-only command.
6. Commit, push, open a pull request to `main`, observe checks, and merge the
   approved PR.

## Affected tests

- plugins/steel-browser/test/actions.test.ts
- plugins/steel-browser/test/distribution.test.ts
- plugins/steel-browser/test/navigation.test.ts
- plugins/steel-browser/test/projects.test.ts
- plugins/steel-browser/test/provisioning.test.ts
- plugins/steel-browser/test/rpc-timeout.test.ts
- plugins/steel-browser/test/steel-client.test.ts
