# Socratic discovery: Create a new independently installable BB plugin that mimics the lower "Overview" activity dashboard in the supplied screenshot: period and repository filters, headline contribution metrics with comparisons, a year-style activity heatmap, streak/activity summaries, and a "Needs your attention" area. The exact BB events/data sources and intended scope are not yet defined.

- Status: draft
- Created: 2026-10-12T03:14:01.128Z
- Updated: 2026-10-12T15:15:24.120Z

## Pass 1: Problem and user

**Question:** Who is this for, what problem do they experience today, and why does solving “Create a new independently installable BB plugin that mimics the lower "Overview" activity dashboard in the supplied screenshot: period and repository filters, headline contribution metrics with comparisons, a year-style activity heatmap, streak/activity summaries, and a "Needs your attention" area. The exact BB events/data sources and intended scope are not yet defined.” matter?

> For the repository owner and other BB users who want the GitHub-style coding activity overview shown in the supplied screenshot inside BB. Today BB has no consolidated view of contributions, pull requests, reviews, streaks, or items needing attention across repositories, so users must leave BB and piece this together elsewhere.

## Pass 2: Observable outcome

**Question:** Describe the smallest end-to-end behavior a user must be able to observe when this succeeds.

> After installing the new plugin, the user can open a BB navigation page that visually follows the screenshot's lower Overview section. It loads real GitHub activity for the authenticated user, supports a period selector and all-or-one repository filtering, shows contributions, PRs opened, PRs merged, and reviews with prior-period comparisons, renders a 12-month contribution heatmap, calculates current/longest streak and most-active month/day, and lists actionable review or PR items. Loading, empty, unauthenticated, and partial-error states are visible and useful.

## Pass 3: Boundaries

**Question:** What data, compatibility, migration, rollback, and preservation boundaries apply, and what is explicitly out of scope?

> Create a new independent plugin under plugins/ with its own manifest, app, server, tests, assets, README, and exact workspace SDK version. Use the user's existing GitHub CLI authentication read-only; never store or expose tokens and never mutate GitHub. Preserve every existing plugin and unrelated dirty change. Register the plugin in .bb/plugins.json and the root README. Target BB 0.40. Mimic only the screenshot's lower Overview dashboard, not the hero art, prompt composer, mobile browser chrome, or unrelated Claude product behavior. Uninstalling the plugin cleanly removes the page; no migration is needed.
