# UI/UX advisory

- Specialist: ui-ux
- Verdict: advisory
- Question: Does this mockup show the clearest interface for the stated criteria,
  and what does it reveal that the criteria are still missing?
- Context: spec.md plus direct inspection of the installed Settings -> Aura
  editor. This change reuses the existing `BackgroundEditor`; no new mockup is
  needed because the control sits in the established appearance checklist.

## Assessment

The new option belongs with the existing scope controls rather than in a new
panel: it changes where the wallpaper is allowed to paint, not what the
wallpaper is. A single checkbox with a one-line "On/Off" explanation matches the
neighbouring **New thread screen only** and **Half wallpaper** rows and keeps
the Apply background contract understandable. The shared editor component means
the same control appears in Settings and the thread-panel action without a
second implementation.

## Findings

### UX-1
- Severity: low
- Category: layout
- Location: plugins/aura/app.tsx, BackgroundEditor controls fieldset
- Finding: A third full-width scope row adds vertical distance before the image
  and texture controls, which matters in the narrow thread-panel editor.
- Recommendation: Keep the help copy to one short sentence, reuse the existing
  `.aura-scope` row, and verify the fieldset remains scrollable at narrow
  widths. No new layout container is needed.

## Browser check

Verify the checkbox is visible and operable at desktop and 390px widths in both
the Settings section and the thread-panel action, toggling it, applying, and
confirming the persisted state. No blocking design findings.
