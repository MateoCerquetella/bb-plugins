# Activity Overview removal plan

1. Remove the Activity Overview package and its root catalog references.
2. Regenerate the npm lockfile and inspect the diff for unrelated changes.
3. Run focused repository checks for the changed workspace graph.
4. Remove the installed Activity Overview plugin from the current BB host.
5. Verify the active thread and New Thread layout in BB Browser at desktop and
   mobile widths, then collect screenshot evidence.
6. Run the required review and final verification gates.
7. Commit only the scoped product and Empirical feature files, push the branch,
   and open a ready pull request.
