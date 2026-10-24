# Fix All Plugin And Marketplace Icons To Violet Remove The

## Request

> Fix all plugin and marketplace icons to violet, remove the Agent Canvas plugin, and update the BB Surf marketplace entry.

## Goal

Every plugin-owned icon rendered by BB and by the BB Community marketplace uses
the repository's violet brand color, the unused Agent Canvas plugin is gone from
the workspace catalog, and the BB Surf marketplace listing shows the violet BB
Surf mark.

## Acceptance Criteria

- [ ] [AC-1] Every installable plugin's `bb.branding.icon` asset declares the violet brand color `#7c3aed` explicitly instead of inheriting an app default.
- [ ] [AC-2] Every BB Community marketplace entry published from this repository references an icon whose visible strokes and fills are violet.
- [ ] [AC-3] `plugins/agent-canvas` is removed, no longer appears in `.bb/plugins.json`, and has no remaining catalog/README/install references outside historical Empirical records.
- [ ] [AC-4] The BB Surf marketplace entry keeps its existing plugin ID, source, semver range, and `BB Surf` display name while referencing the violet icon.
- [ ] [AC-5] `npm run check` passes after the workspace lockfile is regenerated without Agent Canvas.

## Scope

- `plugins/*/assets/*.svg` icon assets and their `package.json` branding.
- `.bb/plugins.json`, root `README.md`, and `package-lock.json`.
- The external `get-bb/marketplace` checkout for the plugin icons listed by this repository.

## Non-goals

- Changing plugin logos, in-app functional icons, status colors, or theme palettes.
- Renaming plugin IDs, CLI commands, persisted keys, or the BB Surf install ID.
- Deleting historical Empirical specs or capability records.
- Publishing or tagging a new plugin release.

## Verification

- `npm install` regenerates the workspace lockfile without `bb-plugin-agent-canvas`.
- `npm run check` passes for every remaining workspace.
- A repository scan finds no retained `agent-canvas` catalog or install reference.
- The marketplace build validates each changed entry and icon, and each changed
  icon's rendered colors are sampled as `#7c3aed`.

## Capability Deltas

`deltas/plugin-icon-branding.md` adds the violet-icon and Agent Canvas removal
requirements. `deltas/bb-surf-marketplace-listing.md` updates the BB Surf
marketplace listing requirement.
