import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract } from "./host-contract.ts";
import { withTimeout } from "./pooled-usage.ts";
import { cachedReader } from "./reset-reader.ts";
import { withReadOnlyResetCredits, type ResetReading, type UsageSnapshot } from "./usage.ts";

const HOST_CALL_TIMEOUT_MS = 15_000;
const CODEX_RESET_CACHE_MS = 60_000;

/** Codex reset counts for logins the server cannot spend from, read on every connected machine. */
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

  return {
    /** Adds the read-only counts to rows that have none yet. */
    async apply(snapshot: UsageSnapshot): Promise<UsageSnapshot> {
      const codex = await Promise.all(
        (await connectedHosts()).map((host) =>
          withTimeout(readCodexOn(host.id), HOST_CALL_TIMEOUT_MS).catch(() => null),
        ),
      );
      return withReadOnlyResetCredits(
        snapshot,
        "codex",
        codex.filter((reading): reading is ResetReading => reading !== null),
      );
    },
  };
}
