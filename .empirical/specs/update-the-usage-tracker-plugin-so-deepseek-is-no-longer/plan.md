# Plan: DeepSeek In Usage Tracker

1. Extend provider metadata with `deepSeek` in `PROVIDER_IDS`,
   `SIDEBAR_PROVIDER_IDS`, provider preferences, and the DeepSeek brand mark.
2. Add `lib/deepseek-balance.ts` to parse the documented balance payload,
   resolve the key, compute the topped-up percentage, and load a provider
   record without throwing.
3. Merge the DeepSeek record into `getUsage` when `enableDeepSeek` is on,
   passing the secret setting or `DEEPSEEK_API_KEY` and the optional topped-up
   amount.
4. Render balance metadata in the sidebar strip and details, keep DeepSeek out
   of the agent-usage summary, and preserve last-known values through failures.
5. Update settings, RPC schemas, README, CHANGELOG, package metadata, and
   third-party notices.
6. Run focused and workspace checks, then review the UI when installed.

## Affected tests

- `plugins/usage-tracker/test/deepseek.test.ts`
- `plugins/usage-tracker/test/usage.test.ts`
- `plugins/usage-tracker/test/antigravity.test.ts`
- `plugins/usage-tracker/test/presentation-contract.test.ts`
- `plugins/usage-tracker/test/pool-routing.test.ts`
- `plugins/usage-tracker/test/pooled-usage.test.ts`
