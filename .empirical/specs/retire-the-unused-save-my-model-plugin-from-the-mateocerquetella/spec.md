# Retire The Unused Save My Model Plugin From The Mateocerquetella

## Request

> Retire the unused Save My Model plugin from the MateoCerquetella/bb-plugins repository. The user explicitly approved deleting plugins/save-my-model/, removing its .bb/plugins.json catalog entry and package-lock workspace references, while retaining immutable historical Git releases. Its top-level README catalog row and quick-start section were already removed on main at 960fe62a. Keep unrelated .empirical historical evidence intact, update current project metadata only where necessary, verify workspace installation/checks and catalog alignment, and integrate the focused removal to main.

## Goal

Save My Model is no longer an active plugin in this repository. The root
collection and workspace installation contain only the remaining independently
installable plugin directories.

## Acceptance Criteria

- [ ] [AC-1] `plugins/save-my-model/` and its staged marketplace entry under
  `docs/` are absent; `.bb/plugins.json` has no `save-my-model` entry and stays
  aligned with the remaining installable plugin directories.
- [ ] [AC-2] A clean npm installation regenerates a consistent lockfile with
  no Save My Model workspace link or package records, without changing the
  SDK versions pinned by other plugins.
- [ ] [AC-3] The root README has no Save My Model catalog or install
  instructions, and root workspace checks pass for the remaining plugins.
- [ ] [AC-4] Historical Git tags and unrelated Empirical records are not
  rewritten or deleted.

## Scope

Remove the plugin source package, root collection entry, staged repository
marketplace metadata, and stale lockfile records. Keep the already-merged
README removal at `960fe62a`.

## Non-goals

Do not remove users' installed copies, revoke past Git releases, edit the
upstream BB marketplace, or refactor other plugins.

## Risks

Workspace lockfile regeneration can churn unrelated packages. Review the
lockfile diff and constrain it to the retired workspace and dependencies no
longer needed by any remaining workspace.

## Verification

Compare `.bb/plugins.json` entries with plugin directories; search current
catalog, README, and lockfile for stale identifiers; run `npm install` and
`npm run check` from the workspace root; inspect the complete diff before
integration.

## Capability Deltas

`deltas/plugin-git-distribution.md` records the active-distribution retirement
without modifying historical release facts.
