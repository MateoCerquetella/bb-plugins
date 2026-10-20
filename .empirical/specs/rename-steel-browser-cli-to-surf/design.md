# Design

## Existing shape

The plugin already displays “BB Surf” in its manifest and UI. Its factory
registers one top-level CLI command named `steel-browser`; the SDK permits one
CLI registration per plugin factory. The plugin ID and storage namespace are
also `steel-browser`, and the viewer handoff directive is
`::steel-browser{}`.

## Change

Change only the registered top-level CLI name to `surf`. Reuse the existing run
handler and subcommand metadata. Replace user-facing `bb steel-browser`
commands in injected agent instructions, the bundled skill, README examples,
runtime error messages, and distribution assertions with `bb surf`.

Keep internal identifiers unchanged:

- plugin/package/directory: `steel-browser`
- UI route and CSS selectors: `steel-browser`
- storage keys and project bindings: unchanged
- viewer handoff: `::steel-browser{}`
- upstream engine and service name: Steel Browser

## Verification

Run the plugin's focused tests, typecheck, SDK type check, and build. Install
the worktree plugin into BB, reload it, and execute `bb surf --help` plus a
read-only project command. Confirm the old top-level command is not advertised.

## Risks

Existing shell scripts that call `bb steel-browser` must move to `bb surf`.
Preserving the old command simultaneously is not available through the current
single-registration SDK. The plugin remains addressable explicitly by its
internal ID through `bb plugin run steel-browser`.
