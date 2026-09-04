# UI/UX Advisory

Specialist: ui-ux

Verdict: advisory

## Summary

The architecture is sound and meets the requested direction. Implementation
must resolve keyboard reordering, dirty drafts, process confirmation content,
deterministic responsive behavior, and complete state coverage.

## Findings

### High — accessibility — dashboard configuration

Provide a named drag handle plus Move up/Move down buttons, disable impossible
moves, retain focus on the moved item, and announce its resulting position.

### High — destructive-action safety — process restoration

Confirmation must identify host, process, PID, graceful/force effect, and
unsaved-work risk. Focus Cancel first and use action-specific destructive labels;
force requires a new preflight and separate dialog.

### High — interaction-state coverage — dashboard configuration

Prevent silent dirty-draft loss during host change or browser exit. Disable Save
while unchanged/saving, keep inline failures, and preserve failed drafts.

### Medium — layout and visual consistency — experience architecture

Use a compact sticky command header, non-repeated selected-host identity, and a
consistent card anatomy. Reserve red for failures/destructive actions and use
neutral protected-state badges.

### Medium — customization clarity — dashboard configuration

Use an ordered editor list separate from live data cards. Include handle,
visibility checkbox, name, optional visualization, and movement buttons. Reset
changes the draft only and still requires Save.

### Medium — responsive behavior — state coverage

Use a wrapping host grid when wide and horizontal snap strip when narrow; switch
process tables to stacked semantic rows and keep edit actions sticky/reachable.

### Medium — process-table usability — process restoration

Use a sortable sticky-header table with right-aligned metrics when wide and
semantic stacked rows when narrow, sharing filter/sort controls.

### Medium — state coverage — process restoration

Distinguish initial loading, retained refresh, empty, no filter matches,
unsupported, disconnected, permission-limited/protected, request error,
preflight rejection/expiry, success, and still-running outcomes.

### Low — feedback and semantics — dashboard/process controls

Use a persistent polite live region for reorder/save/refresh/termination. Label
visibility controls explicitly, expose sort direction, and name icon controls.
