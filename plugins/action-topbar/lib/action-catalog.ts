export interface ActionDescriptor {
  id: string;
  label: string;
}

export const ACTION_CATALOG_STORAGE_KEY = "bb:action-topbar:catalog";

/**
 * Useful immediately on a stock Mateo setup. The first visible BB New Tab
 * launcher replaces this seed with its live action inventory, so disabled,
 * removed, renamed, and newly installed actions converge to the host.
 */
export const SEEDED_ACTIONS: readonly ActionDescriptor[] = [
  { id: "file-search-result-open-browser", label: "Open browser" },
  { id: "file-search-result-start-terminal", label: "Start terminal" },
  { id: "plugin-action:bb-recap:recap", label: "Recap" },
  { id: "plugin-action:file-manager:file-manager", label: "File Manager" },
  { id: "plugin-action:filetree:files", label: "Files" },
  { id: "plugin-action:git-history:history", label: "Git History" },
  { id: "plugin-action:side-chat:side-chat", label: "Start side chat" },
  { id: "plugin-action:taskboard:taskboard-panel", label: "Taskboard" },
  { id: "plugin-action:workflows:workflow-run", label: "Workflow run" },
];

const MAX_ACTIONS = 64;
const MAX_ID_LENGTH = 256;
const MAX_LABEL_LENGTH = 80;

function normalizeAction(value: unknown): ActionDescriptor | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.label !== "string") {
    return null;
  }
  const id = record.id.trim();
  const label = record.label.trim().replace(/\s+/g, " ");
  if (
    id.length === 0 ||
    id.length > MAX_ID_LENGTH ||
    label.length === 0 ||
    label.length > MAX_LABEL_LENGTH
  ) {
    return null;
  }
  return { id, label };
}

export function uniqueActions(values: readonly unknown[]): ActionDescriptor[] {
  const seen = new Set<string>();
  const actions: ActionDescriptor[] = [];
  for (const value of values) {
    const action = normalizeAction(value);
    if (action === null || seen.has(action.id)) continue;
    seen.add(action.id);
    actions.push(action);
    if (actions.length === MAX_ACTIONS) break;
  }
  return actions;
}

export function parseStoredActionCatalog(raw: string | null): ActionDescriptor[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Record<string, unknown>).version !== 1 ||
      !Array.isArray((parsed as Record<string, unknown>).actions)
    ) {
      return [];
    }
    return uniqueActions((parsed as { actions: unknown[] }).actions);
  } catch {
    return [];
  }
}

export function serializeActionCatalog(actions: readonly ActionDescriptor[]): string {
  return JSON.stringify({ version: 1, actions: uniqueActions(actions) });
}

export function initialActionCatalog(raw: string | null): ActionDescriptor[] {
  const stored = parseStoredActionCatalog(raw);
  return stored.length > 0 ? stored : [...SEEDED_ACTIONS];
}

/** An empty observation means the launcher is absent, not that it has no actions. */
export function applyDiscoveredCatalog(
  current: readonly ActionDescriptor[],
  discovered: readonly ActionDescriptor[],
): ActionDescriptor[] {
  const normalized = uniqueActions(discovered);
  return normalized.length > 0 ? normalized : [...current];
}

export function compactActionLabel(label: string): string {
  return label.replace(/^(Open|Start)\s+/i, "");
}

export type ActionKind =
  | "browser"
  | "terminal"
  | "recap"
  | "files"
  | "git"
  | "chat"
  | "task"
  | "workflow"
  | "generic";

export function actionKind(action: ActionDescriptor): ActionKind {
  const haystack = `${action.id} ${action.label}`.toLowerCase();
  if (haystack.includes("browser")) return "browser";
  if (haystack.includes("terminal")) return "terminal";
  if (haystack.includes("recap")) return "recap";
  if (
    haystack.includes("file-manager") ||
    haystack.includes("file manager") ||
    haystack.includes("filetree") ||
    /\bfiles\b/.test(haystack)
  ) {
    return "files";
  }
  if (haystack.includes("git-history") || haystack.includes("git history")) {
    return "git";
  }
  if (haystack.includes("side-chat") || haystack.includes("side chat")) {
    return "chat";
  }
  if (haystack.includes("task")) return "task";
  if (haystack.includes("workflow")) return "workflow";
  return "generic";
}

export function catalogFingerprint(actions: readonly ActionDescriptor[]): string {
  return actions.map((action) => `${action.id}\u0000${action.label}`).join("\u0001");
}
