# Decisions: Fix The Action Topbar Plugin Regression Where The Action Menu

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- The installed package reports version 0.45.0 and commit
  `129f621771a3e275773992db648316966ac207cf`.
- The preserved 0.44 repair changes host split-drag, Action-pane, plugin
  frontend, navigation, terminal lifecycle, and SDK contracts; it is not safe
  to copy compiled assets or assume unchanged routes.
- The user explicitly authorized porting and installing the verified frontend.

### Options

- Mechanically apply the old patch and install immediately.
- Port against a clean exact 0.45.0 checkout, test and package in isolation,
  then back up and replace installed assets.

### Chosen approach

Port the host integration against the exact 0.45.0 source, keep the plugin
contract bounded, run focused checks, and install only after a successful
isolated build with a reversible backup.

### Trade-offs and risks

This costs a full BB source checkout/build and may expose conflicts requiring
manual reconciliation. The exact-tag baseline, focused tests, manifest/hash
record, and timestamped backup limit compatibility and rollback risk.

### Verification

Focused host/SDK tests, plugin checks, isolated production build, and live
Steel-browser drag verification with screenshot and cancellation cleanup.
