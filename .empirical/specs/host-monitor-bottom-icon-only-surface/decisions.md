# Decisions: Host Monitor Bottom Icon Only Surface

## D-001: Use plugin detail as the monitor destination

Status: Accepted

### Evidence

- The public `sidebarFooterAction` context exposes `openSettings()`.
- `settingsSection` renders plugin-owned React UI inside BB's plugin detail.
- `navPanel` necessarily adds the sidebar page row the user rejected.

### Options

1. Keep `navPanel` and hide its row with DOM manipulation.
2. Restore the older popup/floating content script.
3. Use `openSettings()` and render the monitor as a `settingsSection`.

### Chosen approach

Choose option 3. It is the only public, portable, host-owned route that keeps
the main sidebar icon-only without injected or floating UI.

### Trade-offs and risks

BB labels the outer route Settings and lists installed plugins in its settings
sidebar. Those are host-owned details; the main app sidebar has no Host Monitor
page row, and the monitor body remains complete.

### Verification

Assert registration structure and drive the real footer action in Chromium
from the main app into the loaded dashboard.

## D-002: Carry the verified fleet/configuration implementation unchanged

Status: Accepted

### Evidence

- The base checkpoint already passes 29 focused tests, typecheck, build, live
  four-host loading, per-host reload persistence, editor actions, and 390px.
- The clarification changes navigation and outer presentation, not telemetry or
  persistence requirements.

### Options

1. Rewrite the dashboard from the supplied screenshot.
2. Preserve the working dashboard and align its dense chart/card hierarchy.

### Chosen approach

Choose option 2. Preserve tested behavior and use the screenshot as a visual
reference rather than reintroducing older unsafe functionality.

### Trade-offs and risks

The result follows BB's active theme instead of hard-coding the reference's
purple palette, which keeps it native and theme-safe.

### Verification

Compare desktop/mobile screenshots and rerun the exact focused and live flows.
