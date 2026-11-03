/** The Orchestrator chat survives leaving the page, and remembers what it filed. */
export interface StoredChatEntry {
  id: number;
  role: "user" | "orchestrator" | "error";
  text: string;
  created: string[];
}

const KEY = "factory-bots:orchestrator-chat:v1";

export function loadChatEntries(): StoredChatEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): StoredChatEntry[] => {
      if (typeof value !== "object" || value === null) return [];
      const entry = value as Record<string, unknown>;
      if (
        typeof entry.id !== "number" ||
        (entry.role !== "user" &&
          entry.role !== "orchestrator" &&
          entry.role !== "error") ||
        typeof entry.text !== "string"
      ) {
        return [];
      }
      return [
        {
          id: entry.id,
          role: entry.role,
          text: entry.text,
          created: Array.isArray(entry.created)
            ? entry.created.filter((id): id is string => typeof id === "string")
            : [],
        },
      ];
    });
  } catch {
    return [];
  }
}

export const CHAT_CHANGED = "factory-bots:chat-changed";

export function saveChatEntries(entries: readonly StoredChatEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // The page still works when storage is unavailable.
  }
}

/** Wake the chat view after another surface (a ticket steer) appends to the same log. */
export function notifyChatChanged(): void {
  window.dispatchEvent(new CustomEvent(CHAT_CHANGED));
}

/** Clear only this browser's Orchestrator history; factory memory is untouched. */
export function clearChatEntries(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Clearing a missing store is still a successful local clear.
  }
  notifyChatChanged();
}

export function appendChatEntry(
  entry: Omit<StoredChatEntry, "id">,
): StoredChatEntry {
  const current = loadChatEntries();
  const next: StoredChatEntry = {
    ...entry,
    id: (current.at(-1)?.id ?? 0) + 1,
  };
  saveChatEntries([...current, next]);
  notifyChatChanged();
  return next;
}

export const CHAT_PENDING = "factory-bots:chat-pending";

/** A ticket steer uses the same Orchestrator chat; show it working there too. */
export function setChatPending(pending: boolean): void {
  window.dispatchEvent(
    new CustomEvent<boolean>(CHAT_PENDING, { detail: pending }),
  );
}
