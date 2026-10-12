# Activity Overview Plan

1. Inspect the plugin catalog and copy the smallest existing React plugin
   manifest pattern into `plugins/activity-overview`.
2. Add a pure `data.ts` view model with periods, repositories, metrics, heatmap
   cells, patterns, and attention items.
3. Implement `app.tsx` with labelled selectors, metric cards, heatmap, pattern
   summary, and attention list.
4. Implement responsive `app.css`, README, and workspace catalog registration.
5. Add focused tests for deterministic data and selector-relevant outputs.
6. Run typecheck, tests, build, and workspace checks; fix failures before
   browser verification.
