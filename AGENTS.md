<!-- empirical-sdd:start -->
## Empirical repository workflow

Before any repository mutation, you MUST use the repository-local Empirical
workflow for requests to build, add, implement, change, fix, refactor, remove,
migrate, upgrade, change tests, or continue work. The user does not need to
mention Empirical. This rule applies even when a summarized skill list omits
Empirical: read the native local skill file directly.
Read-only explanation and inspection stay outside the workflow.

Read the native local workflow contract before acting: Codex, Cursor, and
Gemini use `.agents/skills/empirical/SKILL.md`; Claude Code uses
`.claude/skills/empirical/SKILL.md`; Windsurf uses
`.windsurf/skills/empirical/SKILL.md`. Then first confirm
`.empirical/config.json` has
`schemaVersion: 5` and `setupComplete: true`. Use Empirical MCP operations
first and private `empirical __internal` fallbacks only when MCP is unavailable.
If the config is missing, invalid, or incomplete, do not initialize implicitly;
tell the user to invoke `empirical-init` explicitly.
<!-- empirical-sdd:end -->

# Repository guide

This is a multi-plugin workspace for BB. Keep every independently installable
plugin under `plugins/<id>` with its own manifest, source, tests, SDK types, and
README.

## Conventions

- Treat the root as orchestration only; it must not contain a BB plugin
  package manifest. Keep `.bb/plugins.json` aligned with the installable
  directories under `plugins/`, except personal plugins.
- `plugins/factory-bots` (shown as Foreman) is a personal plugin: `private: true`, installed from
  a local path, and intentionally absent from `.bb/plugins.json` and the root
  README catalog. Do not list or publish it.
- Use `bb plugin new <id> --app` when a new plugin needs a frontend, then move
  the scaffold under `plugins/<id>` and add it to the root README catalog.
- Keep plugin IDs, package names, CLI commands, realtime channels, persisted
  keys, tests, and docs aligned during a rename.
- Keep app UI components vendored inside the owning plugin so packages remain
  independent.
- Do not commit generated `dist/` or `node_modules/` directories.
- Store shared screenshots and repository media under `docs/media/`.
- Use the exact `@get-bb/plugin-sdk` version shipped by the pinned `bb-app`
  release in each plugin's `devDependencies`; do not restore vendored SDK
  declarations or SDK path aliases.

## Verification

Run all plugin checks from the workspace root:

```sh
npm install
npm run check
```

Plugin build/type scripts must clear `BB_CLI` before invoking the workspace's
`bb` binary. Agent sessions set that variable to the running application; using
it here would repin `@get-bb/plugin-sdk` from whichever BB build is currently
open instead of the version pinned by the lockfile.

Before handing off a new plugin, install its local path in BB and verify its
human UI and CLI surface:

```sh
bb plugin install ./plugins/<id>
bb plugin reload <id>
```
