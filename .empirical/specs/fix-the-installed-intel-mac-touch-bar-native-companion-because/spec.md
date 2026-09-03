# Fix The Installed Intel Mac Touch Bar Native Companion Because

## Request

> Fix the installed Intel Mac Touch Bar native companion because physical touch still does not activate thread cards or any settings controls. Reproduce on the enrolled Mac, identify the actual Touch Bar event-routing failure, and implement a reliable finger-scrollable lane where completed taps activate threads/settings and horizontal swipes scroll without triggering taps. Preserve the acknowledged-error filtering, red settings close control, larger controls, exact-id BB actions, BTT alternative, tests, and documentation. Rebuild and install the corrected app on the Mac, run focused/root verification, and record human hardware evidence.

## Goal

The installed Intel Mac companion must accept real Touch Bar input reliably:
short taps on thread cards and settings controls perform their actions,
horizontal finger drags scroll the lane, and drags never trigger clicks.

## Acceptance Criteria

<!-- Replace this comment with observable criteria such as:
- [ ] [AC-1] The user can complete the intended action.
- [ ] [AC-UI-1] [UI] The result is visible in the browser.
-->

- [ ] [AC-1] A short physical tap on a visible thread card opens that exact BB
  thread only after the command succeeds.
- [ ] [AC-2] A short tap on every settings control, including the red close
  control, invokes its configured action and updates the panel.
- [ ] [AC-3] A horizontal finger drag scrolls thread, carousel, host, and
  settings lanes without invoking a child button action.
- [ ] [AC-4] Hit testing uses receiver-local coordinates without reconverting
  points from a superview.
- [ ] [AC-5] Child buttons use completed AppKit click tracking, not immediate
  mouseDown dispatch, so swipes can cancel clicks.
- [ ] [AC-6] The repaired source compiles, installs, and runs on the enrolled
  Intel Mac with a log marker identifying the build.
- [ ] [AC-7] Existing filtering, exact-id guards, BTT support, red close control,
  larger settings, tests, and docs remain intact.

## Scope

- Native controller input routing and focused contract tests.
- Intel Mac rebuild/install and human Touch Bar interaction verification.
- Feature-local Empirical specification, decision, delta, and evidence records.

## Non-goals

- No new server API, storage access, or command semantics.
- No physical stop action or BTT protocol redesign.
- No deletion or normalization of unrelated concept files.

## Verification

- Run plugin and root checks.
- Rebuild/install on the enrolled Mac and verify the runtime marker.
- Physically tap settings and a thread, swipe to a later card, and confirm no
  spurious click during the swipe.
- Complete fresh-context review of the committed diff.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
