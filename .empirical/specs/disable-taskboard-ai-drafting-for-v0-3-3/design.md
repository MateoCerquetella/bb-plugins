# Design: Disable Taskboard AI Drafting for v0.3.3

## Manual composer capture

Keep the existing composer action and create dialog, but make
`composer-assisted` mean prompt-assisted only. Remove `draftRequestId` and
`onRegenerate` from the dialog contract. When the modal opens in that mode,
initialize title with the existing deterministic `titleFromPrompt()` helper and
description with the trimmed original prompt. Render the ordinary editable
fields immediately with a neutral “Using the original prompt” explanation.

Remove draft polling, loading/model states, errors, retry actions, cancellation,
and model icons. The form's submission gate depends only on provider metadata,
required fields, and the existing outcome-uncertain protection. External issue
creation remains the same separate form submission and confirmation boundary.
The neutral provenance copy says the prompt was copied into editable fields and
nothing is created until Create is selected; it never implies generation.

Initialize prompt-derived fields once per modal opening. Provider loading,
metadata refresh, validation, confirmed failure, and outcome-uncertain states
must preserve subsequent edits. Provider pending/unavailable status stays
separate from the fields. Ready enables the explicit Create issue action;
Creating prevents duplicates; confirmed success retains the existing close and
notification behavior. A blank composer never opens this flow because the
existing action remains disabled without a non-empty prompt.

## Remove the execution surface

Delete `issue-draft.ts` and its dedicated model/Plan tests. Remove draft record
schemas/types and `startIssueDraft`, `getIssueDraft`, and `cancelIssueDraft` from
the RPC contract. Remove all server helper maps, KV prefixes, worker spawn,
reconciliation, subscriptions, thread events, cleanup, and model-output parsing.
Add static distribution/UI assertions that Taskboard contains no
`threads.spawn`, drafting RPC, native Plan, or model-usage path.

This is deletion rather than a feature flag: no dormant full-trust path remains
available to configuration or future UI drift. Reintroducing repository-aware
generation requires a new reviewed BB restricted-worker API and feature.

## User-facing and marketplace copy

Rewrite the Taskboard README composer section to describe deterministic original
prompt capture and editable fields. Remove AI/model/repository-reading/Plan
language. Update marketplace Taskboard description and tags/copy similarly while
keeping the `^0.3.3` Git source, install value, providers, and external issue
confirmation facts.

## Retained release fixes

Preserve the type-only RPC contract constraint, exact dev-only SDK, recursive
frontend import audit, `0.3.3` manifest/lock/docs, released `Ticket` icon, and
GitHub CLI fixed-candidate/environment tests.

Harden `scripts/verify-taskboard-release-candidate.mjs`: default invocation
rejects product working-tree changes, records HEAD commit/tree, clones and
compares that exact identity, then runs the production-only install/build. An
explicit `--allow-working-tree` flag retains non-authoritative pre-commit
iteration. Root `bun run ci` is the exact promotion command and delegates to the
committed-only verifier.

## Validation and release gate

Run static no-AI searches, focused UI/distribution/GitHub tests, the complete
Taskboard suite, typecheck, SDK check, build/metadata, root checks, browser
exercise, and committed-only consumer verification. Validate the marketplace's
exact three-file result and report public source liveness as deferred until the
new tag is separately approved.

No branch push, tag, GitHub Release, source PR, marketplace force-with-lease
update, or PR comment occurs before a fresh exact approval packet.
