# Update The Usage Tracker Plugin So Deepseek Is No Longer

## Request

> Update the Usage Tracker plugin so DeepSeek is no longer missing: show DeepSeek usage in the sidebar strip with an independent enable setting, brand mark, tests, and docs, matching the existing provider pattern.

## Goal

Usage Tracker offers DeepSeek beside its other providers. When enabled and
given a DeepSeek API key, it reads the account balance server-side and shows
either the raw balance or the share of a user-set topped-up amount already
used.

## Acceptance Criteria

- [ ] [AC-1] Usage Tracker declares `deepSeek` in its provider and sidebar provider sets, with an `enableDeepSeek` setting that defaults off and an independent preference key.
- [ ] [AC-2] With `enableDeepSeek` on, the server reads `https://api.deepseek.com/user/balance` using the secret `deepSeekApiKey` setting or `DEEPSEEK_API_KEY`, and never returns the key to the browser.
- [ ] [AC-3] The DeepSeek provider reports the total, granted, and topped-up balance. A configured topped-up amount yields a 0–100% used reading that reaches 100% at a zero balance; an empty amount yields the balance only.
- [ ] [AC-4] Missing, rejected, failed, and malformed API responses produce unauthenticated or error provider states with recovery messages instead of rejecting the usage request.
- [ ] [AC-5] DeepSeek uses its own brand mark and colour, and its balance row is excluded from the agent-usage cumulative summary.
- [ ] [AC-UI-1] [UI] Enabling DeepSeek adds its mark, balance reading, and detail row to the sidebar strip without disturbing the existing provider layout.
- [ ] [AC-6] Focused Usage Tracker checks pass: typecheck, 102 or more behavioral tests, and plugin build.
- [ ] [AC-7] README, CHANGELOG, package metadata, and third-party notices describe the opt-in DeepSeek provider and its data flow.

## Scope

`plugins/usage-tracker`: provider model, preferences, server RPC, sidebar strip,
provider marks, styling, tests, and package documentation. The root README
catalog entry for Usage Tracker.

## Non-goals

- Reading DeepSeek subscription limits through BB's `system.usageLimits`; BB
  does not report DeepSeek agent usage.
- Automatic budget inference or historical spending analytics.
- Any other plugin, provider, or release process.

## Verification

- `cd plugins/usage-tracker && env -u BB_CLI npm run check`
- `npm run check` from the workspace root
- Browser review of the sidebar with DeepSeek enabled when the plugin is
  installed from this checkout.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
