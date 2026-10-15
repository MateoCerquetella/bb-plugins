# Design

Keep the existing steel-browser panel and viewer structure. Change only
current BB-owned display copy and the icon accessibility title. Preserve every
technical identifier used by installs, commands, storage, fixtures, and
services.

The existing `usePanelExpansion` hook owns hover sampling. Its pinned mode is
already explicit, so return before registering pointer listeners or the
100ms interval. The existing keyboard, visibility, resize, and explicit
control effects remain unchanged. Extend the browser fixture to observe the
interval lifecycle through rendered behavior.

## Verification shape

Run the plugin workspace check, the focused browser fixture, and a fresh
context check of the light, dark, desktop, and touch paths.
