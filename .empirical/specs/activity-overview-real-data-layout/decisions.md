# Decisions: Activity Overview Real Data Layout

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The user approved compact.html and requested existing AURA ownership. BB's SDK
homepageSection is placed below the native composer in both regular and compact
compose layouts. Installed AURA has fps/quality settings absent from this older
checkout. Pinned bb-app 0.40.0 ships SDK 0.4.21. Authenticated gh GraphQL requests
work on the host and return actual dated activity.

### Options

1. Keep a separate Activity Overview plugin: duplicates installation/UI and
   contradicts the user's direction.
2. Own the settings/adapter/component in AURA and use the native homepage slot.
3. Inject/reparent the composer and overview through a custom DOM renderer:
   introduces unnecessary host control and lifecycle fragility.

### Chosen approach

Option 2, with narrowly scoped CSS for AURA's slot wrapper and native compose
flow. Preserve installed renderer settings; extend settings without new tables.
Use the host's authenticated gh CLI, with bounded typed requests and no secrets
in browser/RPC data. Explicitly mark repository calendars unavailable because
GitHub does not expose that scope for its global contribution calendar.

### Trade-offs and risks

The host owns slot positioning but adds a heading even for hidden components:
scope wrapper suppression by the AURA marker. Compact mobile compose currently
uses an absolute footer, requiring scoped CSS flow adjustments and installed
browser checks. Repository discovery is limited to returned contribution
repositories; completeness notes explain the bound. API failure is never zero.

### Verification

Adapter/date/pattern tests, settings persistence and slot preservation tests,
workspace checks, fresh-context review and actual BB browser evidence for both
desktop and mobile. README documents real limits and includes actual UI captures.
