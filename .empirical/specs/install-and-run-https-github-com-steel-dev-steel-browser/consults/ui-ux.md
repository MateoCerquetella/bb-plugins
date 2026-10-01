# UI/UX Advisory

Specialist: ui-ux

Verdict: advisory

## Findings

- Severity: low
  - Category: scope
  - Location: `mockups/index.html`
  - Recommendation: Keep jev-ultrafast out of the primary session table;
    expose its opt-in state as a compact connection/configuration detail only
    if the adapter is enabled.

## Assessment

The approved compact operational panel is the clearest interface for the
existing acceptance criteria. It shows the host, health, endpoint, active
sessions, and destructive release action without turning browser
infrastructure into a marketing dashboard. The jev-ultrafast addition is an
agent-runtime concern rather than a session-management concern, so it should
not add a second table or competing primary action. The contract should make
the external API-cost and credential boundary visible in configuration/status
copy; the added AC-8 and AC-9 cover that missing behavior.
