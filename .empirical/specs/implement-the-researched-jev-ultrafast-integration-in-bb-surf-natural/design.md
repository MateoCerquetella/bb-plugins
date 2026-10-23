# Design

Keep the existing EnginePolicy and RunRequest contracts. Split Python runtime
preflight, the authenticated CDP bridge and output validation from the
Playwright page orchestration only where it enables direct behavioral tests.
Use a small typed Jev outcome (`done | blocked`, nonnegative integer actions,
bounded timing) and report `verification: required`. Do not create a generic
engine framework or merge the separate model-routing plugin.

All browser actions use the existing project binding. Jev calls the upstream
Agent through the current scoped CDP adapter. Playwright continues to attach
and navigate, then Jev owns the action loop. Fallback happens exclusively
before navigation. Post-dispatch failures have an uncertain outcome and never
run another controller.

Preflight diagnostics expose fixed safe messages for missing configuration,
credentials, interpreter and imports. Do not forward Python stderr or dotenv
contents. Always validate per-run authorization and credential permissions.
The bridge validates method and params shapes, authentication, request size,
and bounded request lifetime; resources are released even when execution fails.

Tests execute the production bridge/process path using a temporary controlled
runtime with a local CDP session double. A real Steel page smoke checks the
installed CLI with no paid model calls. Offline simulated models cannot prove
live model accuracy or comparative speed; retain default Playwright.
