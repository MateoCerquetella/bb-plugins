# Design

## Save My Model

The backend registers a small typed RPC contract. `listHosts` returns bounded
`id`, `name`, and `status` rows directly from `bb.sdk.hosts.list()`.
`resolveSelection` calls `bb.sdk.system.executionOptions()` for one explicit
host and optional preferred provider, then returns one coherent supported
provider/model/reasoning value or a bounded error state. No host or provider
catalog is persisted by the plugin.

The settings section uses the host-owned
`experimental_ProviderModelPicker`. A BB-native machine list drives its
`routing={{ kind: "host", hostId }}` value. On host selection, the frontend
reads the plugin's bounded local preference and asks the backend to reconcile
it against that host's live catalog. On picker change it calls the existing
`writePreference`; changing hosts reads and resolves that host independently.
Disconnected or unavailable hosts keep their saved summary but do not fabricate
a selectable catalog.

The layout is one responsive surface: a compact machine rail beside a selected
machine configuration panel at wide widths, collapsing to a machine select and
single panel at narrow widths. Status uses a restrained green connected dot and
muted disconnected treatment. Existing records and Clear all remain available
as a secondary disclosure rather than the primary interaction.

The package moves to the exact SDK version supplied by the live BB 0.41 server
(SDK 0.4.46) and uses only
public SDK exports. Documentation explicitly says the plugin configures its own
host-scoped records through BB's picker and does not override the root composer.

## Action Topbar

The launcher remains a `document.body` child with fixed positioning. Replace
the arbitrary z-index 120 with an explicit plugin overlay tier aligned between
BB's ordinary panes (up to 30/40) and host-owned portal/dialog layers (50/70).
Use one shared custom property for launcher, drag ghost, and insertion marker,
and add a stacking contract test. Do not use the browser top layer, private
portal roots, or DOM interception.

## Release alignment

Compare `host-monitor/v0.1.5` with current `origin/main`, replay only the
released Host Monitor/package-lock delta, and verify the tag remains unchanged.
Treat the live marketplace range as authoritative for Usage Tracker and repair
only metadata/source-validation differences in its marketplace PR branch.

Prepare truthful marketplace artifacts for Save My Model, Action Topbar, and
Touch Bar in isolated marketplace branches. Release versions and exact remote
commands are presented for a separate approval after implementation and local
verification. No remote mutation occurs during implementation.

## Failure handling

- A failed host list shows retryable error copy without cached fake machines.
- A failed model catalog preserves the saved record and exposes the BB-provided
  failure state without overwriting storage.
- A stale provider/model/reasoning value is replaced only after a successful
  live resolution.
- An unavailable localStorage implementation leaves the picker usable for the
  session and makes persistence status explicit.
- Marketplace or release drift stops preparation rather than moving tags or
  overwriting branches.

## Verification

Use pure resolver tests, storage tests, frontend SDK harness tests, CSS/DOM
contract tests, plugin checks/builds, isolated managed installs, full workspace
CI, and a live BB 0.41/SDK 0.4.46 exercise with connected and disconnected machines. Compare
the launcher against the supplied marketplace screenshot and capture final
light/dark/narrow evidence before release approval.
