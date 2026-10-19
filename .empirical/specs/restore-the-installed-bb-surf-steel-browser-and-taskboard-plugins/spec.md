# Restore The Installed Bb Surf Steel Browser And Taskboard Plugins

## Request

> Restore the installed BB Surf (steel-browser) and Taskboard plugins from durable sources that will not disappear with temporary directories or BB thread worktree cleanup. Preserve existing plugin settings, project data, and credentials. Verify both plugins run. Inspect their existing BB Community marketplace publication and create the necessary focused pull requests in MateoCerquetella/bb-plugins so durable installation and current releases are correct and users can add them without relying on local worktree paths.

## Goal

Both registered plugins resolve from durable, non-worktree sources and run
without removing their existing IDs, settings, project data, or credentials.
The repository's user-facing install instructions point at immutable Git
release ranges, and focused pull requests are opened for any required
distribution fixes.

Taskboard owns its GitHub issue integration. A user with the GitHub CLI
installed and authenticated can refresh, browse, create, and update issues
without installing BB's separate GitHub plugin.

## Acceptance Criteria

- [ ] [AC-1] `steel-browser` resolves from a durable Git source and reports
  `running` after reload.
- [ ] [AC-2] `taskboard` resolves from a durable Git source and reports
  `running` after reload.
- [ ] [AC-3] Existing plugin IDs remain unchanged and no uninstall or data
  reset is performed.
- [ ] [AC-4] BB Surf and Taskboard README install commands use public immutable
  release ranges rather than a checkout, `/tmp`, or a thread worktree.
- [ ] [AC-5] Repository checks pass and each focused repository PR is opened
  against `main`.
- [ ] [AC-6] Marketplace publication status is recorded from the existing
  merged marketplace PRs; no duplicate marketplace entry is created.
- [ ] [AC-7] With the `github` BB plugin absent, Taskboard discovers the
  repository mapped to the selected BB project and refreshes GitHub issues
  through the authenticated `gh` CLI.
- [ ] [AC-8] Existing Taskboard project selection, cached issues, and source
  identity remain unchanged during the native GitHub migration.
- [ ] [AC-9] Native GitHub issue details, creation metadata, creation, and
  open/closed status changes preserve Taskboard's current observable behavior.
- [ ] [AC-10] Missing `gh`, missing authentication, malformed GitHub responses,
  and repositories outside the selected BB project produce actionable errors
  without replacing the last successful Taskboard cache.
- [ ] [AC-11] Taskboard documentation describes GitHub as native `gh` CLI
  support and does not instruct users to install the GitHub BB plugin.

## Scope

- Relocate the two local registrations to a durable clone under
  `~/.bb/plugin-sources`.
- Update only distribution/install documentation needed to prevent recurrence.
- Replace Taskboard's GitHub cross-plugin RPC calls with a direct `gh` CLI
  adapter.
- Reuse the selected BB project's GitHub remote as the repository scope.
- Preserve Taskboard's existing stored source and work-item records.
- Verify plugin status, reload behavior, and repository checks.
- Open focused GitHub PRs for the repository changes.

## Non-goals

- Do not remove/reinstall either plugin through a destructive command.
- Do not alter saved credentials, project tracker selection, or persisted work
  items.
- Do not rewrite marketplace history or create duplicate marketplace entries.
- Do not add a GitHub token store or GitHub repository picker.
- Do not reproduce GitHub-plugin features that Taskboard does not use, such as
  pull-request review and thread-link management.
- Do not change non-GitHub tracker behavior.

## Verification

- Inspect `bb plugin list --json` before and after migration.
- Run `bb plugin reload steel-browser` and `bb plugin reload taskboard`, then
  confirm both statuses are `running`.
- Run focused Taskboard tests that execute the native GitHub adapter with
  controlled `gh` responses.
- Keep the GitHub BB plugin removed, reload Taskboard, and run
  `bb taskboard refresh github --project proj_ykxahiys47 --json`.
- Confirm the refreshed Taskboard status retains source `github` and reports a
  successful sync with live items.
- Run `npm run check` from the repository root.
- Inspect the resulting Git diff and PR metadata.

## Risks

- Local path installations are pinned and require an explicit update; their
  durable clone must not be removed by an operator.
- A published release may lag current main. Preserve the installed Taskboard
  0.3.5 behavior during recovery rather than silently downgrading.
- A semver range selects immutable release tags but is not itself an immutable
  version pin.
- Plugin running status does not alone prove external tracker or browser
  service connectivity.
- GitHub CLI output is external data and must be parsed at the adapter boundary.
- A project without a GitHub origin has no implicit repository scope and must
  fail without broad account-wide access.
- Live verification depends on the host's current `gh` authentication and
  repository permissions.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
