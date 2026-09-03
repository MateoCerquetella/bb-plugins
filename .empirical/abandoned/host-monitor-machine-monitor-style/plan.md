# Plan

1. Port the referenced RPC schema, local sampler, SQLite store, server lifecycle,
   ECharts app, responsive CSS, and focused tests into `plugins/host-monitor`.
2. Adapt all runtime ids, realtime channels, database names, navigation route,
   class names, and visible copy to the Host Monitor identity; preserve existing
   branding and repository metadata.
3. Remove the old fleet/host-worker/process-termination implementation and every
   notification surface, including Sonner, alert banners, and the reference's
   sidebar warning accessory.
4. Reconcile package dependencies and workspace lockfile, update README and
   third-party notices, and add regression tests for identity and notification
   absence.
5. Run formatting/diff checks and focused Host Monitor checks, repairing only
   issues introduced by the adaptation.
6. Refresh Empirical repository context, execute the generated QA matrix, and
   obtain fresh-context review.
7. Install and reload the local plugin, inspect desktop and narrow-width UI,
   capture required screenshot/browser evidence, then complete and integrate the
   reviewed capability delta without publishing or pushing.
