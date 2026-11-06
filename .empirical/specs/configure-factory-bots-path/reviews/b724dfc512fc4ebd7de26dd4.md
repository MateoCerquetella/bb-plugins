# Verdict: CHANGES_REQUESTED

- PASS AC-1: server.ts defines the factoryCheckoutPath string setting with label, description, and empty default.
- PASS AC-2: config.ts maps the checkout to <path>/dist/main.js while preserving command, remaining args, and env; tests assert preservation.
- FAIL AC-3: Hot replacement works for valid input, but existence-only validation can accept an invalid entry point and dispose the working client (F-1).
- FAIL AC-4: Empty restores the default and relative/missing paths error, but a directory or unreadable file at dist/main.js passes validation and clears the error (F-1).
- PASS AC-5: README documents the Settings location, dist/main.js mapping, immediate switching, preserved FACTORY_URL, and clearing to reset.
- FAIL AC-TEST-1: Tests assert reported status only; no coverage that board/ticket/chat use the replacement client or that the old client is disposed (F-2).
- PASS AC-UI-1: The native setting supplies the labeled field and description; the settings section renders configured/active paths and alerts. Not browser-verified.

## Security / correctness

No new security vulnerability found in scope; running an operator-selected local checkout is the accepted design. Correctness changes requested for entry-point validation.

## Design / maintainability

One runtime bundle with dynamically dereferenced RPC handlers and a version guard is direct and maintainable. Weaknesses: insufficient entry-point validation and tests that prove status rather than runtime behavior.
