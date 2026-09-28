# Stable local install

Restore only the GitHub adapter compatibility already present in installed release 8e6f27c4. Keep the approved execution implementation and UI unchanged. Use an additive development version so the installed source is identifiable.

Install from a stable Git worktree outside `.bb/plugins/environment-git-worktree`. BB 0.44 supports path-source moves but refuses catalog-to-path replacement. Its remove operation deletes plugin settings, schedules, and secrets, while keeping the plugin SQLite database. Before replacement, disable Taskboard, make an owner-only database/files backup, retain its original source identity, and restore its secret directory before loading the new path. The installed release has no settings and no schedules. Validate database counts and secret-file hashes without printing secret contents.

For full setup, place verified Erlang OTP 28 and Elixir 1.19.5 distributions under the user's local share directory. Build the pinned Symphony source and supplied tracker extension natively, avoiding cross-platform workspace dependencies. Keep service credentials in a mode-0600 environment file and use a user LaunchAgent for lifecycle. Configure only Taskboard's own HTTP token; reuse Codex's existing login. Startup must see an empty execution queue and must not submit work.

Verification uses the released GitHub tests plus existing Taskboard execution tests, live plugin status/source, preserved state checks, and native Symphony health/configuration. Rollback restores the backed-up source and secrets through supported plugin lifecycle operations.
