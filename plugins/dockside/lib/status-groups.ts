import {
  familyStatus,
  familyStatusPresentation,
  type FamilyStatusKind,
  type FamilyStatusPresentation,
} from "./family-status.ts";
import { familyMembers } from "./thread-management.ts";
import type { ThreadFamily } from "./inbox.ts";

export const STATUS_GROUP_ORDER = [
  "failed",
  "needs-you",
  "working",
  "unread",
  "inactive",
  "stale",
] as const satisfies readonly FamilyStatusKind[];

export interface StatusThreadGroup {
  kind: FamilyStatusKind;
  presentation: FamilyStatusPresentation;
  families: ThreadFamily[];
}

export function groupFamiliesByStatus(
  families: readonly ThreadFamily[],
  now: number,
): StatusThreadGroup[] {
  const grouped = new Map<FamilyStatusKind, ThreadFamily[]>();
  for (const family of families) {
    const kind = familyStatus(familyMembers(family), now).kind;
    const entries = grouped.get(kind) ?? [];
    entries.push(family);
    grouped.set(kind, entries);
  }

  return STATUS_GROUP_ORDER.flatMap((kind) => {
    const entries = grouped.get(kind);
    return entries?.length
      ? [{ kind, presentation: familyStatusPresentation(kind), families: entries }]
      : [];
  });
}
