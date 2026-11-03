/** Steering messages belong to a ticket, even after the panel reloads. */
export interface StoredSteerEntry {
  role: "user" | "orchestrator" | "error";
  text: string;
  at: number;
}

const KEY = "factory-bots:steers:v1";
const LIMIT = 20;

type SteerStore = Record<string, StoredSteerEntry[]>;

function readStore(): SteerStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const store: SteerStore = {};
    for (const [ticket, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const entries = value.flatMap((entry): StoredSteerEntry[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const record = entry as Record<string, unknown>;
        if (
          (record.role !== "user" &&
            record.role !== "orchestrator" &&
            record.role !== "error") ||
          typeof record.text !== "string"
        ) {
          return [];
        }
        return [
          {
            role: record.role,
            text: record.text,
            at: typeof record.at === "number" ? record.at : 0,
          },
        ];
      });
      store[ticket] = entries.slice(-LIMIT);
    }
    return store;
  } catch {
    return {};
  }
}

export function loadSteerLog(ticket: string): StoredSteerEntry[] {
  return readStore()[ticket] ?? [];
}

export function appendSteer(
  ticket: string,
  entry: Omit<StoredSteerEntry, "at">,
): StoredSteerEntry[] {
  const store = readStore();
  const next = [
    ...(store[ticket] ?? []),
    { ...entry, at: Date.now() },
  ].slice(-LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...store, [ticket]: next }));
  } catch {
    // The thread still works when storage is unavailable.
  }
  return next;
}
