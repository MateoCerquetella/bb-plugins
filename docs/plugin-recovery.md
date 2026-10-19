# Restore a missing local plugin

Local path installations depend on that directory remaining on disk. Do not
install plugins for daily use from `/tmp` or a BB thread worktree. For new
installations, prefer the Git release or BB Community commands in each README.

If BB reports a missing directory for an existing local installation, do not
run `bb plugin remove`. That command deletes settings, secrets, and schedules.
BB supports moving a local installation by installing its new path with the
same plugin ID.

## Relocate the source

Choose a new directory outside temporary storage and managed worktrees. If
the directory below already exists, inspect it before continuing. Do not
replace or reset an existing checkout.

```sh
git clone https://github.com/MateoCerquetella/bb-plugins.git \
  "$HOME/.bb/plugin-sources/durable-bb-plugins"
cd "$HOME/.bb/plugin-sources/durable-bb-plugins"
npm ci
bb plugin install "$PWD/plugins/steel-browser"
bb plugin install "$PWD/plugins/taskboard"
bb plugin reload steel-browser
bb plugin reload taskboard
bb plugin list --json
bb steel-browser status
bb taskboard status --json
```

Use a reviewed revision compatible with the previously installed version.
The commands above use the repository's default branch. They retain the
`steel-browser` and `taskboard` IDs rather than uninstalling them.

Both plugins should report `running`. BB Surf's status also checks its Steel
service. Taskboard's status reports whether its configured tracker is
available. A disabled GitHub plugin prevents GitHub refresh even when
Taskboard itself is running.

## Keep the recovery durable

Keep this standalone clone outside BB's managed worktrees. Keep its `origin`
pointed at GitHub, not a local worktree. Back up BB's data using your normal
secure backup process; a source clone is not a backup of plugin settings or
credentials.

These are pinned local installations, so `bb plugin update` does not track
marketplace releases for them. Update the clone deliberately, install its
dependencies, and reload the plugins after reviewing changes. Thread cleanup
no longer removes their source, but manual deletion and disk loss remain
possible.
