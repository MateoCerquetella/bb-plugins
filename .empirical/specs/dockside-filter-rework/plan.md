# Plan

1. Extend `lib/thread-management.ts` with exhaustive typed filter presentation
   metadata and group derivation while leaving matching behavior unchanged.
2. Rebuild `components/inbox/filter-menu.tsx` around the existing Select with a
   standalone All row, labelled Status/Inactivity sections, descriptions,
   selected checks, and a bounded active trigger label.
3. Update `components/inbox/thread-inbox.tsx` to present the section as
   Workspaces and preserve adjacent count/selection actions at narrow widths.
4. Add metadata behavior assertions and a focused filter UI contract test;
   retain all current thread-management/reorder coverage.
5. Run focused tests, Dockside typecheck/build, and root repository checks.
6. Install and reload the local Dockside plugin, inspect closed/open and narrow
   filter states in BB, and capture screenshot evidence.
7. Review the diff against the spec, integrate the capability delta, and report
   the highest evidenced completion level without publishing.
8. Incorporate the user correction by adding a Status option, derive ordered
   semantic groups from the existing family-status resolver, render collapsible
   status sections with unchanged thread cards, and re-run focused/live/full CI.
