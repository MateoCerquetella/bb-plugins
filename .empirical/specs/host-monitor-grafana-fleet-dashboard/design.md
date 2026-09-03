# Design: Grafana-style fleet dashboard

## Runtime topology

Reintroduce one metrics-only Host Monitor host entry using the public
`experimental_defineHostEntry` contract. Each enrolled daemon answers a bounded
`snapshot` call with CPU, capacity, load, uptime, system identity, and aggregate
network throughput. The host artifact contains no process inspection,
termination, IP-address, file-watching, or retained-worker behavior.

The server owns one `machine-sampler` service. Every ten seconds, or after BB
reports a host/realtime change, it lists all enrolled hosts and calls each
connected host independently with a five-second timeout. Per-host calls and
whole-fleet refreshes coalesce so UI refreshes cannot overlap background work.
Disconnected hosts are never called, and one timeout updates only that host's
inline state. Realtime signals carry only changed host ids and timestamps; the
frontend re-fetches durable state through RPC.

## Persistence and bounded RPC

Keep the existing nine plugin-database migrations byte-for-byte and append a
`fleet_samples` table keyed by `(host_id, collected_at)`, plus its lookup index.
The server assigns receipt timestamps for freshness, storage, pruning, and
history so remote clock skew cannot move samples across server-relative
windows; remote sample time remains diagnostic payload only. Successful samples
are stored for 30 days. History queries use range-relative
buckets, defensive slicing, and no more than 720 points.

Split RPC by payload shape:

- `fleet` returns current state for every enrolled machine, thresholds, and
  connected/total counts, but no history.
- `machineHistory` accepts one validated host id plus a supported range and
  returns at most 720 points for that machine.
- `refresh` accepts a nullable host id, coalesces with existing work, and returns
  the refreshed fleet.
- `sidebarSummary` returns only connected and total counts.

Realtime invalidations and manual Refresh all update both fleet state and the
selected machine's current range. Range changes render no prior-range points,
and chart summary labels name the first series they summarize.

This represents every enrolled machine while keeping each response below host
and RPC limits even for a large fleet.

## Frontend composition

The nav panel remains `/plugins/host-monitor/host-monitor`. Its body is one
full-height scroll region with a compact Grafana-inspired structure:

1. A top toolbar ordered machine search, history range, and Refresh all, with
   connected/total and last-updated text. Search filters the card collection;
   cards are the only machine selector so a duplicate dropdown is avoided.
2. A responsive fleet strip/grid where every machine card shows connection and
   freshness plus CPU, RAM, disk, load, and network headline values.
3. A selected-machine dashboard with a system-facts header; four current stat
   tiles; utilization, load, and network ECharts panels; and inline unavailable,
   stale, offline, or error copy.

Selection persists while its card is filtered when possible and otherwise
falls back to the first connected machine only when no prior selection exists.
The fleet region has a visible match count and a bounded scroll area so every
offline, stale, loading, and failed card remains reachable at fleet scale.

Use BB theme variables only. Panels use 1px borders, small radii, compact
typography, tabular numbers, restrained threshold coloring, and no Grafana
marks or copied branding. At 760px the fleet and panel grids collapse; at 460px
the toolbar stacks; at 390px every control remains reachable and charts retain
vertical touch scrolling. Narrow charts keep a stable minimum height, reduce
axis density, and expose latest/min/max values in text outside the canvas.

Every connection, freshness, failure, and threshold state has concise text and
an accessible label so color is only reinforcement. Machine cards and controls
have keyboard-visible focus. A coalesced refresh disables its control, retains
existing data, and shows inline `Refreshing…` plus the last successful update.
History gaps render as line breaks, never zeroes, and unavailable panels state a
short reason and last successful timestamp when known.

## Sidebar behavior

Register `experimental_sidebarAccessory` on the existing nav panel. It renders
plain neutral `connected/total` text using `sidebarSummary` and the same
realtime invalidation channel. It is presentational only: no button, dot, tone,
popover, portal, alert, tooltip warning, or content script. The host-owned nav
row and existing branded icon remain the sole navigation control and open the
page normally.

## Notification and privacy boundary

Do not import Sonner or call the Web Notification API. Do not register a content
script, sidebar footer action, popup, or floating surface. Machine errors and
staleness stay inside the corresponding page card/panel using polite status
copy. Thresholds influence only panel/card borders and chart guide lines.

Host snapshots aggregate network counters across usable interfaces but exclude
addresses, interface names, MACs, netmasks, process details, command lines, and
credentials.

## Compatibility and verification

Retain package id/version, route/title, repository coordinates, assets, SDK
pin, and shim devDependencies. Restore `bb.host`, host artifact file entries,
and tsconfig coverage. Focused tests use the official server and host harnesses,
real in-memory SQLite, source registration checks, chart transforms, and CSS
contract assertions. Live verification reloads the installed path plugin,
exercises fleet/history/refresh RPCs, and captures desktop and 390px screenshots
of the actual page and sidebar accessory.
