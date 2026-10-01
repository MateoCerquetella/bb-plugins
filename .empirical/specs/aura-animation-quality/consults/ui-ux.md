# UI/UX Consult

- Specialist: `ui-ux`
- Verdict: `advisory`

The delivery-only contract refresh does not change the interface. The approved
mockup remains the clearest fit for Aura's compact settings panel: both option
sets stay visible, the selected values are immediately comparable, and the GPU
cost text remains adjacent to the decision it explains.

## Findings

### Visible comparison improves clarity

- Severity: low
- Category: clarity
- Location: `mockups/index.html`
- Recommendation: Keep the three choices visible as segmented controls so the
  user can compare cost and quality without opening a menu.

### Selection state must be programmatic

- Severity: low
- Category: accessibility
- Location: `mockups/index.html`
- Recommendation: Use native buttons with `aria-pressed` and associate helper
  copy with the controls in the real settings panel.

### Existing state coverage is sufficient

- Severity: low
- Category: state-coverage
- Location: `spec.md` AC-4, AC-UI-1, and `mockups/index.html`
- Recommendation: Retain immediate preview updates, persisted Apply behavior,
  the existing conservative defaults, and narrow-panel wrapping as the complete
  UI state set for this change. Installation and status verification add no new
  user-facing state.

## Deliberately Ruled Out

- Do not introduce free-form FPS or render-scale inputs.
- Do not add another settings page, modal, or installation UI.
- Do not alter the existing reduced-motion, disabled, or no-WebGL fallbacks.
