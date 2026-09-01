import type { ActionDescriptor } from "./action-catalog.js";

export const TAB_KINDS = [
  "thread-info",
  "git-diff",
  "plugin-panel",
  "workspace-file-preview",
  "host-file-preview",
  "thread-storage-file-preview",
  "browser",
  "new-tab",
  "side-chat",
  "terminal",
] as const;

export type TabKind = (typeof TAB_KINDS)[number];

export interface TabSummary {
  closable: boolean;
  id: string;
  kind: TabKind;
  label: string;
  relaunchActionId: string | null;
}

export interface TabsSnapshot {
  revision: number;
  tabs: TabSummary[];
}

export interface LauncherOption {
  detail: string;
  id: string;
  kind: "action" | "tab";
  label: string;
  targetId: string;
}

const MAX_TABS = 200;
export const MAX_TAB_ID_LENGTH = 512;
export const MAX_TAB_LABEL_LENGTH = 160;
const DISPLAYABLE_TAB_KINDS = new Set<TabKind>([
  "plugin-panel",
  "workspace-file-preview",
  "host-file-preview",
  "thread-storage-file-preview",
  "browser",
  "new-tab",
  "side-chat",
  "terminal",
]);

function isTabKind(value: unknown): value is TabKind {
  return TAB_KINDS.some((kind) => kind === value);
}

export function boundedTabId(value: string, fallback: string): string {
  return (value.trim() || fallback).slice(0, MAX_TAB_ID_LENGTH);
}

export function boundedTabLabel(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, " ") || fallback;
  return normalized.slice(0, MAX_TAB_LABEL_LENGTH);
}

function parseTabSummary(value: unknown): TabSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    record.id.length > MAX_TAB_ID_LENGTH ||
    !isTabKind(record.kind) ||
    typeof record.label !== "string" ||
    record.label.length === 0 ||
    record.label.length > MAX_TAB_LABEL_LENGTH ||
    typeof record.closable !== "boolean" ||
    (record.relaunchActionId !== null &&
      typeof record.relaunchActionId !== "string")
  ) {
    return null;
  }
  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    closable: record.closable,
    relaunchActionId: record.relaunchActionId,
  };
}

export function parseTabsSnapshot(value: unknown): TabsSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.revision !== "number" ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0 ||
    !Array.isArray(record.tabs) ||
    record.tabs.length > MAX_TABS
  ) {
    return null;
  }
  const tabs = record.tabs.map(parseTabSummary);
  if (tabs.some((tab) => tab === null)) return null;
  const parsedTabs = tabs as TabSummary[];
  if (new Set(parsedTabs.map((tab) => tab.id)).size !== parsedTabs.length) {
    return null;
  }
  return { revision: record.revision, tabs: parsedTabs };
}

export function displayableTabs(
  tabs: readonly TabSummary[],
): TabSummary[] {
  return tabs.filter((tab) => DISPLAYABLE_TAB_KINDS.has(tab.kind));
}

export function nativeLabelMatchesTab(
  summary: TabSummary,
  nativeLabel: string,
): boolean {
  const boundedNativeLabel = boundedTabLabel(nativeLabel, "Tab");
  if (boundedNativeLabel === summary.label) return true;
  return (
    summary.kind === "terminal" &&
    boundedNativeLabel.toLocaleLowerCase().startsWith("terminal")
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function matchScore(query: string, label: string, detail: string): number {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) return 1;
  const normalizedLabel = normalize(label);
  const normalizedDetail = normalize(detail);
  if (normalizedLabel === normalizedQuery) return 100;
  if (normalizedLabel.startsWith(normalizedQuery)) return 80;
  if (normalizedLabel.includes(normalizedQuery)) return 60;
  const tokens = normalizedQuery.split(" ");
  const haystack = `${normalizedLabel} ${normalizedDetail}`;
  if (tokens.every((token) => haystack.includes(token))) return 40;
  return 0;
}

/**
 * Orca's empty + menu is a creation launcher. Open tabs join only after the
 * user types, where an existing tab ranks ahead of creating a duplicate.
 */
export function buildLauncherOptions(
  tabs: readonly TabSummary[],
  actions: readonly ActionDescriptor[],
  query: string,
): LauncherOption[] {
  const hasQuery = normalize(query).length > 0;
  const candidates: Array<LauncherOption & { order: number; score: number }> = [];
  let order = 0;

  if (hasQuery) {
    for (const tab of displayableTabs(tabs)) {
      const detail = "Open tab";
      const matchingAction =
        tab.relaunchActionId === null
          ? undefined
          : actions.find((action) => action.id === tab.relaunchActionId);
      const tabScore = matchScore(query, tab.label, `${detail} ${tab.kind}`);
      const actionScore =
        matchingAction === undefined
          ? 0
          : matchScore(
              query,
              matchingAction.label,
              `Action ${matchingAction.id}`,
            );
      const score = Math.max(tabScore, actionScore);
      if (score > 0) {
        candidates.push({
          id: `tab:${tab.id}`,
          kind: "tab",
          targetId: tab.id,
          label: tab.label,
          detail,
          order: order++,
          score: score + (actionScore > 0 ? 1_000 : 10),
        });
      }
    }
  }

  for (const action of actions) {
    const detail = "Drag";
    const score = matchScore(query, action.label, `${detail} ${action.id}`);
    if (score > 0) {
      candidates.push({
        id: `action:${action.id}`,
        kind: "action",
        targetId: action.id,
        label: action.label,
        detail,
        order: order++,
        score,
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(({ order: _order, score: _score, ...option }) => option);
}
