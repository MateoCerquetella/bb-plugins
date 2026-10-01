# Agent Canvas

A BB-native full-width spatial workbench for live agents and browser captures.

## Workspace Canvas

The All view groups each project workspace into its own colored square.
Worktrees are identified on agent panes and remain filterable. Each workspace
has a stable color, and child threads and browser tabs connect to their recorded
parent or owning thread. Relationships are never inferred.

Drag pane headers, resize with the corner handle, or use the arrow keys on
either handle. Positions are stored relative to their workspace. Reorganize
resets positions. Layout v3 leaves previous local layouts untouched.
Workspace squares organize the initial layout but do not constrain movement.
Panes can move in every direction, including negative coordinates, within a
bounded 100,000-unit offset from their workspace. Hold Space while dragging,
middle-drag, or toggle the pan tool to navigate over live panes. Fit and the
minimap include panes moved outside workspace squares.

The canvas supports background drag, two-finger scrolling, Ctrl/Command-wheel
zoom, touch/trackpad pinch, animated zoom buttons, reset, and Fit.
With the canvas focused, `+`, `-`, and `0` zoom in, zoom out, and fit.
Double-click an agent header to focus it at readable scale.
Narrow screens use a scrollable stacked layout instead of spatial gestures.

## Deferred Control Dock

The right-side Control chat, selector, composer, toggle, and per-pane assignment
actions are removed for now. The canvas uses the full available width.
Existing conversations and persisted Control identity are not deleted.
The previously implemented bounded backend UI commands remain available to an
already selected Control thread; there is no Control chat surface in the canvas.

### Retained Backend

The selected identity remains stored server-side. The plugin does not silently
change models or routing, delete conversations, or create a replacement thread.

The selected Control thread receives `agent_canvas_snapshot` and
`agent_canvas_control`. The latter can select a workspace, focus a thread,
change zoom, fit, or reorganize the canvas. It targets a recently visible canvas
view and waits for an acknowledgement. Without one, it reports an unconfirmed
command, never a successful UI change. Replaced Control threads cannot execute
UI commands even if an older provider session retained the tool.

BB applies tool configuration at the next provider session start/resume.
Selecting an already-running conversation does not hot-inject tools into it.
UI commands are ephemeral and are not replayed after reconnect.
The same bounded commands are available through the CLI from the selected
Control thread, for example `bb agent-canvas ui '{"action":"fit"}'`.
The plugin never sends messages or starts agents without an explicit user action.

## Live Activity

Visible agents use native streaming `ThreadChat` timelines. BB lifecycle events
refresh the graph, with a recovery poll every minute. Off-screen timelines are
unmounted to reduce browser work. Provider-internal agents without BB thread IDs
remain visible only where their provider renders them in the native timeline.

Verified automation browser tabs support automatic visual captures while visible,
every three seconds, with a pause checkbox, manual refresh, and capture timestamp.
They are **not an interactive browser stream**. Capture checks the owning thread,
host, generation, and automation profile on every request. Personal tabs are
excluded. A saved tab without an available capture target is labeled unavailable.
Hidden pages do not auto-capture, duplicate requests share one operation,
and at most four captures run concurrently.

Browser discovery is asynchronous: an unavailable host cannot delay agent state.
Coverage is bounded to 80 threads, 64 browser records, 24 saved-tab lookups,
12 desktop-thread scopes, four hosts, and two browser instances per host.
Partial coverage is shown explicitly.

## Development

From the repository root:

```sh
npm --workspace plugins/agent-canvas run typecheck
npm --workspace plugins/agent-canvas test
npm --workspace plugins/agent-canvas run build
bb plugin install --yes ./plugins/agent-canvas
bb plugin reload agent-canvas
bb agent-canvas status --json
```

The CLI reads the bounded graph or sends visual UI commands without launching
or messaging threads.
