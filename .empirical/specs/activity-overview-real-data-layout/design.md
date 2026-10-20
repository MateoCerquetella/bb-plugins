# Design

## Ownership and native integration

Keep the feature inside AURA. Register one SDK homepageSection with an AURA
component; the host already places that slot below its native New Thread
composer. The component returns a hidden AURA marker when the default-off
preference is false. Scope CSS to that marker's host section to remove its empty
wrapper and duplicate host heading. Do not reparent or clone native controls.
Extend AURA's scoped compose CSS to keep both the regular desktop layout and
the host's compact mobile layout in a centered, vertically scrollable flow.
Composer layout applies independently of whether wallpaper/overview is enabled.
Disable the already installed standalone overview when installing this AURA
replacement so it does not duplicate the newly approved surface.

## Settings and installed baseline

Add activityOverview:boolean with a false schema default. Persist with existing
settings, but preserve it as a global preference across slot activation/reset,
alongside enabled/newThreadOnly/dimmerEnabled. Provide a separate immediate
setActivityOverview RPC/UI switch so toggling never overwrites an unsaved image
or wallpaper draft. Add bb aura overview on|off for CLI verification.
Carry forward installed AURA's fps/quality model, renderer, UI and tests from
commit d205cb7534b8d5a210b78c32dd2487d5722f391b. Keep the SDK at 0.4.21, the exact
version shipped by pinned bb-app 0.40.0; do not copy newer SDK metadata.

## Data contract and GitHub adapter

Use a server-only adapter that invokes the already authenticated gh CLI through
execFile argv (no shell), with request timeout and maxBuffer. Fixed api.github.com
GraphQL endpoint; no arbitrary host, query or credentials from the UI. Zod
validates query input and all response data. Sanitized errors only reach clients.
Cache successes for five minutes with bounded keys and coalesce identical
requests; do not cache authentication failures or represent a stale response as
fresh. The overview never requests activity until explicitly enabled.

Date ranges cover 30/90/365 inclusive UTC dates, from midnight on the first day
to the current instant. Viewer login feeds explicit authored PR search queries
for created/merged dates. Global contributionsCollection supplies daily
calendar counts and review contribution counts. Repository options are the
actual returned contribution repositories, capped at GitHub's 100 repositories
per category; describe that limit rather than claiming all repositories.

Repository selection scopes authored PR searches. GitHub does not provide a
repository filter for its contribution calendar: repository contributions,
calendar and derived patterns are explicitly unavailable; never relabel global
days as repository days. Repository review counts use returned per-repository
contribution connections; absent repository counts are unavailable when the
category hits its cap, otherwise a complete absence means zero. API errors,
null viewer, malformed/duplicate/missing days and search-limit metadata are
explicit partial/error states, not successful zero activity. No invented
attention items: link only to real authored-PR and review-request searches.

## Client and presentation

Read settings with useRpc/useRealtime. Fetch activity only when the preference
is true; use request generations to ignore old scope responses and dispose
cleanly. Loading or failed scope changes clear unproven metrics. Retry is a
native button; period/repository selects have labels. Display timestamp/source
and completeness notes. The compact rule-separated metric/calendar/pattern
layout inherits BB semantic tokens. The calendar is a labeled keyboard-scroll
region and dated cell tooltips report actual counts. Zero activity gets explicit
copy; no results are substituted for failed requests.

## Verification

Adapter tests validate exact ranges, error handling, scoped queries, bounded
repository discovery, count parsing and caching. Pattern tests cover ties,
date gaps, end-date streaks and empty periods. Settings tests cover legacy
defaults, slots/reset and atomic switch behavior. Browser checks exercise the
installed host at desktop/mobile widths, native drafts and controls, persisted
switch, true scope changes and source failures; save actual screenshots.
