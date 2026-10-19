# Rename Steel Browser Cli To Surf

## Request

> Rename the public Steel Browser CLI command from `bb steel-browser` to `bb surf` so the installed BB Surf interface and terminal command use the same name. Preserve the internal plugin ID, persisted configuration, project browser bindings, handoff directive, and upstream Steel engine terminology to avoid data loss or migration. Update agent instructions, skill guidance, help usage, tests, and README examples; verify the focused plugin checks and locally install/reload the plugin so `bb surf --help` works. Create a pull request against main and merge it after checks pass, as explicitly approved by the user.

## Goal

Make the terminal command match the existing BB Surf product name without
changing the plugin's durable identity or browser data.

## Acceptance Criteria

- [ ] [AC-1] `bb surf --help` lists the existing browser subcommands.
- [ ] [AC-2] `bb surf project`, `run`, `tabs`, `inspect`, `click`, `fill`,
  `press`, and `screenshot` route to the existing Steel Browser handlers.
- [ ] [AC-3] Agent instructions, the bundled skill, command help, and README
  examples direct users to `bb surf`.
- [ ] [AC-4] The internal plugin ID, npm package name, persisted storage keys,
  project bindings, UI route, CSS identifiers, and `::steel-browser{}`
  directive remain unchanged.
- [ ] [AC-5] The focused Steel Browser checks and plugin build pass.
- [ ] [AC-6] After installing and reloading the local plugin, the running BB
  instance recognizes `bb surf`.

## Scope

- Rename the top-level registered CLI command from `steel-browser` to `surf`.
- Update user-facing CLI guidance, usage strings, examples, and assertions.
- Preserve upstream Steel terminology where it names the engine or service.

## Non-goals

- Renaming the plugin directory, package, plugin ID, UI route, CSS selectors,
  storage keys, session data, handoff directive, or upstream Steel engine.
- Changing browser behavior, provisioning, authentication, or viewer UI.
- Supporting two top-level CLI registrations; the SDK permits one registration
  per plugin factory execution.

## Verification

- Run the Steel Browser plugin type, unit, distribution, and build checks.
- Install and reload the local plugin in BB.
- Run `bb surf --help` and a read-only status/project command.
- Confirm `bb steel-browser` is no longer advertised as a top-level command.

## Capability Deltas

See `deltas/steel-browser-viewer.md`.
