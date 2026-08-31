# UI/UX advisory: manual composer capture

- Specialist: ui-ux
- Verdict: advisory

## Findings

### 1. Prefer direct editable capture over an intermediate preview

- Severity: Low
- Category: Interaction model
- Location: `design.md` — Manual composer capture
- Recommendation: Keep the modal opening directly into populated, ordinary form fields. This is the clearest interface because capture is synchronous and local, while the existing Create action already supplies the confirmation boundary. Do not add a preview step, progress treatment, or artificial delay. Replace the somewhat passive “Using the original prompt” explanation with explicit provenance and consequence copy such as: “Your prompt was copied into these editable fields. Review it before creating the issue.” If space permits, add: “Nothing is created until you select Create.” Avoid the user-facing term “composer-assisted,” which could still imply generation.

### 2. Define the complete visible state model

- Severity: Medium
- Category: State design
- Location: `design.md` — Manual composer capture and Validation and release gate
- Recommendation: Specify and verify these concrete states: (1) **Captured/editing** — the modal appears immediately, title is populated by `titleFromPrompt()`, description contains the trimmed prompt, and both fields are editable; there is no visible initialization or drafting state. (2) **Incomplete** — a required field is empty, Create is unavailable, and the affected field has an inline explanation; a blank or whitespace-only prompt lands here without fabricated content. (3) **Provider pending or unavailable** — the captured fields remain visible and editable, Create is unavailable, and provider-specific status is shown separately from the fields. (4) **Ready** — provider metadata and required fields are valid and Create is enabled. (5) **Creating** — one submission is in flight, duplicate submission is prevented, and the status says “Creating issue…” rather than “Drafting.” (6) **Outcome uncertain** — preserve the existing duplicate-creation protection and all edits, with recovery copy that refers only to issue creation. (7) **Confirmed failure** — preserve all edits, show the provider error, and offer creation retry without any “regenerate” action. (8) **Confirmed success** — use the existing success/close behavior. Provider metadata updates must never overwrite edits or cause the form to return to its initial captured values.

### 3. Preserve prompt provenance and user edits

- Severity: Medium
- Category: Data integrity
- Location: `spec.md` — Risks; `design.md` — Manual composer capture
- Recommendation: Initialize the fields once per modal opening. The description should retain the complete prompt apart from intentional outer-whitespace trimming; the derived title must never substitute for or remove prompt content. Subsequent renders, provider loading, validation, and failed or uncertain submissions must preserve the user's current field values. This makes it evident that the title is merely an editable starting point and ensures the original prompt remains recoverable during review.

### 4. Make the confirmation boundary perceivable and accessible

- Severity: Low
- Category: Accessibility and action clarity
- Location: `spec.md` — AC-1 and AC-UI-1; `design.md` — Manual composer capture
- Recommendation: Keep the form's primary action explicitly labeled “Create issue” and visually distinct from opening the capture modal. Associate the provenance explanation with the fields using normal descriptive text, put initial focus on the title field, retain visible labels for title and description, and provide a discoverable reason whenever Create is unavailable. Preserve the released Ticket icon, accessible pin label, and right-panel behavior, but do not use iconography, live regions, or status language that suggests model work is occurring.
