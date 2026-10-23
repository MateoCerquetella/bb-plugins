# Decisions

## D-002: Configure API keys through native protected settings

Status: Accepted

### Evidence

The user requested UI setup for Jev and text-model APIs. Use BB's existing
secret setting fields. BB excludes secret settings from frontend values.

### Options

- A custom credential RPC or frontend store would duplicate BB's secret
  infrastructure and increase exposure risk.
- Requiring only a dotenv file would not satisfy the requested settings UI.

### Chosen approach

Use native secret settings, not custom credential RPCs or frontend storage.
Saved keys override file keys individually. A blank saved key uses the optional
private dotenv file; a configured file remains subject to existing validation.
The text-model identifier remains a non-secret setting. Saving credentials
does not authorize paid calls.

### Trade-offs and risks

The frontend cannot report whether a key exists because secret values are
intentionally absent. Runtime preflight remains the source of truth and returns
only fixed safe diagnostics.

### Verification

Exercise saved-key precedence, blank-key fallback, missing credentials, and
paid authorization in behavioral tests. Inspect the reloaded BB settings page
to confirm both fields render as secrets without exposing their values.

## D-001: Harden the existing Jev execution boundary

Status: Accepted

### Evidence
- Research inspected supported upstream revision
  1231850a0bf1a0c0341fe408ef1668dbbfdfac46 and the existing BB Surf adapter.
- Engine selection and the upstream loop already exist; live verification and
  execution-boundary tests are missing.
- Installed project policy is Playwright with fallback disabled.

### Options
- Removing Playwright is rejected because explicit actions, attachment, and
  fallback still need it.
- Startup caching is deferred because it is an unmeasured optimization with
  invalidation risk.
- Choose focused bridge hardening, test coverage, safe diagnostics and useful
  timing. Keep existing persisted policy and UI.

### Chosen approach

Keep the current upstream adapter and scoped Playwright attachment. Extract
only the process/bridge boundary needed to exercise it directly, validate
results, and document accurate outcomes.

### Trade-offs and risks
- Model DONE is not verified task completion. Report that explicitly.
- A process or protocol error after dispatch may follow a side effect. Do not
  replay or fallback.
- No paid authorization has been given. Use controlled offline runtime tests
  and identify live model evidence as missing, not passed.
- Unrelated Empirical archive changes predate implementation and are excluded.
- Root full-suite execution requires its separate approval when requested by
  the QA gate; focused checks can run during development.

### Verification

Run actual process and bridge tests without live model charges, focused plugin
checks, and installed CLI/browser smoke checks. Report live model and full-suite
limitations explicitly.
