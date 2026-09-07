# Design language

## Feel and references

- Three words: quiet, dense, legible.
- Reference products: BB's own Settings, Extensions, sidebar, panels, pickers,
  and semantic host surfaces. Plugin interfaces should feel native to BB rather
  than importing another product's visual identity.
- Deliberately avoid: saturated card fills, ornamental gradients, arbitrary
  shadows, duplicated navigation, raw storage/debug tables as primary UI, and
  plugin overlays that cover BB approvals or dialogs.

## Colour

- Primary and accent: inherit BB semantic tokens such as `--primary`,
  `--accent`, and their foreground pairs; do not hardcode a brand palette into
  ordinary controls.
- Surface: `--background`, `--card`, `--popover`, and `--muted`, separated with
  `--border` and restrained elevation.
- Text: `--foreground` for decisions and labels; `--muted-foreground` for
  metadata and help.
- Semantic: use the host's success, warning, destructive, and informational
  meanings. Pair every colour with text, iconography, or an accessible label.
- Light and dark: inherit active BB variables. Theme-aware SVGs use a
  single-colour/current-color mark because BB masks plugin icons.

## Type

- Font families: inherit BB's interface font; use its monospace stack only for
  identifiers and code.
- Scale: compact 11–14px supporting text and controls with clear 14–16px section
  hierarchy on plugin-owned surfaces.
- Weights: regular body, medium labels, semibold headings; avoid heavy display
  weights in operational UI.

## Layout and spacing

- Base unit: 4px, commonly composed into 8px, 12px, and 16px gaps.
- Radius: BB token-driven compact radii, generally 6–12px.
- Maximum content width: defer to the host page/panel; plugin content remains
  fluid with bounded readable sections.
- Density: information-dense without removing touch targets or focus space.
- Breakpoints: collapse multi-column plugin layouts near 640px; verify narrow
  panels, full-width settings, and coarse-pointer behavior.

## Components and tone

- Component style: prefer host-owned components for product capabilities such
  as provider/model selection and vendored BB-style primitives for plugin-owned
  controls. Borders and state changes carry hierarchy before colour.
- Empty, loading, and error states: keep the surrounding layout stable, name
  what BB is waiting for or could not resolve, and provide retry only when it
  performs a real bounded action.
- UI copy voice: direct, short, and factual. State scope and consequences,
  especially when a plugin preference does not alter a BB global/default flow.
- Overlay hierarchy: ordinary panes occupy the base tiers, plugin popovers sit
  above page content, and BB-owned dialogs/interactions remain above plugins.

## Source of record

- Acquired by: derived from BB semantic CSS variables, host Settings and
  Extensions surfaces, existing plugin component source, and live dark-mode
  verification.
- Source of truth: BB's active theme tokens and Plugin SDK host components,
  plus `plugins/*/app.css` for plugin-owned layout.
- Confirmed by: live Save My Model settings and Action Topbar launcher captures
  at 1440px, current frontend harness tests, and the user-provided overlap case.
- Known divergence: older plugin assets with embedded purple SVG styles predate
  BB's current icon masking convention; new or changed visible icons should use
  theme-aware single-colour artwork.
