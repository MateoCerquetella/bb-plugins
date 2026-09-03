# Fix Touch Bar Auto Reconnect After Prolonged Uptime Or Transient

## Request

> Fix Touch Bar auto-reconnect: after prolonged uptime or transient BB CLI/server failures, the native companion must retry automatically with bounded backoff, recover connected state and refresh cards when BB is healthy again, and avoid permanently showing Reconnecting while commands work. First commit all currently present worktree files. Then implement and test retry/recovery behavior, rebuild/install on the enrolled Intel Mac, and record logs and verification.

## Goal

Describe the observable result.

## Acceptance Criteria

<!-- Replace this comment with observable criteria such as:
- [ ] [AC-1] The user can complete the intended action.
- [ ] [AC-UI-1] [UI] The result is visible in the browser.
-->

## Scope

## Non-goals

## Verification

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
