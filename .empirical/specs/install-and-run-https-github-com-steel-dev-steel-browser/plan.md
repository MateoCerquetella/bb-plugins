# Implementation Plan

## Current Project Iteration

1. Add project binding store, strict scope contracts and server-side resolution.
2. Route all UI and CLI session operations through the project binding.
3. Add persistent engine selection, preflight-only fallback and bounded runners.
4. Add host provisioning helper with separate persistent profiles; preserve legacy.
5. Provision this project and verify with disposable cookie fixtures in two
   independent instances; run focused tests only, no full CI or paid Jev calls.
6. Reload plugin and demonstrate 560px project-scoped inline viewer.

## Immediate Viewer Repair

1. Derive the player URL from the validated configured viewer origin.
2. Add a primary Play/Watch control, player viewport and external fallback.
3. Treat idle sessions as usable in both client and UI lifecycle controls.
4. Verify player pixels, focused plugin checks, install/reload and responsive UI.
5. Leave the unfinished jev integration explicitly pending.

1. Resolve and record the upstream Steel image digest; create the durable
   compose/systemd configuration under the host data directory, start it, and
   verify loopback bindings and health.
2. Add `plugins/steel-browser` package metadata, strict RPC contracts, Steel
   client, server settings/CLI, app UI/CSS, icon, bundled skill, README,
   license/notices, and focused tests.
3. Register the plugin in `.bb/plugins.json`, the root workspace package list,
   and README catalog/quick start without changing unrelated plugins.
4. Run focused tests and build/type checks; install/reload the local plugin and
   smoke the CLI against the live Steel service.
5. Run workspace checks and browser verification at desktop/mobile sizes,
   capture artifacts, review the diff in fresh context, and integrate the
   exact revision.

## File Ownership

- Host state: `~/.local/share/steel-browser/` and user service unit.
- Plugin source: `plugins/steel-browser/**`.
- Workspace registration: `.bb/plugins.json`, root `package.json`,
  `package-lock.json`, and `README.md`.
- Empirical artifacts remain under this feature directory.

## Rollback

The host service can be stopped/disabled with the documented compose and
systemd commands. The plugin can be removed with `bb plugin remove
steel-browser`; source changes are isolated to the new plugin and catalog
entries.
