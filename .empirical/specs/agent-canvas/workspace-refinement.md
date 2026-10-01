# Workspace Refinement

The user's latest feedback supersedes the forced dark presentation: use BB
theme variables for all plugin-owned chrome. A workspace tab denotes a project;
worktrees filter the project's live panes. Its Main thread remains visible
across worktree filters. Stable project IDs scope saved geometry and Main-thread
selection; labels are display-only.

The native composer creates a Main thread only after explicit submission.
It must remain in the selected project. No cross-thread summaries, JEV routing,
or monitoring tools are injected by this refinement. Native chat preserves
thread permissions. Missing saved threads show unavailable instead of silently
selecting another thread.

The previous decorative minimap is removed; actual scrolling, zoom, fit, and
reorganization remain available. Main-thread creation uses a wide compose
surface instead of squeezing native controls into the dock.

Build, typecheck, local install/reload, CLI projection, and a live light-theme
desktop readback succeeded during the iteration. Automated tests and the full
verification matrix remain pending.
