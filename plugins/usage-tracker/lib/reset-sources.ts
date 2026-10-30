import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { readClaudeResetCredits } from "./claude-reset-credits.ts";
import { hostContract } from "./host-contract.ts";
import { withTimeout } from "./pooled-usage.ts";
import { cachedReader } from "./reset-reader.ts";
import { withReadOnlyResetCredits, type ResetReading, type UsageSnapshot } from "./usage.ts";

const HOST_CALL_TIMEOUT_MS = 15_000;
const CODEX_RESET_CACHE_MS = 60_000;
// Claude rate-limits its usage endpoint for minutes at a time, so a miss is retried slowly.
const CLAUDE_RESET_CACHE_MS = 10 * 60_000;
const CLAUDE_RESET_RETRY_MS = 2 * 60_000;

/** Reset counts for logins the server cannot spend from: Codex on every machine, Claude on this one. */
export function createResetSources(bb: Pick<BbPluginApi, "hosts" | "sdk">) {
  const hostClient = bb.hosts.experimental_client({ contract: hostContract });
  const codexReaders = new Map<string, () => Promise<ResetReading | null>>();

  const connectedHosts = async (): Promise<Array<{ id: string; name: string }>> =>
    (await bb.sdk.hosts.list().catch(() => [])).filter((host) => host.status === "connected");

  const readCodexOn = (hostId: string): Promise<ResetReading | null> => {
    let reader = codexReaders.get(hostId);
    if (reader === undefined) {
      reader = cachedReader(async () => {
        const result = await hostClient.call("readCodexResets", null, {
          hostId,
          signal: AbortSignal.timeout(HOST_CALL_TIMEOUT_MS),
        });
        // A count without an account email cannot be matched to a row.
        return result.availableCount === null || result.accountEmail === null
          ? null
          : { email: result.accountEmail, availableCount: result.availableCount };
      }, CODEX_RESET_CACHE_MS);
      codexReaders.set(hostId, reader);
    }
    return reader();
  };

  // The login stored on the server machine; other Claude logins are not readable from here.
  const readClaude = cachedReader(
    async () => {
      const count = await readClaudeResetCredits();
      return count === null ? null : { email: null, availableCount: count };
    },
    CLAUDE_RESET_CACHE_MS,
    Date.now,
    CLAUDE_RESET_RETRY_MS,
  );

  return {
    /** Adds the read-only counts to rows that have none yet. */
    async apply(snapshot: UsageSnapshot): Promise<UsageSnapshot> {
      const [codex, claude] = await Promise.all([
        connectedHosts().then((hosts) =>
          Promise.all(
            hosts.map((host) =>
              withTimeout(readCodexOn(host.id), HOST_CALL_TIMEOUT_MS).catch(() => null),
            ),
          ),
        ),
        readClaude().catch(() => null),
      ]);
      return withReadOnlyResetCredits(
        withReadOnlyResetCredits(
          snapshot,
          "codex",
          codex.filter((reading): reading is ResetReading => reading !== null),
        ),
        "claudeCode",
        claude === null ? [] : [claude],
      );
    },
  };
}
