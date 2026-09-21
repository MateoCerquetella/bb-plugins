# Plan

1. Record exact PR heads, ancestry, full diffs, live release tags, and
   marketplace source contracts.
2. Correct PR #42's isolation-policy regression and stale marketplace wording
   on its maintainer-editable head; rerun Dockside typecheck, 206 tests, build,
   and whitespace checks.
3. Submit approving reviews and merge #42, then update the isolated clone to
   the new remote `main`.
4. Re-evaluate #45 against the new `main`; rerun Aura typecheck/tests/build,
   Dockside regression checks, and whitespace checks; approve and merge.
5. Create a release branch from post-merge `main`; bump Dockside to 0.1.5 and
   Aura to 0.2.2, update lockfile and release notes, and commit the reviewable
   release unit.
6. Run affected plugin checks and repository CI; perform fresh-context review
   of the exact release diff.
7. Merge the release branch, verify remote `main`, create immutable annotated
   `dockside/v0.1.5` and `aura/v0.2.2` tags, and publish matching GitHub
   releases.
8. Verify tag peeling/main ancestry and confirm live marketplace ranges
   `^0.1.0` and `^0.2.1` resolve the new tags.
9. Archive the capability delta and report the PR, release, marketplace, test,
   and untouched-primary-checkout outcomes.
