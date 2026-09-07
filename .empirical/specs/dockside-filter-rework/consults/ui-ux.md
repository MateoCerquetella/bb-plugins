# Specialist Consult: UI/UX

specialist: ui-ux
verdict: advisory

## Assessment

The proposed interface is the clearest fit for the acceptance criteria. It keeps
the normal `All` state visually quiet, makes every constrained state explicit,
and adds enough explanation at decision time without restructuring the
workspace list. The menu should read as a compact command surface, not as a
second navigation panel.

## Concrete interface

- Render `Workspaces` and its existing count at the leading edge of the section
  header. Keep selection and filter as separate trailing icon actions with
  equivalent hit targets.
- In the `All` state, render the filter trigger as the existing compact icon
  button. In every other state, render one rounded trigger containing the filter
  icon followed by the selected option label; constrain the label to one line
  and truncate before it crowds the selection action.
- Open a 248px popover aligned to the trailing edge of the trigger. Use a
  non-interactive `Filter workspaces` heading, then `All`, then the `Status` and
  `Inactivity` groups. Separate sections with token-colored rules and show group
  labels as subdued metadata rather than selectable rows.
- Give each option a strong one-line name, a wrapping muted description, and a
  reserved trailing check column. Keep the check column aligned even when a
  description wraps so selection is scannable.
- Highlight the focused row independently of the checked row. The active option
  must remain identifiable by its check without relying on color; Enter/Space
  selects, arrow keys move, and Escape dismisses and returns focus to the
  trigger.
- At narrow sidebar widths, preserve the icon and hit target first, truncate the
  active label, and allow the popover to collision-fit the viewport rather than
  compressing row content below a readable width.

## Findings

### Finding 1

- severity: low
- category: responsive-layout
- location: Design / Styling and responsive behavior
- recommendation: Specify that the active trigger label yields width to the
  existing count and selection action, with the icon and minimum interactive
  target remaining fixed. This makes “remain compact at narrow width” directly
  testable and prevents the active state from displacing adjacent controls.

### Finding 2

- severity: low
- category: interaction-state
- location: Design / Proposed UI
- recommendation: Keep keyboard focus styling distinct from the selected check
  state and return focus to the trigger on dismissal. Radix supplies the
  mechanics, but the visual contract should ensure keyboard users can distinguish
  the option they are navigating from the option currently applied.

### Finding 3

- severity: low
- category: information-hierarchy
- location: Design / Proposed UI
- recommendation: Reserve `All` as the first standalone row before grouped
  filters and keep `Status` before `Inactivity`. This order moves from broadest
  scope to live attention states to age-based cleanup states, matching likely
  usage and making the seven presets easier to scan.
