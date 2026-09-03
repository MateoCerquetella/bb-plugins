# Decisions: Host Monitor Grafana Fleet Dashboard

## D-001: Restore fleet sampling through a metrics-only host worker

Status: Accepted

### Evidence

- BB exposes enrolled machines through `bb.sdk.hosts.list` and a plugin-owned
  host artifact through `bb.hosts.experimental_client`.
- The earlier Host Monitor implementation already proved cross-platform CPU,
  memory, disk, load, uptime, system, and network collection through this path.

### Options

1. Monitor only the BB server process.
2. SSH or directly connect to machines outside BB.
3. Restore the BB host worker, stripped to telemetry only.

### Chosen approach

Choose option 3. Reuse the public BB host boundary and remove IP/process-control
methods and fields.

### Trade-offs and risks

Disconnected machines have no new samples, and host-call latency must be
bounded independently. The host artifact adds build and lifecycle coverage.

### Verification

Use the official host harness, fake server host-RPC driver, live enrolled-host
sampling, artifact metadata inspection, and cancellation tests.

## D-002: Return overview and per-machine history separately

Status: Accepted

### Evidence

- Returning 720 points for every machine in one fleet response can exceed the
  8 MiB RPC ceiling as machine count grows.
- The UI needs all current cards but history only for the selected machine.

### Options

1. Return all histories in one response.
2. Cap the number of machines shown.
3. Return all current machines and fetch one selected history separately.

### Chosen approach

Choose option 3, preserving every machine while bounding history payloads.

### Trade-offs and risks

Changing selection performs another RPC, so requests must ignore stale results
and reuse realtime invalidations.

### Verification

Test all-machine fleet projection, strict 720-point per-host queries, unknown
host handling, and rapid selection/range changes.

## D-003: Make the sidebar accessory neutral and presentational

Status: Accepted

### Evidence

- BB's accessory contract is presentational, clipped, and explicitly forbids
  controls or portalled content.
- The user wants the sidebar icon back but the dashboard inside the page and
  still dislikes notifications.

### Options

1. Restore the old popup/floating content script.
2. Render a warning dot accessory.
3. Keep the host-owned branded nav icon and show neutral connected/total text.

### Chosen approach

Choose option 3. The row itself opens the page; the accessory only reads status.

### Trade-offs and risks

Compact/mobile sidebars may omit the accessory by host design, while retaining
the branded nav icon and normal page navigation.

### Verification

Validate registration and source absence of content-script, popup, floating,
badge, tone, portal, notification, and interactive accessory hooks; inspect the
live desktop sidebar.

## D-004: Preserve append-only storage compatibility

Status: Accepted

### Evidence

- `bb.storage.migrate` indexes migration statements and forbids editing shipped
  statements.
- The locally installed plugin already created the single-machine schema.

### Options

1. Rewrite old migrations.
2. Delete the plugin database.
3. Keep prior statements and append a new per-host time-series table/index.

### Chosen approach

Choose option 3. Old tables remain harmless compatibility state; new runtime
code reads and writes only the fleet tables.

### Trade-offs and risks

The database retains unused tables until a separately designed migration can
remove them without breaking existing installations.

### Verification

Run migrations against both an empty database and the current ten-statement
schema, then test insert, prune, latest, and bounded history per host.
