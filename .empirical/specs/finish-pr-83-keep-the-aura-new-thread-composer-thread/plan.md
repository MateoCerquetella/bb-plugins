# Plan: Finish PR 83

1. Merge current `origin/main` into the feature branch. Resolve source changes
   deliberately and regenerate `package-lock.json` with `npm install`.
2. Inspect the installed New Thread DOM through the existing Steel browser
   project at desktop and mobile widths. Record the composer and slot ownership
   facts that determine the narrow CSS change.
3. Remove the activity component's duplicate heading and adjust only
   `COMPOSE_CENTER` rules needed to keep the native composer horizontally
   centered with the overview enabled or disabled.
4. Add or update behavioral component coverage for the single-heading result
   and preserve existing activity states, races, links, and native draft.
5. Run the focused AURA check. Install and reload AURA from this checkout, then
   verify the real UI at desktop and 390px widths.
6. Run fresh-context review, fix blockers, and run the repository verification
   matrix including the full workspace check.
7. Commit and push the verified branch, update PR 83 when needed, and run the
   GitHub PR watcher until the forge reports it merge-ready.
