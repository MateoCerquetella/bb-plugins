# Design

## Experience architecture

Keep the existing two-stage entry point unchanged: the bottom-left footer icon
opens the compact fleet modal and **Open Host Monitor** activates BB's native
nav-panel route. The dedicated page becomes three visually quiet BB-native
regions:

1. a compact sticky command header with title/fleet health followed by host
   search, range, refresh, and Customize controls;
2. an enrolled-host selector using status dots and concise
   live resource summaries;
3. the selected host workspace with identity/status, dashboard controls, and a
   responsive widget grid.

The page uses existing semantic CSS variables and a small set of vendored BB
registry component recipes for buttons, badges, inputs, skeletons, and the
confirmation dialog. It does not import private app packages. Controls are
32px-class compact controls, cards use the shared border/radius hierarchy, and
all state feedback remains inline and notification-free.

## Dashboard configuration

Evolve the configuration to version 2. A bounded `widgets` list contains every
catalog entry exactly once with stable `id`, metric, visualization, and
`visible`. Array order is layout order. The catalog includes only values backed
by current sources: snapshot/history resource metrics, system facts, and the
restored processes source. Existing version-1 panel rows normalize into the
version-2 order, preserving their supported order and visibility while adding
new catalog entries deterministically.

Customization is an in-page mode, not Settings. A separate ordered editor list
sits above the live preview. Each item has a named drag handle/HTML drag target,
an explicitly labelled visibility checkbox, move-earlier/later buttons, and a
visualization choice where supported. Impossible moves are disabled, focus stays
on the moved row, and a polite live region announces its new position. Save uses
the existing per-host RPC/store key; cancel restores the committed value; reset
changes only the draft to the catalog default. Save is disabled while unchanged
or saving, save failures preserve the draft, and primary edit actions are sticky
at the bottom on narrow screens. Host selection is disabled while a draft is
dirty with clear guidance to save or cancel first; `beforeunload` protects dirty
browser exits. Dragging and button reordering call the same pure move function.

## Process restoration

Restore the last safety-reviewed process implementation from repository history:

- host worker listing is bounded and cross-platform, uses fixed commands or
  platform APIs, sanitizes names, and returns no command lines or environment;
- each actionable row carries an HMAC opaque lifetime identity rather than raw
  start metadata;
- elevated sessions, monitor/ancestor/system processes, other/unknown owners,
  and unverifiable identity/ancestry are protected;
- server operations are serialized per host and time-bounded;
- prepare rechecks identity and policy and issues an expiring, single-use,
  in-memory confirmation token bound to host, PID, identity, and mode;
- execute consumes the token, revalidates the enrolled/connected host, and asks
  the host worker to recheck identity before sending only SIGTERM/SIGKILL or the
  corresponding Windows operation.

The Processes widget fetches only when visible and the selected host is
connected. Host changes increment a generation so stale list/prepare/execute
responses cannot update another host. It provides sort, filter, manual refresh,
bounded rows, protected reasons, inline announcements, and a Radix/BB-styled
confirmation dialog. Wide view uses a sortable table with sticky headings and
right-aligned metrics; narrow view uses semantic stacked rows with the same
filter/sort behavior. Confirmation names the selected host, process, PID, mode,
and unsaved-work risk; Cancel receives initial focus. Buttons are action-specific
(`Terminate process` and `Force terminate`). A graceful request that leaves a
process running triggers a new force preflight and separate dialog.

## Numeric threshold removal

Retain backend threshold settings and passive guide evaluation to avoid changing
monitor semantics, but remove user-facing numeric guide chips from the mini
modal and expose no threshold editor in the dashboard. Charts may retain a
subtle unlabeled guide line because it is telemetry context, not a numeric
control.

## State and responsive behavior

- Fleet and config initial loads use skeleton geometry matching final content.
- No enrolled hosts, no search matches, no selected host, config failure, and
  empty process lists each have an explicit contained state with a relevant
  next action where possible.
- Disconnected/stale hosts keep their established status and retained snapshot
  behavior; connection-required widgets explain why they cannot refresh.
- Process states distinguish initial load, retained rows during refresh, empty
  inventory, no filter matches, unsupported platform, disconnected host,
  permission/protection limits, request failure, rejected/expired preflight,
  successful signal, and still-running-after-graceful.
- Wide host cards wrap in a compact grid. At narrow widths they form one
  horizontal scroll-snapping strip with an overflow affordance; widgets become
  one column, editor rows use two control lines, tables switch to compact process
  rows, and dialogs fit within dynamic viewport height.
- Every widget uses the same anatomy: title/status header, optional controls,
  content, and persistent inline status footer. Red is reserved for failures and
  destructive actions; protected states use neutral badges.

## Verification design

Extend pure config tests for migration, uniqueness, visibility, reorder, reset,
and per-host storage isolation. Restore focused process collector, confirmation,
operation-gate, and server tests from the prior implementation, adapting only
contract/import changes. Add source-registration assertions for safety and
notification boundaries. Update browser QA to exercise host switching,
drag/button ordering, hide/show/reset/save/reload, process widget states,
confirmation cancel, no numeric threshold chip, no reload, and wide/390px
screenshots.
