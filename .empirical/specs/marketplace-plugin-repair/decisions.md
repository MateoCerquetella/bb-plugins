# Decisions: Marketplace Plugin Repair

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- The live BB 0.41 server with SDK 0.4.46 exposes `bb.sdk.hosts.list`,
  `bb.sdk.system.executionOptions`, and the host-owned controlled
  `experimental_ProviderModelPicker` with explicit host routing.
- Save My Model v0.1.2 persists records but imports only list/clear helpers in
  its UI, matching the marketplace review finding on PR #154.
- BB exposes no supported extension hook for overriding the built-in root
  composer defaults. The existing implementation explicitly names that as a
  non-goal.
- Action Topbar appends its fixed launcher to `document.body` but assigns an
  arbitrary z-index of 120. BB ordinary pane tiers are below host portal/dialog
  tiers, so a bounded intermediate plugin overlay tier is available.

### Options

1. Intercept BB's private composer DOM/localStorage and rewrite its selection.
2. Build a separate provider/model form from copied provider data.
3. Use BB's controlled picker routed to real SDK hosts and persist its coherent
   `onChange` values in the existing plugin store.

For Action Topbar, either raise the current arbitrary number, use the browser
top layer, or align a body-mounted overlay to BB's documented visual tiers.

### Chosen approach

Use option 3. Add a typed backend adapter for real host identity and selection
resolution, then render the host-owned picker in the settings surface. Align
Action Topbar to a shared intermediate plugin overlay tier.

### Trade-offs and risks

This makes Save My Model functional through a supported picker without making
the false claim that it controls BB's built-in composer. Users configure and
review preferences in the plugin surface; native root-composer application
still requires a future public BB hook. Live reconciliation adds one bounded
request on host selection. The intermediate z-index relies on BB's current
semantic layer ordering, so a contract test and live visual check guard it.

### Verification

Exercise two host identities and provider switches in the frontend harness;
inject catalog failures and malformed storage; assert the public-SDK import
boundary; verify launcher/page/dialog relative stacking; run focused plugin and
workspace checks; install/reload in the live BB 0.41/SDK 0.4.46 runtime and capture visible evidence.
