# Plan

1. Add safe viewer URL and message helpers, shared live viewer and clipboard UI.
2. Integrate across thread/page surfaces; release inactive streams; keep expand
   in place and coalesce dashboard requests.
3. Add project-scoped account records and allowlisted login navigation, with
   explicit confirmation and accurate status wording.
4. Update page layout, documentation, packaging and focused tests.
5. Run typecheck/tests/build, browser desktop/mobile checks with dummy clipboard
   text, independent review and root checks; repair findings.
6. Install/reload the plugin, smoke-test, commit and push the branch.

## Mockup
Compact identity/project controls above one full-width live viewer. Copy,
Paste, Expand, Reload controls sit on its toolbar. Saved sign-ins are flat rows
with service icon, status, account label, confirmation time, Sign in, Confirm
and Forget controls. Sessions use the existing compact table.

## Boundaries
No password storage, automatic login, browser profile replacement, paid calls
or public CDP exposure. No durable source claim for the host-only launcher fix.
