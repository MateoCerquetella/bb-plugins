# Design

BB already supplies optional per-window `cost` objects, the server validates
them, normalization preserves them, and `formatCost()` safely localizes USD.
The missing link is presentation. Import `formatCost` into `sidebar-strip.ts`
and append a noninteractive metadata line to `detailWindowRow` only when
`window?.cost` is non-null. Keep reset text as a separate line so percentage,
reset, and credits remain independently understandable.

Add a semantic CSS class for the credit line, source-contract assertions that
the renderer uses `formatCost(window.cost)`, and focused functional coverage for
cost formatting/no-cost omission. Update README/changelog, bump manifest and
lockfile to 0.1.9, then release through `usage-tracker/v0.1.9`; the marketplace
already uses `^0.1.0` and `usage-tracker/`.

No CLI execution, provider probing, or new persistence is introduced.
