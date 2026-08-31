# Project Overview

## Purpose

- This workspace contains focused plugins for BB, the agent IDE.
- Taskboard gives each BB project one GitHub, Linear, or Jira-backed List/Kanban
  board with cached browsing, live detail, status changes, issue creation,
  remembered and named project views, mentions, CLI access, and agent handoff.
- Usage Tracker places Codex and Claude Code quota windows in BB's sidebar
  footer and lets the user choose the weekly or five-hour compact reading.
- Host Monitor presents live CPU, RAM, disk, network, load, uptime, connection,
  and sample-health data for every enrolled BB host, with guarded on-demand
  process inspection and termination.

## Boundaries

- The repository root is orchestration only. Each installable plugin is an
  independent package under `plugins/<id>` with its own source, tests, assets,
  manifest, license, third-party notices, and README.
- `.bb/plugins.json` is the collection index and must match installable plugin
  directories; it does not override leaf manifests.
- Taskboard selects exactly one external tracker per BB project. Provider APIs
  remain authoritative; Taskboard stores project configuration, credentials,
  cached summaries, sync state, and board preferences.
- Composer-assisted issue drafting is optional and consumes the selected
  provider's model usage. Taskboard preflights native Plan support, sends a
  structured initial Plan command, stops the helper before persisting the
  proposed ticket, and never approves or resolves the Plan interaction.
- Taskboard's current browse state stays versioned and device-local; named
  project presets store validated snapshots in the plugin database and apply
  explicitly through that same browse store.
- Taskboard, Usage Tracker, and Host Monitor are private/non-publishable
  workspaces. They release through immutable plugin-specific Git tags plus the
  BB Community marketplace.
- Taskboard GitHub CLI subprocesses receive only named GitHub auth/config,
  config/keyring, proxy/TLS, executable/runtime lookup, and fixed policy/locale
  environment values; unrelated server variables are excluded.
- Generated `dist/` and `node_modules/` are build/install products, not authored
  source and are not committed.
- Empirical tracker integration is explicitly disabled in this checkout, so
  workflow state remains local-only with no provider requests.

## Evidence

- Repository catalog and setup: `README.md`, `.bb/plugins.json`, `package.json`.
- Workspace rules: `AGENTS.md`.
- Taskboard behavior and package contract: `plugins/taskboard/README.md`,
  `plugins/taskboard/package.json`, `plugins/taskboard/server.ts`, and
  `plugins/taskboard/app.tsx`.
- Taskboard distribution contract:
  `.empirical/capabilities/taskboard-distribution/spec.md`.
- Usage Tracker behavior: `plugins/usage-tracker/README.md` and its manifest.
- Host Monitor behavior and privacy boundary:
  `plugins/host-monitor/README.md`, its manifest, `contract.ts`, `server.ts`,
  `host.ts`, and `app.tsx`.
- Hosted verification: `.github/workflows/ci.yml`.
