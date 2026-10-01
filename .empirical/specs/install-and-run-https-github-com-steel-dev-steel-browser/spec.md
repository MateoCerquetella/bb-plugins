# Install And Run Https Github Com Steel Dev Steel Browser

## Request

> Install and run https://github.com/steel-dev/steel-browser on the dyaus host for use from this BB environment, then create a new independently installable BB plugin in this repository that integrates Steel as the replacement browser infrastructure for the prior KERNEL.SH-based workflow. Keep the root orchestration-only conventions, align manifest/package/CLI/UI/docs/tests, avoid committing generated artifacts, and verify the Steel service plus the plugin's human UI and CLI surface.

## Goal

Run durable self-hosted Steel on dyaus and provide an independently installable
BB plugin for its health and browser session lifecycle without KERNEL.SH. Add
an opt-in jev-ultrafast integration path that attaches an agent loop to a
Steel CDP session when the user supplies its external model credentials.

## Acceptance Criteria

- [ ] [AC-1] Steel runs from a pinned upstream combined image with automatic restart,
  persistent data, and loopback-only ports 3100 (API/UI) and 9223 (debugger).
- [ ] [AC-2] Health and a real create/list/release session lifecycle succeed.
- [ ] [AC-3] plugins/steel-browser is independently installable, cataloged, and
  pins the SDK shipped by the workspace's pinned BB release.
- [ ] [AC-4] Typed bounded health, list, create, and release operations expose
  useful errors without providing an arbitrary HTTP proxy.
- [ ] [AC-5] The bb steel-browser CLI supports status, sessions, create, and
  exact-session release with JSON output.
- [ ] [AC-UI-1] [UI] A compact BB page shows health, endpoint, active sessions,
  and refresh/create/confirmed-release controls with useful connection data.
- [ ] [AC-UI-2] [UI] Loading, empty, and error states work at desktop and mobile
  sizes without clipped text or overlapping controls.
- [ ] [AC-6] A bundled skill documents local Steel usage for agents and replaces
  the KERNEL.SH browser workflow without altering unrelated integrations.
- [ ] [AC-7] Focused unit/type/build checks, workspace checks, local BB
  install/reload, CLI lifecycle, and browser UI verification pass.
- [ ] [AC-8] The plugin exposes an opt-in jev-ultrafast adapter that targets an
  existing Steel session through CDP, validates configuration before execution,
  and reports that TypeSafe and text-model calls are external and potentially
  billable.
- [ ] [AC-9] API credentials are accepted only through host environment/config
  references, are never persisted in plugin state or logged, and missing
  credentials fail before browser actions execute.

## Scope

- Durable pinned Steel deployment on dyaus.
- Plugin server, app, host support if BB server is remote, CLI, contracts,
  focused tests, assets, skill, README, and workspace catalog entries.
- Default endpoint http://127.0.0.1:3100 with validated configuration.
- jev-ultrafast integration is bounded to agent start/status/configuration; the
  plugin does not vendor jev-ultrafast or expose an arbitrary proxy.

## Non-goals

- Public Steel exposure, cloud tunnel installation, or paid service setup.
- Reimplementing Chromium automation, Steel, proxy infrastructure, or stealth.
- Migrating unknown application code or deleting existing KERNEL.SH settings.
- Marketplace publication or repository pushes.
- Replacing jev-ultrafast's TypeSafe decision service or text model with a new
  inference implementation.

## Verification

- Inspect deployment bindings and persistence, restart, then run health and a
  real session lifecycle smoke test.
- Run focused unit tests, SDK compatibility, TypeScript, and build checks.
- Run npm install and npm run check at workspace root; full-suite execution
  remains subject to Empirical's exact approval requirement.
- Install and reload the local plugin, exercise CLI, and inspect the BB page
  in a browser at desktop and mobile viewports with screenshots.

## Capability Deltas

See deltas/steel-browser-infrastructure.md.
