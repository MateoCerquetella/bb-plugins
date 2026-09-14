# UI/UX advisory

- Specialist: ui-ux
- Verdict: advisory

## Focused pass
Reviewed spec.md and the preparation-desk clickable mockup against the compact, native, operational design language described in mockups/README.md. This is the implementation agent's focused design pass, not an independent code review or human approval.

One direction is sufficient to review the minimum complete workflow: brief and conversation with sources, prototypes and history tabs. Deliberately ruled out a decorative dashboard, automatic interception of BB's composer, tracker prerequisites and launching implementation on export. The dark neutral reference styling uses compact controls and a restrained selection accent; final UI must inherit BB tokens.

Browser exercised request → editable title → save → two alternatives with simulated partial failure → individual retry → conversational refinement → selection → ready → reopen → packet preview. Interactive preview filter and milestone action worked. At a 390px viewport the body measured 375px wide, with no horizontal overflow.

### Finding: Preserve every generation run
- Severity: low
- Category: state-coverage
- Location: mockups/index.html, generate()
- Recommendation: Append a generation batch instead of replacing previous alternatives. Applied in the mockup; implement durable run grouping, clear run labels and version selection in the plugin.

### Finding: Mid-generation brief edits
- Severity: low
- Category: state-coverage
- Location: spec.md AC-3 and AC-6
- Recommendation: Explicitly require an agent proposal/conflict state when a brief changes while an agent is working. Preserve direct edits, show the generating revision and require deliberate application of the proposal. Added to the specification.

### Finding: Project scope change and offline host
- Severity: low
- Category: interaction
- Location: spec.md AC-1 and mockups/index.html initial form
- Recommendation: Keep persisted work tied to its original project and environment when New thread changes projects; show the newly selected project's preparations without silently retargeting existing work. Reject unavailable environments with a retryable explanation. Added to the specification; unavailable-host state is clickable.

## Fidelity boundaries
The mockup is sample data, simulated agent replies and illustrative in-document previews. It is not evidence of repository retrieval, BB provider integration, cross-host execution or production preview isolation. Readiness, persistence, packet layout and full version provenance require real plugin tests. Human approval has not been recorded.

## Follow-up pass: September 14 user feedback
Removed duplicate project/environment controls, required native submission with the user's selected settings, and added optional existing Taskboard task linkage. This follows the user's requested interaction. Project/model/environment controls are owned by BB; preparation owns only its mode, brief and optional task reference. Existing Taskboard settings are the only connector configuration surface. The mockup includes explicitly labeled connection-state controls for review only, not for the product.

Confirmed in a fresh browser session: no duplicate settings inputs; no connection leaves Send enabled; selecting the GitHub sample task carries its reference to the brief and exported packet. At 390px viewport the body remains within the viewport. The exact unsent root selections are not exposed through the current side-panel/composer view API; native submission and post-creation binding still require real BB validation. No human approval is inferred from this focused pass.
