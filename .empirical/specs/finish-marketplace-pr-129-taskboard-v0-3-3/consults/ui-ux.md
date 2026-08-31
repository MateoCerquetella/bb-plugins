# UI/UX Specialist Consult

- Specialist: ui-ux
- Verdict: advisory

## Assessment

For the thread-header action, this is the clearest interface for the stated
criteria: keep the familiar compact control and change only the misleading
generic panel glyph to the semantically specific `Ticket` icon. A broader
layout or interaction redesign would add risk without improving the requested
task-capture affordance.

The native Plan drafting design is sound as a trust boundary, but its visible
states are not yet concrete enough to guarantee a clear experience. The final
interface should make AI drafting explicitly optional, disclose what is sent
before activation, preserve the user's text throughout, and keep issue creation
as a visibly separate confirmation.

## Concrete target

### Thread header

- Place the existing compact ghost icon button in its current thread-header
  position and retain its current dimensions, spacing, hit target, tooltip,
  accessible pin label, focus treatment, and open/pin behavior.
- Render the `Ticket` icon at the same optical size and stroke weight as adjacent
  header icons. Do not add a text label to the compact header or use
  `PanelRight` as either the default or active glyph.
- Preserve the existing visible pinned/selected treatment. The selected state
  must remain distinguishable without relying on the icon shape alone, and the
  accessible state semantics must continue to match the control's behavior.

### Issue-drafting modal

1. Keep the original prompt visible and editable as the stable source input.
2. Present AI drafting as an optional secondary action, identified with the
   selected provider. Immediately beside that action, state that the prompt and
   relevant repository context are sent to the selected model and that the
   result must be reviewed before issue creation.
3. While drafting, show a concise progress state such as “Drafting…” without
   disabling modal cancellation or replacing the user's original text.
4. On success, populate the existing editable draft fields. Do not auto-create
   the issue, move focus unexpectedly, or visually imply that the generated
   text is final. Keep the existing explicit issue-creation confirmation as the
   sole external-mutation action.
5. On unsupported-provider, malformed-output, or helper failure paths, restore
   the editable original prompt and show a brief inline status such as “AI draft
   unavailable; your original prompt is unchanged.” Offer retry only when the
   underlying state is retryable.

## Findings

### Finding 1

- Severity: Low
- Category: Affordance and visual continuity
- Location: `design.md` — Carried-forward thread-header UI; `spec.md` — AC-UI-1
- Recommendation: Implement the released control as an icon-only substitution:
  use `Ticket`, retain the exact existing geometry, label, tooltip, state
  treatment, and behavior, and add no new header layout. This is the clearest
  match for the criterion and should be treated as the visual reference target.

### Finding 2

- Severity: Medium
- Category: Trust and informed consent
- Location: `design.md` — Strict native Plan issue drafting
- Recommendation: Put the repository-context and selected-model disclosure in
  the drafting modal adjacent to the optional AI action, before invocation.
  Documentation and marketplace copy are useful context but are too remote from
  the moment when the user chooses to send content.

### Finding 3

- Severity: Medium
- Category: Interaction states and recovery
- Location: `spec.md` — AC-4 and AC-5; `design.md` — Strict native Plan issue drafting
- Recommendation: Specify loading, success, fallback, and retryable archive-
  failure states as visible UI behavior. Every failure path should leave the
  original prompt editable, explain that no issue was created, and avoid a
  spinner or disabled modal that can appear stuck while internal reconciliation
  retries.

### Finding 4

- Severity: Medium
- Category: Action hierarchy and mutation safety
- Location: `spec.md` — AC-5; `design.md` — Strict native Plan issue drafting
- Recommendation: Keep “Draft with AI” visually secondary to the explicit
  issue-creation action and never reuse the creation button as the drafting
  trigger. Generated title/body content should land in the same editable fields
  as manually authored content, with a separate, unmistakable final confirmation
  before the external issue mutation.

### Finding 5

- Severity: Low
- Category: Accessibility
- Location: `design.md` — Carried-forward thread-header UI and drafting modal states
- Recommendation: Preserve the current accessible name and keyboard behavior of
  the pin control, expose its selected state through the existing appropriate
  semantics, and announce asynchronous drafting completion or failure through a
  non-disruptive status region. Focus should remain on the invoking action while
  drafting and move only in response to an explicit user action.
