# Implement A New Independently Installable BB Touch Bar Plugin

## Request

> Implement a new independently installable BB Touch Bar plugin for Intel MacBook Pro Touch Bar machines, plus a BetterTouchTool companion/preset that can remain visible across all apps. The BB plugin should expose live compact thread/agent status and safe actions, integrate with BB host/server APIs, include clear setup documentation, tests, and repository catalog updates. Target an MVP that is usable without private macOS APIs, with BetterTouchTool as the persistence layer.

## Goal

Provide Intel Touch Bar Mac users with a compact, continuously available view
of BB thread activity and safe thread controls. BB owns the authoritative
snapshot and command surface; BetterTouchTool (BTT) owns the all-app Touch Bar
presentation so the implementation uses only supported BB and BTT extension
points and no private macOS Touch Bar APIs.

## Acceptance Criteria

- [ ] [AC-1] Installing `plugins/touchbar` registers one `bb touchbar` CLI command whose `snapshot` subcommand returns bounded JSON containing aggregate active/attention counts and compact recent thread cards.
- [ ] [AC-2] Snapshot cards expose only stable public fields needed by the companion: id, short title, lifecycle status, provider id, project label, updated time, unread state, and optional attention detail.
- [ ] [AC-3] `bb touchbar open <thread-id>` opens an existing thread through BB, and `bb touchbar stop <thread-id>` stops only the explicitly named active thread after resolving it from BB; unknown or ineligible ids fail without a mutation.
- [ ] [AC-4] Snapshot ordering prioritizes attention and active work, remains deterministic, caps output, truncates user-controlled text, and includes hidden child/worker threads only when explicitly enabled in plugin settings.
- [ ] [AC-5] The companion directory contains an importable BTT preset and a dependency-free executable script that renders a compact aggregate item plus individual thread items and dispatches tap actions through `bb touchbar`.
- [ ] [AC-6] Documentation explains Intel/x86_64 compatibility, BTT All Apps persistence, installation, configuration, privacy, limitations, and complete removal without claiming that a BB web plugin can directly own the Touch Bar.
- [ ] [AC-7] Unit tests cover lifecycle mapping, ordering, text bounding, hidden-thread filtering, JSON output, unknown commands, and mutation guards; plugin typecheck/build and the root check pass.
- [ ] [AC-8] The plugin is independently installable and appears in the root workspace, collection manifest, README catalog, license, and package files; generated `dist/` and `node_modules/` remain untracked.

## Scope

- New `plugins/touchbar` BB plugin targeting BB 0.40 / plugin SDK 0.4.21.
- Server-side snapshot and CLI actions using public BB SDK methods.
- BTT preset/script companion committed as source/configuration artifacts.
- Settings for card count and hidden-thread inclusion.
- Focused unit tests, package checks, root integration checks, and local BB install/reload verification where the running BB supports the plugin.

## Non-goals

- Private AppKit/DFRFoundation APIs, TouchBarServer manipulation, or injecting persistent items into Apple's system Control Strip.
- Bundling, licensing, or automatically installing BetterTouchTool.
- A signed standalone macOS application or App Store distribution.
- Destructive bulk actions, message submission, approval bypasses, or pending interaction responses from the Touch Bar MVP.
- Rendering the physical Touch Bar or taking hardware screenshots in CI; the committed preset and deterministic preview/test artifacts are the UI evidence.

## Verification

- Run the Touch Bar plugin's SDK drift check, TypeScript typecheck, unit tests, companion shell syntax/tests, and production plugin build.
- Run the repository root `npm run check`.
- Install the local path with `bb plugin install ./plugins/touchbar`, reload it, and exercise `bb touchbar snapshot`, guarded failure, and help output.
- Collect a deterministic rendered companion preview artifact and independent code-review evidence; physical BTT import remains a documented human step on an Intel Touch Bar Mac.

## Capability Deltas

- `deltas/touchbar-agent-monitor.md`
