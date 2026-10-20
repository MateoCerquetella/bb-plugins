# Activity Overview Real Data Layout

## Request

> Finish the original Center thread mimic UI request recovered from thread thr_rr4st4gmwp: fix Activity Overview to match the user's reference screenshot, center the native New Thread composer above a compact aligned overview, remove overflow and card-heavy misplaced UI, and use real contribution, PR, review and pattern numbers with no mock data. Preserve native composer and host UI behavior. Inspect the installed Activity Overview and newly merged origin/main implementation first; this checkout predates that merge. Preserve existing uncommitted Empirical closure changes. Update README with accurate behavior and real UI screenshots; test real-data calculations and unavailable/empty/error states, verify desktop/mobile rendered UI and focused checks. Work in the existing BB-managed checkout. User says Finish it; do not publish releases or change credentials.

## Goal

AURA displays authenticated GitHub activity as an optional, compact section
below the centered native New Thread composer. This follows the user's latest
direction in thr_7khqwk8ydq: "dont make an ew plugin. lets change AURA to have
this as optional" and "implement it". The Shipyard source supplied by the user
is a visual reference for restrained operational density, not a dependency or
a source of the user's activity. No new plugin is created.

## Acceptance Criteria

- [ ] [AC-1] Metrics and dated heatmap cells come from authenticated GitHub responses; no generated counts, scaled fixtures, or fabricated attention items ship in production.
- [ ] [AC-2] Period and repository selections apply to real available data; incomplete, unavailable, loading and error states cannot appear as successful zero activity.
- [ ] [AC-3] Streaks and busiest date summaries are calculated deterministically from dated contributions with documented date and streak semantics.
- [ ] [AC-UI-1] [UI] Desktop and mobile present a compact aligned overview below the native composer, with no page-level horizontal overflow, oversized headings, or nested panel cards.
- [ ] [AC-UI-2] [UI] Native composer controls remain functional; repository/period controls, retry and any attention links work and are accessible.
- [ ] [AC-4] README documents actual source, limitations, authentication requirements and verified screenshots; focused tests, build/type checks and browser evidence cover the repaired surface.
- [ ] [AC-UI-3] [UI] Settings → Aura includes a persisted activity-overview switch, disabled by default. Switching it does not alter wallpapers, saved slots or drafts. Disabling it removes the overview while retaining composer centering.
- [ ] [AC-5] AURA owns the implementation and distribution. No new plugin, registration or runtime dependency on the standalone Activity Overview plugin is introduced.

## Scope

The existing AURA plugin, its settings, server-owned GitHub adapter, New Thread
integration, tests, README and repository catalog description. The standalone
Activity Overview baseline is inspected for context only: it contains fixed
counts, generated cells and nonfunctional attention actions, which must not be
copied into AURA. Preserve installed AURA's wallpaper, slot and scope behavior.
Use the already authenticated GitHub CLI on the BB host; credentials remain
inside that process. Keep the existing checkout and unrelated local changes.

The overview uses compact headings, four inline metrics separated by rules,
dated contributions beside a pattern summary, and actual follow-up links only
when available. On mobile, patterns stack below the heatmap; the heatmap may
scroll inside a labeled region but never widens the page. The mockup can use a
captured authenticated aggregate snapshot, clearly dated and labeled as a
snapshot; it must not generate data or pretend to be the installed application.

Use exact inclusive date ranges for 30, 90 and 365 days ending at today, and
document GitHub's contribution-day timezone semantics. PRs opened and merged
use authenticated search counts for created and merged dates respectively;
review contributions use contributionsCollection. These are different event
types and do not have to share totals. Repositories must come from authenticated
responses. Scope selection must requery supported sources, never multiply or
scale totals; unsupported/incomplete repository metrics display Unavailable.
Never label global contribution days as repository-specific days. Reject API
errors and pagination truncation rather than convert them into zeros.

Calculate longest streak within the returned interval. Current streak ends on
today when active, otherwise yesterday; it is bounded by the returned interval.
Show exact busiest date and month from daily counts, with earliest date/month
winning ties. A verified empty response shows zero metrics and an explicit
no-activity message. Missing authentication, loading, partial responses and API
errors show their own messages and omit unproven numbers. Retry is keyboard
accessible and stale responses cannot overwrite newer scope selections.

## Non-goals

No release publication, credential changes, fabricated fallback data, new
composer implementation, new plugin, or broad host patches.
Unavailable GitHub data is reported explicitly, not guessed.

## Risks

GitHub contribution visibility and repository filters may restrict available
metrics. API pagination, rate limits and time boundaries require explicit
handling. Host layout ownership may constrain exact composer placement; do not
move or clone native controls through brittle DOM mutations.

## Verification

Focused unit tests for API parsing, date ranges, streaks, unavailable responses
and real-data filtering. Typecheck/build the plugin; inspect the installed BB
New Thread surface at desktop and mobile widths and capture real screenshots.
Use a fresh-context review and the repository's required verification gates.
Verify the switch survives reload and saved-slot activation. Check native prompt
typing and project/provider controls without submitting a new thread. Test
short windows, desktop and 390px mobile widths, light/dark themes, request races
and the overview's disabled/loading/empty/unavailable/error states. Capture
actual installed UI screenshots under docs/media/aura after implementation;
mockup screenshots are workflow evidence only and are not README screenshots.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
