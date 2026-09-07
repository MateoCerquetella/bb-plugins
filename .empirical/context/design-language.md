# Design language

## Feel and references

- Three words: compact, native, operational.
- Reference products: BB's host UI and macOS AppKit controls; plugin surfaces inherit BB SDK primitives and theme tokens rather than establishing a separate brand.
- Deliberately avoid: decorative dashboards, saturated full-surface color, hidden destructive actions, and layouts that trade operational density for whitespace.

## Colour

- Primary and accent: inherit BB theme tokens in web surfaces; native Touch Bar controls use restrained AppKit system colors for selection and semantic state.
- Surface and text: use host background, border, muted, foreground, and muted-foreground tokens; native controls use dark neutral bezels with legible system text.
- Semantic: green is healthy/complete, orange is attention/warning, red is error/critical, and blue or purple is active selection/provider identity.
- Light and dark handling: web UI uses host semantic tokens; native Touch Bar UI targets its dark hardware surface and AppKit dynamic colors.

## Type

- Font families: host defaults for web UI; AppKit system and monospaced-digit system fonts for native status readouts.
- Scale: dense labels and metadata, with restrained size and weight hierarchy.
- Weights: regular for supporting information, medium/semibold for controls and status, bold only for compact emphasis.

## Layout and spacing

- Base unit: 4px-derived spacing in dense controls.
- Radius: small-to-medium rounded controls and pills, with circular compact provider/status icons.
- Maximum content width: surface-owned; panels prioritize compact grouping rather than a global page width.
- Density: compact and information-forward.
- Breakpoints: each web plugin follows its BB host surface; the native Touch Bar uses fixed 30px hardware-height geometry.

## Components and tone

- Component style: BB SDK primitives for web UI, AppKit-native buttons/pills for Touch Bar, clear selected state, and explicit confirmation for destructive actions.
- Empty, loading, and error states: preserve last-good operational data where safe, pair it with concise state text, and recover automatically when the source returns.
- UI copy voice: short, direct, sentence case, and action-oriented.

## Source of record

- Acquired by: derived from repository code.
- Source of truth: plugin CSS/theme-token usage and `plugins/touchbar/native/Sources/TouchBarController.swift`.
- Confirmed by: existing tests, README behavior descriptions, and current component implementations.
- Known divergence: plugins vendor their UI and can vary in exact dimensions; semantic intent and host-token inheritance are shared, not a centralized token package.
