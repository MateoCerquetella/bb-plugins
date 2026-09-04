# Decisions: Host Monitor Native Footer Configurable Metrics

## D-001: Preserve BB as the sole machine and transport authority

Status: Accepted

### Evidence

- The recovered server already uses `bb.sdk.hosts.list`, host worker
  RPC, host/realtime subscriptions, and one bounded sampling service.

### Options

1. Extend the existing BB roster and transport path.
2. Add a plugin-owned registry and transport.

### Chosen approach

Choose option 1. Extend the existing path only.

### Trade-offs and risks

Dashboard configuration depends on BB host ids, which is desired
  and prevents identity drift.

### Verification

Assert the existing roster/worker calls and absence of new
  registry or transport modules.

## D-002: Use only a native footer action and plugin-detail surface

Status: Accepted

### Evidence

- `sidebarFooterAction` is the SDK surface for BB-rendered bottom-left icon
  chrome and supplies `openSettings()` specifically for plugin-detail
  navigation.
- Registering `navPanel` always creates the extra Host Monitor sidebar page row
  that the user explicitly rejected.

### Options

1. Query and click BB's DOM.
2. Restore the old popover content script.
3. Make the plugin detail itself the dashboard via `settingsSection` and open
   it with `openSettings()`.
4. Open the registered nav-panel route directly and retain the extra row.

### Chosen approach

Choose option 3. Remove `navPanel`, register the dashboard as a
`settingsSection`, and invoke `openSettings()` from the footer action.

### Trade-offs and risks

The plugin detail also contains host-rendered threshold settings, which keeps
configuration and monitoring in one native BB surface.

### Verification

Invoke the footer action with a fake host context and assert `openSettings()`;
assert there is one settings section, no nav panel, no content script, and no
overlay registration.

## D-003: Store a bounded declarative panel list

Status: Accepted

### Evidence

- Users need Grafana-like choice without arbitrary query execution or
  unbounded persisted input.

### Options

1. Freeform layout JSON.
2. Fixed presets only.
3. A strict catalog and ordered panel list.

### Chosen approach

Choose option 3: strict catalog, unique metric ids, supported visualization pairs,
  maximum twelve panels, and explicit ordering controls.

### Trade-offs and risks

There are no freeform sizes or duplicate metric panels in this revision.

### Verification

Run schema/property/limit/combination tests and editor behavior tests.

## D-004: Persist in the existing plugin database by BB host id

Status: Accepted

### Evidence

- SQLite already stores fleet history and survives backend reloads;
  BB host id is the stable identity already used by every telemetry RPC.

### Options

1. Client local storage.
2. BB KV.
3. Append-only SQLite migration.

### Chosen approach

Choose option 3: an append-only SQLite table keyed by host id.

### Trade-offs and risks

Configuration is BB-server scoped rather than browser scoped,
  which makes it consistent across BB clients.

### Verification

Run two-host isolation, corrupt fallback, and lifecycle reload tests.

## D-005: Keep editing inline and draft-safe

Status: Accepted

### Evidence

- The user rejected notification/popover behavior and realtime fleet
  updates can arrive while a dashboard is edited.

### Options

1. Modal or popover editor.
2. Autosave each control.
3. Page-contained draft with Save and Cancel.

### Chosen approach

Choose option 3: a page-contained explicit draft workflow.

### Trade-offs and risks

One extra save action is required, offset by predictable cancellation and
  recoverable inline errors.

### Verification

Verify realtime refresh does not replace draft; failed save preserves
  edit state; 390px layout remains operable.
