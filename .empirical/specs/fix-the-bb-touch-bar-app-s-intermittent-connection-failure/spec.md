# Fix The Bb Touch Bar App S Intermittent Connection Failure

## Request

> Fix the BB Touch Bar app's intermittent connection failure where it shows reconnecting indefinitely; diagnose the lifecycle, implement a robust recovery, and verify the UI and connection behavior.

## Goal

Keep the native Touch Bar monitor polling after a BB CLI invocation times out or leaves a helper process holding stdout open, so a transient BB outage recovers without restarting the app.

## Acceptance Criteria

- [ ] [AC-1] A snapshot command that exceeds its deadline cannot block the AgentStore polling queue indefinitely.
- [ ] [AC-2] The runner captures bounded stdout without waiting for EOF from helper descendants and cleans up timed-out processes.
- [ ] [AC-3] After three failed polls, existing cards remain visible with a reconnecting indicator; after a later successful poll, it clears without an app restart.
- [ ] [AC-4] Automated regression coverage and existing Touch Bar checks pass.

## Scope

- Native `BBCommand` subprocess execution and `AgentStore` recovery.
- Native-source contract tests and documentation if needed.

## Non-goals

- Changing BB's realtime transport, redesigning the UI, or changing snapshot schema.
- Publishing or installing a release on the user's Mac.

## Verification

- Run focused regression tests and `npm run check --workspace bb-plugin-touchbar`.
- Build on macOS where AppKit is available; otherwise report that platform limitation.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
