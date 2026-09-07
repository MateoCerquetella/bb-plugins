# Commands

Commands below are verified from workspace and plugin manifests.

## Setup

- `npm install` — install shared workspace dependencies after a fresh checkout
  or dependency/lockfile change.
- `bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@main --subdirectory plugins/action-topbar --yes`
  — install experimental Action Topbar on a compatible BB core/SDK build.
- `bb plugin install path:/absolute/path/to/bb-plugins/plugins/action-topbar --yes`
  — install Action Topbar from a local checkout.
- `bb plugin install ./plugins/dockside` — register the local Dockside path for
  live sidebar verification.
- `bb plugin install ./plugins/save-my-model` — register the local Save My Model
  path for live settings verification.
- `bb plugin install ./plugins/taskboard` — register the local Taskboard path in
  BB for live verification.
- `bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.3.0 --subdirectory plugins/taskboard --tag-prefix taskboard/`
  — install the released Taskboard Git range directly.
- `bb plugin install ./plugins/usage-tracker` — register Usage Tracker locally.
- `bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.8 --subdirectory plugins/usage-tracker --tag-prefix usage-tracker/`
  — install the released Usage Tracker Git range directly.
- `bb plugin install ./plugins/host-monitor` — register Host Monitor locally.
- `bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 --subdirectory plugins/host-monitor --tag-prefix host-monitor/`
  — install the released Host Monitor Git range directly.

## Run, test, and build

- `npm run test --workspace=bb-plugin-action-topbar` and
  `npm run typecheck --workspace=bb-plugin-action-topbar` — focused Action
  Topbar verification.
- `npm run build` — build every plugin workspace that declares a build script.
- `npm run typecheck` — typecheck every plugin workspace.
- `npm run test` — run every plugin test suite.
- `npm run check` — run each plugin's complete check contract.
- `npm run check --workspace bb-plugin-dockside` — Dockside SDK-type check,
  typecheck, tests, and BB build; root `check:dockside` additionally enforces its
  repository contract.
- `npm run check --workspace bb-plugin-save-my-model` — Save My Model SDK-type
  check, typecheck, preference tests, and BB build.
- `npm run dev --workspace bb-plugin-taskboard` — Taskboard watch/build/reload
  loop after the local path is installed.
- `npm run typecheck --workspace bb-plugin-taskboard` and
  `npm test --workspace bb-plugin-taskboard` — focused Taskboard iteration.
- `npm run check --workspace bb-plugin-taskboard` — Taskboard SDK-type check,
  typecheck, tests, build, and build-metadata verification.
- `npm run dev --workspace bb-plugin-host-monitor` — Host Monitor
  watch/build/reload loop after local-path installation.
- `npm run check --workspace bb-plugin-host-monitor` — Host Monitor SDK-type
  check, typecheck, complete Node/TSX test suite, and BB build.
- `npm run types:refresh --workspace bb-plugin-taskboard` followed by
  `npm install` — deliberate SDK declaration pin refresh when the minimum BB
  release changes.
- `bb taskboard presets list|save|rename|delete` — manage named presets for the
  current or explicitly selected BB project.
- `bb taskboard list --preset <name>` — apply a named preset to CLI listing;
  explicit `--source` and `--query` flags take precedence.

## Verification evidence

- Run root `npm run check` before repository handoff; CI uses the same workspace
  contract from `.github/workflows/ci.yml`.
- UI/runtime changes also require the active plugin dev loop and a real BB
  surface exercise. A successful build alone does not verify layout, focus,
  overlays, responsive behavior, or reload state.
- Plugin build/type scripts clear `BB_CLI` so they use the workspace-pinned BB
  toolchain rather than whichever application launched the agent.
- Do not publish, push, or reload unrelated live plugin installations without
  explicit user authorization.
