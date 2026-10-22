# Design: DeepSeek In Usage Tracker

## Outcome

Usage Tracker lists DeepSeek as an opt-in provider. The plugin server reads the
DeepSeek account balance with a server-held API key, and the sidebar renders the
balance or the share of a configured topped-up amount already used.

## Data flow

1. Settings expose `enableDeepSeek` (default off), `deepSeekApiKey` (secret),
   and `deepSeekBudget` (free text).
2. `getUsage` resolves the key from the secret setting or `DEEPSEEK_API_KEY`.
3. `loadDeepSeekProvider` calls `https://api.deepseek.com/user/balance` with a
   bounded timeout and maps the documented payload into a `ProviderUsage` with
   `id: "deepSeek"` and optional `balance` metadata.
4. The RPC response never includes the key. The browser receives only balance
   amounts, currency, status, and messages.
5. The sidebar excludes balance providers from the agent-usage cumulative
   summary and renders the balance row when no usage window exists.

## Provider model

`ProviderUsage` gains optional `ProviderBalance` metadata:
`currency`, `total`, `granted`, `toppedUp`, `available`, `budget`, and
`usedPercent`. DeepSeek still uses the existing `windows` array when a
percentage can be computed, so progress and warning thresholds reuse the
existing rendering.

## Failure states

- No key or HTTP 401/403 → `unauthenticated` with a recovery message.
- Network failure or other HTTP status → `error`.
- Malformed balance payload → `error`.
- Previous healthy values are preserved through temporary failures using the
  existing last-known merge path; a healthy balance with no budget clears the
  window instead of resurrecting an old percentage.

## Boundaries

- BB's `system.usageLimits` is unchanged; DeepSeek is merged into the provider
  list only when enabled.
- The key remains server-side and is never logged or returned.
- DeepSeek does not participate in Account Pooler routing or the agent summary.

## Verification

- `env -u BB_CLI npm run check` in `plugins/usage-tracker`.
- Workspace `npm run check`.
- Browser review after installing the checkout.
