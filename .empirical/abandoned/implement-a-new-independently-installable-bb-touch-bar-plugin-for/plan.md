# Plan: BB Touch Bar Agent Monitor

1. Inspect the exact BB 0.40 / SDK 0.4.21 thread and testing declarations,
   scaffold `plugins/touchbar`, and pin the independent package/toolchain.
2. Implement the pure bounded snapshot model and CLI composition root with
   settings, `snapshot`, compact card rendering, `open`, guarded `stop`, and
   slot-based BTT helpers.
3. Add focused pure and BB harness tests for ordering, privacy bounds, hidden
   filtering, JSON, parsing, mutation guards, SDK failures, and output limits.
4. Implement the supported BTT surfaces: an importable All Apps shell-widget
   preset plus dependency-free wrapper/installer, and the richer auditable
   Swift source plugin described by the design. Add fixtures and contract tests.
5. Add branding, license/notices, plugin README and root workspace/collection/
   catalog documentation. Install dependencies without changing other plugins'
   pinned SDK behavior.
6. Run focused checks, repair failures, install/reload locally, exercise CLI
   success/failure paths, run root checks and package/clean-consumer guards,
   then collect Empirical receipts and independent fresh-context review.
