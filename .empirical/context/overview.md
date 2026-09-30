# Project Overview

## Purpose

- This workspace contains focused plugins for BB, the agent IDE.
- Aura provides personal image backgrounds, animated Capy dithering, six saved
  slots, and bounded animation speed/render-quality controls for BB threads.
- Action Topbar puts a searchable Action launcher and persistent, per-thread
  content tabs in BB's main thread topbar. It delegates pane rendering and
  split-drop behavior to the matching experimental BB core/SDK surface.
- Dockside replaces BB's thread list with a compact project-first sidebar,
  root/child thread families, semantic activity states, filters, and guarded
  multi-select deletion.
- Save My Model provides the host-scoped provider and host/provider-scoped
  model/reasoning persistence contract proposed by BB PR #1964, plus a settings
  section for inspecting and clearing plugin-owned browser storage.
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
- Taskboard's current browse state stays versioned and device-local; named
  project presets store validated snapshots in the plugin database and apply
  explicitly through that same browse store.
- All indexed plugins are private/non-publishable workspaces. Releases use
  immutable plugin-specific Git tags plus the BB Community marketplace.
- Action Topbar is not marketplace-ready. It requires the matching BB core and
  experimental Plugin SDK 0.4.33 Action split-drag API; stock BB releases that
  lack that API cannot render its native main-workspace panes.
- Save My Model cannot intercept BB's built-in new-thread picker through the
  current Plugin SDK. It owns only its localStorage contract and settings UI;
  native picker integration remains upstream in BB PR #1964.
- Generated `dist/` and `node_modules/` are build/install products, not authored
  source and are not committed.
- Empirical tracker integration is explicitly disabled in this checkout, so
  workflow state remains local-only with no provider requests.

## Evidence

- Repository catalog and setup: `README.md`, `.bb/plugins.json`, `package.json`.
- Workspace rules: `AGENTS.md`.
- Action Topbar behavior and compatibility boundary:
  `plugins/action-topbar/README.md`, its manifest, `lib/action-topbar.ts`, and
  focused tests.
- Dockside behavior: `plugins/dockside/README.md`, its manifest, `server.ts`,
  `app.tsx`, and focused tests.
- Save My Model behavior: `plugins/save-my-model/README.md`, its manifest,
  `lib/preferences.ts`, `app.tsx`, and preference tests.
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
- Aura behavior and resource bounds: `plugins/aura/README.md`, `lib/model.ts`,
  `lib/capy-effect.ts`, `app.tsx`, and focused tests.
