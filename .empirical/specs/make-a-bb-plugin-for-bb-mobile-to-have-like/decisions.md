# Decisions: Make A Bb Plugin For Bb Mobile To Have Like

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

Existing Action Topbar and Conversation Space use app content scripts and
composer portals. The approved mockup places the control strip above the
composer. The user requested autonomous implementation.

### Options

1. App content script with a composer portal.
2. Server-owned replacement sidebar.
3. Native BB patch to add controls.

### Chosen approach

Use the native bare composer banner, live sidebar hook and native navigation.
SDK inspection during implementation confirmed all three are available in
BB 0.45.0 / SDK 0.6.15. This replaces the initial content-script portal design
without changing the approved visible layout.

### Trade-offs and risks

This depends on the experimental sidebar projection API, documented with a
minimum BB version. The host owns subscriptions and mounting. A keyed child
clears gesture/navigation state across thread changes. A sidebar replacement
would increase scope and risk.

### Verification

Typecheck/build, pure helper tests, local install/reload, and mobile/desktop
Steel checks for arrows, swipe thresholds, boundaries and draft preservation.
## Accepted Decisions

- **2026-10-12 — Live host status:** Reuse the sidebar indicator label instead
  of inferring completion. Missing unknown labels fail to "Status unavailable";
  the known none indicator displays Idle. Keep Thread Glide branding.

- **2026-10-12 — Use an app content script:** Existing Action Topbar and
  Conversation Space code show content scripts and composer portals are the
  supported way to extend the current thread UI.
- **2026-10-12 — Strip, not full-screen cards:** The approved mockup keeps
  navigation close to the composer and leaves message content available for
  reading.
- **2026-10-12 — Safe horizontal gesture:** Navigation requires an intentional
  horizontal swipe on the title region; vertical movement and short gestures
  are ignored to preserve scrolling and native back gestures.
- **2026-10-12 — No persistence:** The host remains authoritative for active
  thread, drafts and archive state; the plugin only derives a temporary list.
