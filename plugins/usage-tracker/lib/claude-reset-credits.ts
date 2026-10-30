import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { parseClaudeCredentials } from "./claude-keychain-usage.ts";

// at_wall adds the weekly session-limit reset, cedar_ember the granted resets (Claude Code's /limit-reset).
const CLAUDE_RESETS_URL =
  "https://api.anthropic.com/api/oauth/usage?at_wall=1&cedar_ember=1&skip_spend=1";
const FETCH_TIMEOUT_MS = 10_000;
// The server returns grants only to the Claude Code CLI surface (any other client gets "ineligible: surface").
// shortcut: version is pinned; bump it if the server starts refusing old CLI versions ("ineligible: cli_version").
const CLAUDE_CLI_USER_AGENT = "claude-cli/2.1.304 (external, cli)";

const resetsResponseSchema = z
  .object({
    juniper_tide: z.object({ available: z.boolean().nullish() }).passthrough().nullish(),
    cedar_ember: z
      .object({
        grants: z
          .array(z.object({ resets_left: z.number().int().min(0).catch(0) }).passthrough())
          .nullish()
          .catch([]),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

/** Resets left on the account: the weekly session reset plus every granted reset. Null when none. */
export function claudeResetCount(body: unknown): number | null {
  const parsed = resetsResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const grants = parsed.data.cedar_ember?.grants ?? [];
  const count =
    (parsed.data.juniper_tide?.available === true ? 1 : 0) +
    grants.reduce((sum, grant) => sum + grant.resets_left, 0);
  return count > 0 ? count : null;
}

/**
 * Reads resets for the Claude login stored on this machine. The token is never
 * refreshed here, so an expired one reads as unavailable until Claude Code renews it.
 * shortcut: credentials file only (Linux/Windows), not the macOS Keychain; add it when the server runs on a Mac.
 */
export async function readClaudeResetCredits(
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<number | null> {
  const dir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude");
  const raw = await readFile(path.join(dir, ".credentials.json"), "utf8").catch(() => null);
  const credentials = raw === null ? null : parseClaudeCredentials(raw);
  if (credentials === null || (credentials.expiresAt != null && now >= credentials.expiresAt)) {
    return null;
  }
  const response = await fetchImpl(CLAUDE_RESETS_URL, {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: "application/json",
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": CLAUDE_CLI_USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "error",
  });
  return response.ok ? claudeResetCount(await response.json()) : null;
}
