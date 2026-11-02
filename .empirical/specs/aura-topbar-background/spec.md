# Aura Topbar Background

## Request

> Fix the Aura plugin so BB's top bar no longer picks up the wallpaper by default, add a Settings -> Aura checkbox to opt the top bar background in or out, verify it in the installed UI, bump the Aura version, and open and merge a PR.

## Goal

Aura's wallpaper no longer paints behind BB's top bar unless the user explicitly
enables the new **Top bar background** preference in Settings -> Aura. The
preference is persisted, off by default, and applies to both the New thread
screen and existing conversations.

## Acceptance Criteria

- [ ] [AC-1] Aura settings persist a boolean `topbarBackground` preference that
  defaults to `false`; snapshots written by older or newer Aura builds still
  load, and the preference survives slot switches and **Reset to default**.
- [ ] [AC-UI-1] [UI] Settings -> Aura shows a labelled **Top bar background**
  checkbox. Unchecked (default) keeps BB's top bar free of wallpaper; checked
  extends the wallpaper behind the top bar.
- [ ] [AC-UI-2] [UI] The preference is visible and usable in both the settings
  section and the thread-panel Aura editor, remains reachable at narrow
  viewports, and does not disturb the existing draft/apply/save-slot flow.
- [ ] [AC-2] Existing wallpaper, half-wallpaper, animation, saved-slot,
  activity-overview, reading-surface, and CLI behavior remains intact.
- [ ] [AC-3] Aura typecheck, unit tests, and build pass, together with the
  repository Aura-focused check.
- [ ] [AC-4] Aura is version-bumped to 0.2.6 with a matching changelog entry,
  and the released install documentation points at the new version.
- [ ] [AC-5] A pull request containing the verified change is opened against
  `main` and merged after checks pass.

## Scope

The `plugins/aura` settings schema, defaults, persistence, slot/reset
preferences, content-script CSS, settings UI, README/CHANGELOG, package version,
focused tests, and the PR lifecycle. Reuse the existing Aura layer and host
`--bb-app-chrome-row-height` token rather than adding a new rendering surface.

## Non-goals

No changes to BB's host application, no new plugin, no new image storage, no
redesign of the Aura settings page, no release publication or marketplace
submission, and no changes to other plugins in the workspace.

## Risks

The host top bar can change its DOM height or token. Keep the offset tied to
`--bb-app-chrome-row-height` with a 48px fallback, and verify against the
installed BB UI. Persisting a new setting can interact with active-slot
preservation, so the focused tests cover legacy settings, slot switching, and
reset.

## Verification

Run `npm run check --workspace bb-plugin-aura` from the workspace root. Install
and reload Aura from this checkout, then inspect the real Settings -> Aura
checkbox and the thread/New-thread top bar in the bound browser at desktop and
narrow widths, toggling the preference and confirming the top bar band no longer
shows the wallpaper when disabled. Review the exact branch diff, push, open the
PR, watch CI, and merge it into `main` once checks are green.

## Capability Deltas

See `deltas/aura-background-surface.md`.
