<!-- empirical-sdd:managed-context-v2 -->
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

- Three words:
- Reference products:
- Deliberately avoid:

## Colour

- Primary:
- Accent:
- Surface:
- Text:
- Semantic (success, warning, danger, info):
- Light and dark handling:

## Type

- Font families:
- Scale:
- Weights:

## Layout and spacing

- Base unit:
- Radius:
- Maximum content width:
- Density:
- Breakpoints:

## Components and tone

- Component style:
- Empty, loading, and error states:
- UI copy voice:

## Source of record

- Acquired by: TODO import, derive, or elicit
- Source of truth: TODO exported file, repository code, or explicit choice
- Confirmed by: TODO
- Known divergence: TODO none, or what disagrees and where
