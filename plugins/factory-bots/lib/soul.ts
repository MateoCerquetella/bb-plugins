import {
  BOT_ORDER,
  type AuditEntry,
  type BotName,
  type SoulRecord,
} from "./soul-contract.js";

export type DiffKind = "same" | "add" | "remove";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  beforeLine: number | null;
  afterLine: number | null;
}

export function isBotName(value: string): value is BotName {
  return (BOT_ORDER as readonly string[]).includes(value);
}

/** Keep only the known bots and put them in the Factory's fixed order. */
export function orderedSouls(souls: readonly SoulRecord[]): SoulRecord[] {
  const byBot = new Map(souls.map((entry) => [entry.bot, entry]));
  return BOT_ORDER.flatMap((bot) => {
    const entry = byBot.get(bot);
    return entry === undefined ? [] : [entry];
  });
}

export function missingBots(souls: readonly SoulRecord[]): BotName[] {
  const present = new Set(souls.map((entry) => entry.bot));
  return BOT_ORDER.filter((bot) => !present.has(bot));
}

/** The first non-empty line that is not a Markdown heading. */
export function soulSummary(soul: string): string {
  for (const raw of soul.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const summary = line
      .replace(/^>\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/[*_`]/g, "")
      .trim();
    if (summary !== "") {
      return summary.length > 160 ? `${summary.slice(0, 157)}…` : summary;
    }
  }
  return "No prose summary";
}

export function characterDelta(before: string, after: string): number {
  return after.length - before.length;
}

/**
 * A small LCS line diff. Souls are prose-sized, so the clearer matrix is
 * preferable to a character-level Diff implementation.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint32Array(cols));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let beforeLine = 1;
  let afterLine = 1;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({
        kind: "same",
        text: a[i]!,
        beforeLine,
        afterLine,
      });
      i += 1;
      j += 1;
      beforeLine += 1;
      afterLine += 1;
      continue;
    }
    if (j >= b.length || (i < a.length && dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      result.push({
        kind: "remove",
        text: a[i]!,
        beforeLine,
        afterLine: null,
      });
      i += 1;
      beforeLine += 1;
      continue;
    }
    result.push({
      kind: "add",
      text: b[j]!,
      beforeLine: null,
      afterLine,
    });
    j += 1;
    afterLine += 1;
  }
  return result;
}

/** The newest audit entry for one bot, or null when none exists. */
export function newestAuditForBot(
  entries: readonly AuditEntry[],
  bot: string,
): AuditEntry | null {
  let newest: AuditEntry | null = null;
  let newestTime = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    if (entry.bot !== bot) continue;
    const time = Date.parse(entry.at);
    const comparable = Number.isNaN(time) ? newestTime : time;
    if (newest === null || comparable >= newestTime) {
      newest = entry;
      newestTime = comparable;
    }
  }
  return newest;
}

/** The factory appends one newline during save; accept that single difference. */
export function storedTextMatches(stored: string, edited: string): boolean {
  if (stored === edited) return true;
  if (!edited.endsWith("\n") && stored === `${edited}\n`) return true;
  if (!stored.endsWith("\n") && edited === `${stored}\n`) return true;
  return false;
}


export interface SavedSoulVerification {
  record: SoulRecord | null;
  audit: AuditEntry | null;
  verified: boolean;
}

/** The read-back contract after a successful soul write. */
export function verifySavedSoul(
  bot: string,
  edited: string,
  souls: readonly SoulRecord[],
  audit: readonly AuditEntry[],
): SavedSoulVerification {
  const record = souls.find((entry) => entry.bot === bot) ?? null;
  return {
    record,
    audit: newestAuditForBot(audit, bot),
    verified: record !== null && storedTextMatches(record.soul, edited),
  };
}

export function toolsForBot(
  toolsByBot: Record<string, string[]> | null,
  bot: string,
): string[] | null {
  if (toolsByBot === null) return null;
  const tools = toolsByBot[bot];
  return tools === undefined ? null : tools;
}

export function botTitle(bot: string): string {
  return bot.charAt(0).toUpperCase() + bot.slice(1);
}

export function formatAuditTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
