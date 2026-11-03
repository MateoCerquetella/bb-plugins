export interface SoulDraft {
  text: string;
  base: string;
  updatedAt: number;
}

const AUTHOR_KEY = "factory-souls:author:v1";
const DRAFT_PREFIX = "factory-souls:draft:v1:";
const memoryDrafts = new Map<string, SoulDraft>();
let memoryAuthor = "";

export function draftKey(bot: string): string {
  return `${DRAFT_PREFIX}${bot}`;
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function parseDraft(raw: string | null): SoulDraft | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.text !== "string" ||
      typeof record.base !== "string" ||
      typeof record.updatedAt !== "number"
    ) {
      return null;
    }
    return {
      text: record.text,
      base: record.base,
      updatedAt: record.updatedAt,
    };
  } catch {
    return null;
  }
}

export function readDraft(bot: string): SoulDraft | null {
  const store = localStore();
  if (store === null) return memoryDrafts.get(bot) ?? null;
  const draft = parseDraft(store.getItem(draftKey(bot)));
  if (draft === null) {
    store.removeItem(draftKey(bot));
    return null;
  }
  return draft;
}

export function writeDraft(bot: string, text: string, base: string): SoulDraft {
  const draft: SoulDraft = { text, base, updatedAt: Date.now() };
  memoryDrafts.set(bot, draft);
  const store = localStore();
  try {
    store?.setItem(draftKey(bot), JSON.stringify(draft));
  } catch {
    // The in-memory copy still protects this session.
  }
  return draft;
}

export function removeDraft(bot: string): void {
  memoryDrafts.delete(bot);
  const store = localStore();
  try {
    store?.removeItem(draftKey(bot));
  } catch {
    // Nothing else to clear.
  }
}

export function readAuthor(): string {
  const store = sessionStore();
  if (store === null) return memoryAuthor;
  const stored = store.getItem(AUTHOR_KEY);
  if (stored !== null) return stored;
  return memoryAuthor;
}

export function writeAuthor(author: string): void {
  memoryAuthor = author;
  const store = sessionStore();
  try {
    store?.setItem(AUTHOR_KEY, author);
  } catch {
    // The in-memory value still covers this panel session.
  }
}

/** A restored draft is unsaved when it differs from the currently stored text. */
export function draftIsUnsaved(draft: SoulDraft | null, current: string): boolean {
  return draft !== null && draft.text !== current;
}
