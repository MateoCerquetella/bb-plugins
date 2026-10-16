# Add Color Thresholds For Cpu Ram And Disk Usage In

## Request

> Add color thresholds for CPU, RAM, and disk usage in the host monitor, and fix the floating monitor modal/popover positioning that is broken in the new BB shell. Preserve the existing host-monitor design and verify both threshold presentation and the live floating UI in current BB.

## Goal

Host Monitor users can scan fresh CPU, RAM, and disk usage by severity, and
the floating monitor remains fully styled and inside the visible BB viewport
under the current plugin CSS scoping contract.

## Acceptance Criteria

- [ ] [AC-1] Fresh CPU, RAM, and disk percentages use the effective configured
  thresholds: below attention is normal, at or above attention is warning, and
  at or above critical is critical.
- [ ] [AC-2] Stale readings remain neutral and unavailable readings do not
  receive a severity color.
- [ ] [AC-3] Threshold meaning is available to assistive technology and does not
  rely on color alone.
- [ ] [AC-UI-1] [UI] The page, sidebar summary, and floating monitor retain the
  existing Host Monitor visual language while showing threshold tones.
- [ ] [AC-UI-2] [UI] The floating monitor and drag preview receive compiled
  plugin styles when mounted under `document.body`.
- [ ] [AC-UI-3] [UI] The floating monitor uses fixed positioning, is no wider
  than 352 CSS pixels, and stays within the visual viewport with an 8px gutter.

## Scope

- Reuse the existing shared attention and critical percentages.
- Derive presentation tones from fresh CPU, RAM, and disk readings.
- Apply the current BB plugin scope attributes to imperative body-mounted Host
  Monitor surfaces.
- Add focused behavioral coverage and verify the installed plugin in current BB.

## Non-goals

- Independent thresholds per metric.
- New legends, charts, or alert behavior.
- Redesigning the Host Monitor page, sidebar, or floating monitor.
- Changing sampling, persistence, or positioning arithmetic.

## Verification

- Run Host Monitor unit tests, typecheck, SDK type checks, and plugin build.
- Install and reload the local Host Monitor plugin.
- In BB Surf, assert the floating surface scope attributes, computed fixed
  position, bounded width, viewport containment, and visible threshold tones.
## Capability Deltas

- `deltas/host-monitor-resource-presentation.md`
