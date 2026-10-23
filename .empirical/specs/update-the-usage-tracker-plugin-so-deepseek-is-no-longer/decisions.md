# Decisions: Update The Usage Tracker Plugin So Deepseek Is No Longer

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- `plugins/usage-tracker` previously listed six providers and had no DeepSeek
  entry, so no DeepSeek reading could reach the strip.
- BB's `system.usageLimits` exposes provider agent usage but not a DeepSeek
  quota; the touchbar plugin already records that limitation.
- The repository already contained a reviewed feature branch,
  `add-deepseek-api-usage-tracker-to-bb-plugins-thr_uv5sq55yj4`, with an opt-in
  DeepSeek balance implementation and 492 lines of focused tests.
- The existing branch shares the current branch's merge base for
  `plugins/usage-tracker`; the plugin tree had not changed since that base.

### Options

1. Reimplement DeepSeek from scratch in this branch.
2. Merge the existing DeepSeek feature branch and correct stale documentation.
3. Add only a placeholder icon with an unavailable state, as the touchbar does.

### Chosen approach

Option 2. Merge the existing implementation, then align README and CHANGELOG
with the final topped-up-amount behavior instead of the removed automatic
baseline.

### Trade-offs and risks

- The feature requires a DeepSeek API key and network access; without either,
  the provider reports an actionable error like any other unavailable provider.
- The merge brings DeepSeek balance semantics into a plugin previously focused
  on subscription windows. The code keeps balance providers out of the agent
  usage summary and renders a dedicated balance row.
- Tests and the plugin build are the strongest local evidence. Browser
  verification still depends on installing this checkout into BB.

### Verification

- Run `env -u BB_CLI npm run check` in `plugins/usage-tracker`.
- Run `npm run check` from the workspace root.
- Inspect the sidebar with DeepSeek enabled when this checkout is installed.
