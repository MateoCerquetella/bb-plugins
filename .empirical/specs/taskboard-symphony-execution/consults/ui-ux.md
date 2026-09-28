# UI/UX advisory

- Specialist: ui-ux
- Verdict: advisory

## Findings

- Severity: low
  Category: state-coverage
  Location: mockups/index.html
  Recommendation: Include queued, retrying, unavailable, and duplicate-submit prevention in implementation under AC-4, AC-5, and AC-UI-1.

## Scope and evidence

Static review of `mockups/index.html` against the existing Taskboard detail view in `plugins/taskboard/app.tsx` and theme usage in `app.css`. The mockup server responds successfully and its inline JavaScript parses. Browser rendering and interaction verification have not been performed: the available computer-use surface reported no browsers. This advisory is not user approval.

## Recommendation

Retain the existing issue header, metadata, description, and composer actions. Add one execution section within task details and disclose backend metadata only on request. Keep the default local scenario visually unchanged. A review dialog captures route, plan, criteria, and checks together; selecting structured execution is explicit.

## State coverage

The mockup includes local, ready, running, implementation complete, failed verification, passed verification, blocked, and canceled states. Implementation must additionally show queued/retrying and unavailable-runtime states, preserve inputs after an RPC failure, prevent duplicate submissions, and announce asynchronous status changes accessibly. These belong to AC-4, AC-5, and AC-UI-1.

## Deliberately excluded

No separate Symphony dashboard, prominent backend selector in the default flow, automatic tracker Done transition, or unrelated Taskboard redesign. Styling is a layout reference using system colors; implementation must use existing Taskboard/BB theme tokens and components.

## Approval

The user approved the displayed direction with “go” in this thread. See ../mockups/approval.md. Browser fidelity remains to be verified against the implementation.
