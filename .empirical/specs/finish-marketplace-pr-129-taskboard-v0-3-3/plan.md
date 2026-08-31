# Plan: Finish Marketplace PR 129 with Taskboard 0.3.3

1. Materialize the preserved product overlay from public `origin/main` into the
   isolated `fix/taskboard-v0.3.3-pr129` worktree. Confirm it changes only root
   install docs/lock data, Taskboard source/docs/tests, and the release-candidate
   verifier; exclude the superseded feature's historical Empirical records.
2. Prove release alignment: Taskboard manifest/lock/docs/tests use `0.3.3` and
   `^0.3.3`, the SDK remains exact `0.4.6` dev-only, `contract.ts` has no SDK-root
   value import, and the thread-header action carries `Ticket` plus its focused
   regression test.
3. Revalidate native Plan drafting and GitHub process containment through the
   focused contract, lifecycle/fault, distribution, and POSIX/Windows tests.
   Keep unsupported/failure paths on the editable original prompt and preserve
   stop → archive → persist ordering.
4. Run Taskboard typecheck, SDK types check, focused/full tests, plugin build,
   metadata verification, root workspace checks, and `git diff --check`.
5. Run the clean independent production-only consumer verifier from both the
   candidate working tree and final committed source tree; clean up only the
   task-created temporary consumer directory afterward.
6. Commit the exact reviewed source candidate locally on
   `fix/taskboard-v0.3.3-pr129`, synchronize the local-only Empirical tracker,
   and record current-tree QA plus fresh-context security/code/UI review.
7. Amend the prepared marketplace commit on current upstream so Taskboard uses
   `^0.3.3`. Confirm its diff remains exactly Taskboard entry, unchanged Usage
   Tracker entry, and content-hashed Taskboard icon; run marketplace build,
   schema/icon/hash/diff checks, and report external upstream liveness failures
   separately.
8. Recheck authenticated account, public `v0.3.2` immutability, absence of
   source branch/tag `v0.3.3`, source/main and marketplace/main heads, PR #129
   head/review state, and prepared artifacts. Present every remote-mutating
   command and exact lease in a new approval packet. Stop before push, tag,
   release, source PR, marketplace force-with-lease update, or PR comment.
