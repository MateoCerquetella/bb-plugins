import type { PluginSidebarThread } from "@bb/plugin-sdk";
import { threadIsWorking, type ProjectThreadGroup, type ThreadFamily } from "./inbox.ts";

export const DAY_MS = 24 * 60 * 60 * 1_000;

export const THREAD_FILTER_PRESETS = [
  "all",
  "status",
  "working",
  "needs-you",
  "unread",
  "quiet",
  "quiet-1d",
  "quiet-7d",
] as const;

export type ThreadFilterPreset = (typeof THREAD_FILTER_PRESETS)[number];

export type ThreadFilterGroup = "status" | "inactivity";

export interface ThreadFilterOption {
  preset: ThreadFilterPreset;
  label: string;
  description: string;
  group: ThreadFilterGroup | null;
}

export const THREAD_FILTER_OPTIONS = [
  { preset: "all", label: "All", description: "Every active workspace", group: null },
  { preset: "status", label: "Status", description: "Group workspaces by current status", group: null },
  { preset: "working", label: "Working", description: "Workspaces with active runs", group: "status" },
  { preset: "needs-you", label: "Needs you", description: "Waiting for your response", group: "status" },
  { preset: "unread", label: "Unread", description: "Workspaces with new activity", group: "status" },
  { preset: "quiet", label: "Quiet", description: "No active or unread work", group: "inactivity" },
  { preset: "quiet-1d", label: "Quiet 1d+", description: "Inactive for at least one day", group: "inactivity" },
  { preset: "quiet-7d", label: "Quiet 7d+", description: "Inactive for at least one week", group: "inactivity" },
] as const satisfies readonly ThreadFilterOption[];

export const THREAD_FILTER_LABELS: Readonly<
  Record<ThreadFilterPreset, string>
> = {
  all: "All",
  status: "Status",
  working: "Working",
  "needs-you": "Needs you",
  unread: "Unread",
  quiet: "Quiet",
  "quiet-1d": "Quiet 1d+",
  "quiet-7d": "Quiet 7d+",
};

export type BulkProtectionReason =
  | "current"
  | "working"
  | "waiting"
  | "unread"
  | "pinned";

export type BulkEligibility =
  | { eligible: true }
  | { eligible: false; reason: BulkProtectionReason };

export interface RootSelectionUpdate {
  selectedRootIds: Set<string>;
  anchorRootId: string | null;
}

export interface RootSelectionIntent {
  selected: boolean;
  shiftKey: boolean;
}

export const BULK_PROTECTION_LABELS: Readonly<
  Record<BulkProtectionReason, string>
> = {
  current: "Currently open",
  working: "Working",
  waiting: "Needs you",
  unread: "Unread",
  pinned: "Pinned",
};

export function resolveFamilyExpanded({
  childCount,
  forceExpanded,
  override,
  defaultExpanded = true,
}: {
  childCount: number;
  forceExpanded: boolean;
  override: boolean | null;
  defaultExpanded?: boolean;
}): boolean {
  if (childCount === 0) return false;
  if (forceExpanded) return true;
  return override ?? defaultExpanded;
}

export function familyMembers(
  family: ThreadFamily,
): readonly PluginSidebarThread[] {
  return [family.root, ...family.children];
}

export function familyIsWorking(family: ThreadFamily): boolean {
  return familyMembers(family).some(threadIsWorking);
}

export function familyNeedsUser(family: ThreadFamily): boolean {
  return familyMembers(family).some(
    (thread) =>
      thread.hasPendingInteraction || thread.indicator === "waiting-for-input",
  );
}

export function familyIsUnread(family: ThreadFamily): boolean {
  return familyMembers(family).some(
    (thread) =>
      thread.isUnread ||
      thread.indicator === "unread-error" ||
      thread.indicator === "unread-success",
  );
}

export function familyIsQuiet(family: ThreadFamily): boolean {
  return (
    !familyIsWorking(family) &&
    !familyNeedsUser(family) &&
    !familyIsUnread(family)
  );
}

export function familyUpdatedAt(family: ThreadFamily): number {
  return familyMembers(family).reduce(
    (latest, thread) => Math.max(latest, thread.updatedAt),
    0,
  );
}

export function bulkEligibility(
  family: ThreadFamily,
  activeThreadId: string | null,
): BulkEligibility {
  const members = familyMembers(family);
  if (
    activeThreadId !== null &&
    members.some((thread) => thread.id === activeThreadId)
  ) {
    return { eligible: false, reason: "current" };
  }
  if (familyIsWorking(family)) {
    return { eligible: false, reason: "working" };
  }
  if (familyNeedsUser(family)) {
    return { eligible: false, reason: "waiting" };
  }
  if (familyIsUnread(family)) {
    return { eligible: false, reason: "unread" };
  }
  if (members.some((thread) => thread.isPinned)) {
    return { eligible: false, reason: "pinned" };
  }
  return { eligible: true };
}

export function filterProjectThreadGroups(
  groups: readonly ProjectThreadGroup[],
  preset: ThreadFilterPreset,
  now: number,
): ProjectThreadGroup[] {
  if (preset === "all" || preset === "status") return [...groups];

  return groups.flatMap((group) => {
    const families = group.families.filter((family) =>
      familyMatchesPreset(family, preset, now),
    );
    return families.length === 0 ? [] : [{ ...group, families }];
  });
}

export function selectableRootIds(
  groups: readonly ProjectThreadGroup[],
  activeThreadId: string | null,
): string[] {
  return groups.flatMap((group) =>
    group.families.flatMap((family) =>
      bulkEligibility(family, activeThreadId).eligible
        ? [family.root.id]
        : [],
    ),
  );
}

export function pruneSelectedRootIds(
  selected: ReadonlySet<string>,
  groups: readonly ProjectThreadGroup[],
): Set<string> {
  const visibleRootIds = new Set(
    groups.flatMap((group) =>
      group.families.map((family) => family.root.id),
    ),
  );
  return new Set([...selected].filter((id) => visibleRootIds.has(id)));
}

/**
 * Apply one native root-checkbox gesture to immutable selection state.
 *
 * `visibleEligibleRootIds` is the actual rendered enabled checkbox order, not
 * merely the logical project order. That keeps protected and collapsed roots
 * outside a Shift range. The checkbox's intended next state drives both range
 * selection and range deselection.
 */
export function applyRootSelection({
  selectedRootIds,
  visibleEligibleRootIds,
  anchorRootId,
  targetRootId,
  targetSelected,
  shiftKey,
}: {
  selectedRootIds: ReadonlySet<string>;
  visibleEligibleRootIds: readonly string[];
  anchorRootId: string | null;
  targetRootId: string;
  targetSelected: boolean;
  shiftKey: boolean;
}): RootSelectionUpdate {
  const next = new Set(selectedRootIds);
  const targetIndex = visibleEligibleRootIds.indexOf(targetRootId);

  // A stale event must not bypass current protection or visibility.
  if (targetIndex < 0) {
    return { selectedRootIds: next, anchorRootId: null };
  }

  const anchorIndex =
    shiftKey && anchorRootId !== null
      ? visibleEligibleRootIds.indexOf(anchorRootId)
      : -1;

  if (!shiftKey || anchorIndex < 0) {
    if (targetSelected) next.add(targetRootId);
    else next.delete(targetRootId);
    return { selectedRootIds: next, anchorRootId: targetRootId };
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  for (const rootId of visibleEligibleRootIds.slice(start, end + 1)) {
    if (targetSelected) next.add(rootId);
    else next.delete(rootId);
  }
  return { selectedRootIds: next, anchorRootId };
}

/**
 * Selection is a review surface: a family that becomes protected after it was
 * checked must stay visible even when the active preset or host search no
 * longer matches it. Preserve the complete group's canonical order and add
 * only the selected roots that filtering omitted.
 */
export function includeSelectedFamilies(
  filteredGroups: readonly ProjectThreadGroup[],
  allGroups: readonly ProjectThreadGroup[],
  selectedRootIds: ReadonlySet<string>,
): ProjectThreadGroup[] {
  if (selectedRootIds.size === 0) return [...filteredGroups];

  const filteredIdsByProject = new Map(
    filteredGroups.map((group) => [
      group.project.id,
      new Set(group.families.map((family) => family.root.id)),
    ]),
  );

  return allGroups.flatMap((group) => {
    const filteredIds = filteredIdsByProject.get(group.project.id);
    const families = group.families.filter(
      (family) =>
        filteredIds?.has(family.root.id) === true ||
        selectedRootIds.has(family.root.id),
    );
    return families.length === 0 ? [] : [{ ...group, families }];
  });
}

function familyMatchesPreset(
  family: ThreadFamily,
  preset: Exclude<ThreadFilterPreset, "all" | "status">,
  now: number,
): boolean {
  switch (preset) {
    case "working":
      return familyIsWorking(family);
    case "needs-you":
      return familyNeedsUser(family);
    case "unread":
      return familyIsUnread(family);
    case "quiet":
      return familyIsQuiet(family);
    case "quiet-1d":
      return familyIsQuiet(family) && now - familyUpdatedAt(family) >= DAY_MS;
    case "quiet-7d":
      return (
        familyIsQuiet(family) && now - familyUpdatedAt(family) >= 7 * DAY_MS
      );
  }
}
