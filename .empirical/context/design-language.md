# Design language

The visual north star every interface in this repository inherits. Maintain it
from an exported design system, from what the code already does, or from an
explicit choice — then remove the managed marker.

Acquire it whichever way fits this repository:

- **Import** an exported token file, theme file, or Storybook configuration.
- **Derive** it from what is already here: a Tailwind configuration, CSS custom
  properties, a theme module, or existing components. Extracted values show
  which colours exist, not which carry meaning, so confirm intent rather than
  assuming it.
- **Elicit** it by choosing from concrete specimens when nothing exists yet.

Where an exported source and the code disagree, record the divergence instead of
silently preferring one. That gap is a finding: the design system and the shipped
product have drifted.

## Feel and references

- Three words: compact, native, legible.
- Reference products: BB's host sidebar and overlay surfaces; focused external
  references may inform hierarchy, but host interaction patterns stay primary.
- Deliberately avoid: ornamental chrome, hard-coded palette values, duplicate
  status signals, and controls that crowd narrow sidebars.

## Colour

- Primary: host `primary` tokens for selected/active emphasis.
- Accent: host `accent`, `sidebar-accent`, and hover-state tokens.
- Surface: `background`, `card`, `popover`, and sidebar surfaces with matching
  `border`, `input`, or `sidebar-border` boundaries.
- Text: `foreground` for primary copy and `muted-foreground` for metadata.
- Semantic (success, warning, danger, info): owner-scoped Dockside semantic CSS
  variables resolve from settings with host-token fallbacks; destructive and
  warning actions use host semantic tokens.
- Light and dark handling: every ordinary component inherits BB theme tokens;
  custom semantic colors resolve through Dockside preferences rather than
  fixed light/dark component palettes.

## Type

- Font families: inherit the BB host UI font; code/branch identifiers may use
  the host monospace family.
- Scale: compact sidebar metadata uses `text-2xs`, controls and row labels use
  `text-xs`, and settings/body content uses the host small/base scale.
- Weights: regular copy, medium interactive labels, and semibold compact
  headings; uppercase headings use restrained tracking.

## Layout and spacing

- Base unit: Tailwind's 0.25rem spacing scale, commonly expressed as 0.5-unit
  increments in dense sidebar composition.
- Radius: `rounded`/`rounded-md` for controls, cards, overlays, and chips.
- Maximum content width: host panels own page width; overlays use bounded widths
  such as 48–64 Tailwind units and collision-fit the viewport.
- Density: 24–32px sidebar controls/headers with compact two-row cards;
  comfortable and compact row density remain user-selectable in Dockside.
- Breakpoints: rely on host responsive surfaces and Radix collision handling;
  truncate flexible text before shrinking icons, metadata, or hit targets.

## Components and tone

- Component style: vendored shadcn/Radix primitives styled with host tokens,
  restrained borders and shadows, clear hover/focus-visible states, and
  iconography from the plugin's Hugeicons map.
- Empty, loading, and error states: concise inline copy; loading icons animate;
  errors use destructive semantics without displacing the primary workflow.
- UI copy voice: short, direct labels with sentence-fragment descriptions;
  accessibility names state the action and current selection.

## Source of record

- Acquired by: derived from Dockside's shipped components, settings palette,
  vendored UI primitives, and repository plugin-authoring conventions.
- Source of truth: `plugins/dockside/components`, `plugins/dockside/lib/preferences.ts`,
  and the host token classes consumed by the pinned plugin build.
- Confirmed by: repeated sidebar/header/card/settings patterns and successful
  Dockside typecheck/build against the installed SDK.
- Known divergence: Dockside still vendors legacy SDK declaration files while
  the repository convention prefers the pinned SDK package; this does not alter
  its visual token contract.
