# Decisions: Rename Steel Browser CLI To Surf

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Rename only the public CLI command

Status: Accepted

### Evidence

- The manifest and UI already call the product BB Surf.
- The plugin ID, package, storage namespace, bindings, UI route, CSS selectors,
  and viewer directive use `steel-browser`.
- The BB plugin SDK permits one CLI registration per plugin factory.
- The existing handler already owns every browser subcommand.

### Options

1. Rename every `steel-browser` identifier and migrate persistent data.
2. Add a second compatibility plugin whose only job is a CLI alias.
3. Register `surf` on the existing plugin and preserve its durable identity.

### Chosen approach

Use option 3. Rename the existing top-level CLI registration to `surf`, reuse
its handler, and update user-facing instructions, skill guidance, help, README,
errors, and tests. Preserve the internal plugin identity and handoff directive.

### Trade-offs and risks

Existing shell scripts that invoke `bb steel-browser` must switch to `bb surf`.
The plugin remains explicitly callable by ID through
`bb plugin run steel-browser`. Avoiding a new wrapper plugin keeps one owner for
settings, bindings, sessions, and browser state.

### Verification

Run focused plugin tests, typecheck, SDK type validation, and build. Install
and reload the worktree plugin, then execute `bb surf --help` and a read-only
project command. Distribution tests assert the unchanged internal identifiers.
