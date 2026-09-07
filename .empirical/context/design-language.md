# Design language

## Feel and references

- Three words: quiet, dense, legible.
- Reference products: BB's Settings, Extensions, sidebar, panels, pickers, and
  semantic host surfaces. Native Touch Bar surfaces use AppKit controls.
- Deliberately avoid: decorative dashboards, saturated card fills, ornamental
  gradients, arbitrary shadows, duplicated navigation, hidden destructive
  actions, and plugin overlays that cover BB approvals or dialogs.

## Colour

- Primary and accent: inherit BB semantic tokens such as `--primary` and
  `--accent`; native controls use restrained AppKit system colours.
- Surface: use `--background`, `--card`, `--popover`, and `--muted`, separated
  with `--border` and restrained elevation.
- Text: use `--foreground` for decisions and `--muted-foreground` for metadata.
- Semantic: green is healthy, orange is attention, red is error/critical, and
  blue or purple identifies active selection. Pair colour with text or labels.
- Light and dark: inherit active BB variables. Theme-aware SVGs use a
  single-colour/current-color mark because BB masks plugin icons. Touch Bar
  targets its dark hardware surface and AppKit dynamic colours.

## Type

- Font families: inherit BB's interface font on web surfaces; use AppKit system
  fonts and monospaced digits for compact native status readouts.
- Scale: compact 11–14px supporting text and controls with clear 14–16px section
  hierarchy on plugin-owned surfaces.
- Weights: regular body, medium labels, semibold headings; reserve bold for
  compact emphasis.

## Layout and spacing

- Base unit: 4px, commonly composed into 8px, 12px, and 16px gaps.
- Radius: BB token-driven compact radii, generally 6–12px; native controls use
  small rounded pills and circular status icons.
- Maximum content width: defer to the host surface and keep content fluid.
- Density: information-forward without removing touch targets or focus space.
- Breakpoints: collapse multi-column web layouts near 640px. The native Touch
  Bar uses fixed 30px hardware-height geometry.

## Components and tone

- Prefer host-owned components for provider/model selection and vendored
  BB-style primitives for plugin-owned controls; use AppKit-native buttons and
  pills on Touch Bar.
- Empty, loading, and error states keep layout stable, name the state directly,
  preserve last-good operational data where safe, and retry only through a real
  bounded action.
- UI copy is short, direct, factual, and explicit about scope and consequences.
- Ordinary panes occupy base tiers, plugin popovers sit above page content, and
  BB-owned dialogs/interactions remain above plugins.

## Source of record

- Acquired by: derived from BB semantic CSS variables, host Settings and
  Extensions surfaces, current plugin source, and AppKit implementations.
- Source of truth: BB's active theme tokens and Plugin SDK host components,
  `plugins/*/app.css`, and
  `plugins/touchbar/native/Sources/TouchBarController.swift`.
- Confirmed by: focused tests, README behavior descriptions, live Save My Model
  settings, and Action Topbar light/dark/narrow captures.
- Known divergence: plugins vendor their UI and vary in dimensions; semantic
  intent and host-token inheritance are shared, not a centralized token package.
