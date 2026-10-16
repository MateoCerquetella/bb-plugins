# Plan

## Implementation

1. Extend the sidebar presentation model in `plugins/host-monitor/lib/sidebar-host-monitor.ts` to return ordered CPU, RAM, and disk metrics with shared threshold/freshness tones.
2. Update compact and floating renderers in the same module to consume that model, keep network metrics separate, and apply the canonical portal scope attributes to body-mounted monitor and drag-preview nodes.
3. Adjust scoped CSS in `plugins/host-monitor/app.css` so the floating resource row remains readable, fixed, and viewport-contained under the new BB scoping rules.
4. Add behavioral tests for the ordered metric model, stale/unavailable behavior, and portal scope application; preserve existing registration and threshold tests.

## Affected tests

- `plugins/host-monitor/test/sidebar-summary.test.ts`
- `plugins/host-monitor/test/threshold-presentation.test.ts`
- `plugins/host-monitor/test/app-registration.test.ts`

## Verification

Run the focused Host Monitor test suite, TypeScript/build checks, then install and reload the local plugin and inspect the live floating monitor in BB Surf at normal and narrow widths.
