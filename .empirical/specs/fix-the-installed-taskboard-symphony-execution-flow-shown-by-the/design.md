# Robust execution defaults

Add a small server-side resolver next to Taskboard's execution registration.
It validates that the configured project source is a Git worktree, reads the
exact HEAD revision, and resolves the base branch in this order:

1. the attached branch;
2. an exact local branch pointing at HEAD, preferring `main`, `master`, then a
   stable lexical choice;
3. the branch named by `refs/remotes/origin/HEAD`;
4. Git's configured `init.defaultBranch`.

The resolver returns Taskboard's stable execution DTO fields and does not
change route selection or execution-engine behavior. Internal Git command
failures are converted at this boundary to a repository/base-branch message.

The execution panel will format Zod validation issues into a concise field
message. Existing approval, execution, verification, and tracker transitions
remain unchanged.

Tests create temporary repositories for attached and detached cases and cover
the failure message. The installed stable source receives the tested commit,
then BB reloads Taskboard through its supported plugin lifecycle.
