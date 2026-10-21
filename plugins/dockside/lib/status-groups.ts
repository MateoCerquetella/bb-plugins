import {
  familyStatus,
  type FamilyStatusKind,
} from "./family-status.ts";
import { familyMembers } from "./thread-management.ts";
import type { ThreadFamily } from "./inbox.ts";

export const STATUS_GROUP_ORDER = [
  "needs-you",
  "failed",
  "working",
  "unread",
] as const satisfies readonly FamilyStatusKind[];

export interface ThreadSection {
  kind: string;
  label: string;
  families: ThreadFamily[];
}

const STATUS_LABELS = {
  "needs-you": "Needs your input",
  failed: "Failed",
  working: "Working",
  unread: "Unread",
};

export function familyIsPinned(family: ThreadFamily): boolean {
  return familyMembers(family).some((thread) => thread.isPinned);
}

export function groupFamiliesByStatus(
  families: readonly ThreadFamily[],
  now: number,
): ThreadSection[] {
  const grouped = new Map<FamilyStatusKind, ThreadFamily[]>();
  const pinned: ThreadFamily[] = [];
  for (const family of families) {
    if (familyIsPinned(family)) {
      pinned.push(family);
      continue;
    }
    const kind = familyStatus(familyMembers(family), now).kind;
    const entries = grouped.get(kind) ?? [];
    entries.push(family);
    grouped.set(kind, entries);
  }

  const active = STATUS_GROUP_ORDER.flatMap((kind) => {
    const entries = grouped.get(kind);
    return entries?.length
      ? [{ kind, label: STATUS_LABELS[kind], families: entries }]
      : [];
  });
  const idle = [
    ...(grouped.get("inactive") ?? []),
    ...(grouped.get("stale") ?? []),
  ];
  return [
    ...(pinned.length
      ? [{
          kind: "pinned" as const,
          label: "Pinned",
          families: pinned,
        }]
      : []),
    ...active,
    ...(idle.length
      ? [{
          kind: "idle" as const,
          label: "Idle",
          families: idle,
        }]
      : []),
  ];
}
