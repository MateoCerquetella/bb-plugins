# Plan

1. Update `ProjectGroup` to pass the grouped project's name and color override
   into each root `ThreadCard`.
2. Update `ThreadCard` to render the project badge in the leading grid cell,
   remove the leading provider glyph, and render the single provider glyph
   immediately before trailing family status.
3. Extend `thread-card-layout.test.ts` to guard badge placement, provider
   uniqueness/order, selection behavior, and unchanged two-row geometry.
4. Run Dockside focused tests, typecheck, and build through Empirical evidence
   commands.
5. Install/reload the local Dockside plugin, inspect the live UI through the
   bound Steel browser, and collect screenshot evidence.
6. Obtain fresh-context review, address any findings, verify the final
   acceptance matrix, and integrate the capability delta.
