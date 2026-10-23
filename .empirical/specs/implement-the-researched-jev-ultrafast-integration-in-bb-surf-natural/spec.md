# Implement The Researched Jev Ultrafast Integration In Bb Surf Natural

## Request

> Implement the researched Jev Ultrafast integration in BB Surf. Natural-language browser tasks must be able to execute through the upstream Jev indexed-action loop against the project's existing Steel browser, while Playwright remains available for deterministic navigation, explicit inspect/click/fill/press actions, and safe preflight-only fallback. Preserve project isolation, human-control handoff, explicit per-run paid-call authorization, no replay after uncertain mutation, and independent outcome verification. First identify what is missing or incomplete in the existing adapter, capture a Playwright-versus-Jev behavioral and latency baseline on representative supported local tasks without paid calls unless separately authorized, make the smallest complete code change, add behavior-level tests, update accurate docs, run focused and root verification, install/reload the local plugin, and verify the real BB Surf CLI/browser surface. Do not remove Playwright or change the default engine without evidence that Jev wins on both completion and latency.

## Goal

Users can select Jev for a natural-language BB Surf task against their existing
Steel page, retain Playwright for deterministic operations, and see honest
execution and verification results. Prove the existing bridge and repair its
missing boundaries before claiming a speed improvement.

## Acceptance Criteria

- [ ] [AC-1] Project-scoped Playwright, Jev and Auto selection remains isolated;
  URL-only navigation and explicit actions retain Playwright behavior.
- [ ] [AC-2] Authorized Jev execution uses the supported upstream loop on the
  existing project page, returns validated terminal status/action count and
  useful timing, and explicitly reports that outcome verification is required.
- [ ] [AC-3] Missing paid authorization, invalid credentials/path/runtime and
  cancellation stop before dispatch or select only an opted-in preflight
  fallback. Safe diagnostics identify the setup issue without leaking secrets.
  Jev and text-model API keys can be saved through native BB secret settings;
  saved keys override optional private dotenv keys individually. Both saved
  keys permit operation without a dotenv file; incomplete credentials fail closed.
- [ ] [AC-4] No execution failure triggers fallback or replay. Bridge access
  stays authenticated, loopback-only, bounded, and limited to supported CDP
  methods; malformed runtime results cannot be reported as success.
- [ ] [AC-5] Behavior tests exercise the actual bridge and process protocol
  with controlled model/runtime boundaries, including success, failures and
  cleanup. Offline evidence is not described as live model verification.
- [ ] [AC-6] Docs and CLI guidance explain engine choice, paid-call opt-in,
  limitations, verification, and timing boundaries. Focused checks and local
  install/reload plus real Surf CLI/browser checks are recorded.
  Native settings expose two secret key inputs and the text-model identifier.
  Frontend setting values never include the saved keys.

## Scope

BB Surf engine adapter, its behavioral tests, CLI integration if required,
package inclusion for extracted runtime files, and corresponding documentation.

## Non-goals

Removing Playwright; merging the unrelated Jev model-routing plugin; changing
the default without live comparative evidence; custom credential storage; paid calls without
separate authorization; altering existing profiles; unrelated state changes.

## Verification

Use a controlled Jev process and local HTTP/CDP boundaries for offline protocol
checks. Run focused plugin checks and request approval for the root full suite
when required. Install/reload the owning plugin and exercise its CLI using the
existing project Steel session. Live comparative performance remains explicitly
unverified until paid model calls are authorized. Avoid optimizing startup
before measuring it; no cache may bypass per-run credential or runtime checks.

## Capability Deltas

See `deltas/steel-browser-viewer.md`.
