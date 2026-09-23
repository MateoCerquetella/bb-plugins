# Review and Deliver Pull Request 48

## Request

> Review GitHub pull request #48, fix blocking findings and failing CI, update usage-tracker version/changelog, verify, comment, and merge without publishing.

## Goal

Land the Claude Code Keychain-service override as a reviewed Usage Tracker
release change without weakening credential isolation, misreporting remote-host
usage, or leaving repository release metadata inconsistent.

## Acceptance Criteria

- [ ] [AC-1] Leaving **Claude Keychain service** empty preserves BB's existing
  Claude Code usage response and performs no Keychain or direct Anthropic
  request.
- [ ] [AC-2] On macOS, an explicitly configured
  `Claude Code-credentials` or `Claude Code-credentials-<eight lowercase hex>`
  service can replace the primary machine's Claude Code provider data using the
  matching Keychain OAuth token and Anthropic's fixed usage endpoint.
- [ ] [AC-3] The override rejects every unrelated or malformed service before
  reading Keychain data, passes the service as a single `security` argument,
  sends the token only as the authorization header to the fixed Anthropic
  origin, and never persists or returns the token.
- [ ] [AC-4] The override reports bounded, user-safe status messages for
  unsupported platforms, missing/malformed/expired credentials, throttling,
  malformed responses, and transport failures without exposing raw exception
  text, command output, or secrets.
- [ ] [AC-5] A thread resolved to a remote host continues to use that host's BB
  usage response; the server-local Keychain override is not substituted for a
  remote machine.
- [ ] [AC-6] Existing provider normalization, settings defaults, and Usage
  Tracker behavior remain compatible, with focused regression tests covering
  service validation, credential parsing, request construction, response
  normalization, failure isolation, and local-versus-remote override behavior.
- [ ] [AC-7] Usage Tracker advances from `0.1.9` to `0.1.10`; its changelog,
  lockfile, and cross-plugin distribution assertions agree on that version, and
  no npm publication or Git release/tag is created.
- [ ] [AC-8] The PR head is based on current `main`, passes the repository's
  required CI, receives a review/comment summarizing the findings and fixes,
  and is merged without bypassing a failing check.

## Scope

- Review and amend PR #48's Usage Tracker source, settings, documentation, and
  tests.
- Reconcile the Usage Tracker patch version wherever the repository enforces
  it.
- Update the contributor branch, allow required GitHub checks to run, leave a
  concise review summary, and merge the approved head.

## Non-goals

- Publishing Usage Tracker to npm.
- Creating or moving a Git tag or GitHub Release.
- Changing BB core's own Claude Code credential lookup.
- Adding non-macOS credential-store support.
- Reading account metadata outside the configured Keychain item.

## Verification

- Run Usage Tracker type checks, tests, and plugin build.
- Run the distribution test that asserts Usage Tracker's manifest and release
  documentation.
- Run the repository verification selected by Empirical and require GitHub CI
  to pass on the exact pushed head before merge.
- Perform an independent fresh-context review of the final diff, including the
  Keychain and OAuth trust boundaries.

## Capability Deltas

- `deltas/usage-tracker-provider-usage.md`
- `deltas/usage-tracker-distribution.md`
