# Plan

1. Fetch PR #48's head ref for local review and confirm the base and current
   branch state.
2. Start the repository-wide development watcher once before plugin edits.
3. Apply the PR changes to the isolated branch, then tighten
   `claude-keychain-usage.ts`:
   - exact service-name validation,
   - fixed safe failure messages,
   - bounded response parsing,
   - preserved fixed Anthropic origin and argumentized Keychain lookup.
4. Update `server.ts` and `load-usage.ts` so the override is used only for
   primary-machine snapshots; add focused tests for remote-host behavior and
   all new failure cases.
5. Update `plugins/usage-tracker/package.json`, `CHANGELOG.md`,
   `package-lock.json` if applicable, and the taskboard distribution assertion
   from `0.1.8` to `0.1.10`.
6. Run the Usage Tracker focused check and the affected distribution test; fix
   failures without broad unrelated refactors.
7. Run the Empirical verification selection and root repository checks, collect
   receipts, and perform the fresh-context review.
8. Commit the source changes, push the branch to the PR, wait for required
   GitHub checks, post the review summary, and merge only after all gates pass.
9. Confirm no npm publication, tag, or GitHub Release was created and report
   the merged commit and version.
