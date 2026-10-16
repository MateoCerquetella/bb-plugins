# Design

## Existing Flow

The React page already sends CPU, RAM, and disk percentages through
`thresholdToneForReading`. The imperative sidebar and floating monitor derive
only CPU and RAM tones, render their resource lists by hand, and append the
monitor plus drag preview directly to `document.body`.

Current BB scopes plugin styling to marked plugin roots. React portals already
reuse `lib/portal-scope.ts` to cross that boundary, but the imperative monitor
does not. Its inline coordinates therefore lose the fixed-position CSS contract
in the affected shell.

## Data Shape

One ordered resource presentation models the three percentage metrics:

```ts
type HostMonitorResourceMetric = {
  key: "cpu" | "memory" | "disk";
  label: "CPU" | "RAM" | "Disk";
  percent: number | null;
  tone: ThresholdTone;
};
```

`hostMonitorSidebarResourceMetrics(machine, thresholds)` returns the three
entries in display order. It applies the shared freshness and threshold policy
once. Compact and floating renderers consume this list instead of maintaining
parallel CPU/RAM branches.

Network readings remain separate because direction color is not a health
threshold. The internal floating metric options use a discriminated union so a
metric cannot carry both a threshold tone and a network direction.

## Scope Boundary

`lib/portal-scope.ts` remains the sole owner of BB plugin scope attributes.
A pure props function accepts an optional explicit plugin id, the React helper
uses the compiled id, and a small DOM adapter applies the same attributes to an
element. The imperative monitor supplies the runtime `pluginId` and marks both
the interactive surface and drag preview before appending them to the body.

No wrapper element or inline style copy is introduced. Existing focus, drag,
cached position, z-index, cleanup, and viewport clamping remain unchanged.

## Layout

The floating resource row uses six grid tracks. CPU, RAM, and Disk each span two
tracks. Download and upload each span three tracks on the next row. The compact
popover keeps one inline ordered resource list and may truncate within its
existing bounds.

## Verification

- Exercise the resource presentation at normal, attention, critical, stale, and
  unavailable states.
- Exercise portal scope props and DOM application with explicit and compiled
  plugin ids.
- Run Host Monitor tests, typecheck, SDK type validation, and build.
- Install and reload the local plugin.
- In BB Surf, verify scope attributes, computed fixed positioning, the 352px
  maximum width, viewport containment, threshold computed colors, and a
  screenshot of the live floating monitor.
