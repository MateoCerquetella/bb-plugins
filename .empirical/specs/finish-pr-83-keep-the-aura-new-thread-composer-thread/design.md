# Design: Finish PR 83

## Existing system

AURA injects one content-script stylesheet into BB's native thread and New
Thread panels. `COMPOSE_CENTER` owns layout rules that apply even when the AURA
background is disabled. AURA registers the activity UI through a host
`homepageSection` slot whose title is `Activity overview`. The slot component
loads authenticated GitHub data through AURA's RPC contract.

## Data shape and ownership

No persisted or RPC data shape changes. BB continues to own the New Thread
composer and homepage slot title. AURA owns only its injected CSS, the activity
slot's content, and its existing `activityOverview` preference.

## Layout

Keep the native composer in its existing DOM position. Use the stable
`root-compose-main-panel` boundary and observed compact-compose test IDs to
center its content horizontally while preserving vertical scrolling. Do not
clone, reparent, or replace host controls. Retain the existing desktop activity
metadata styling in `COMPOSE_LAYOUT`.

## Heading

The host slot title is the single visible and accessible Activity overview
heading. Remove the component's duplicate `h2`. Keep status text, filters,
metrics, calendar region, patterns, retry, and links unchanged.

## Main reconciliation

Merge current `origin/main` into the feature branch. Resolve the lockfile by
retaining both source dependency sets and regenerating `package-lock.json`
through `npm install`, then inspect the semantic dependency result.

## Verification

Behavioral component tests assert the user-visible slot content without an
internal duplicate heading. AURA's focused check and the workspace check cover
types, tests, and build. The installed plugin is reloaded and exercised through
the bound Steel browser at desktop and 390px widths with the overview on and
off. GitHub's PR state and review threads provide the final merge-ready verdict.

## Failure handling

If live DOM inspection disproves a selector, update the smallest selector at
the `COMPOSE_CENTER` boundary and rerun both viewport checks. If current `main`
changes AURA's dependencies or SDK contract, reconcile source first and
regenerate the lockfile once more before verification.
