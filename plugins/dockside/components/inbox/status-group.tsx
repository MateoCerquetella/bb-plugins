import { useId, useState } from "react";
import { FamilyStatusIcon } from "@/components/inbox/family-status";
import { ThreadCard } from "@/components/inbox/thread-card";
import type { ProviderGlyphInfo } from "@/components/inbox/provider-glyph";
import type { LifecycleApi } from "@/hooks/use-lifecycle";
import type { DocksidePreferences } from "@/lib/preferences";
import type { StatusThreadGroup } from "@/lib/status-groups";
import {
  BULK_PROTECTION_LABELS,
  bulkEligibility,
  type RootSelectionIntent,
} from "@/lib/thread-management";

export function StatusGroup({
  group,
  providerInfoById,
  activeThreadId,
  forceExpanded,
  lifecycle,
  onNavigate,
  now,
  selectionMode,
  selectedRootIds,
  selectionHintId,
  onToggleRoot,
  preferences,
}: {
  group: StatusThreadGroup;
  providerInfoById: ReadonlyMap<string, ProviderGlyphInfo>;
  activeThreadId: string | null;
  forceExpanded: boolean;
  lifecycle: LifecycleApi;
  onNavigate: () => void;
  now: number;
  selectionMode: boolean;
  selectedRootIds: ReadonlySet<string>;
  selectionHintId: string;
  onToggleRoot: (threadId: string, intent: RootSelectionIntent) => void;
  preferences: DocksidePreferences;
}) {
  const [expanded, setExpanded] = useState(true);
  const listId = useId();

  return (
    <section aria-label={group.presentation.label} className="mt-2 first:mt-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((open) => !open)}
        className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <FamilyStatusIcon status={group.presentation} className="pointer-events-none" />
        <span className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          {group.presentation.label}
        </span>
        <span className="tabular-nums text-2xs text-muted-foreground/70">
          {group.families.length}
        </span>
      </button>
      {expanded ? (
        <ul id={listId} className="mt-0.5 flex flex-col gap-0.5">
          {group.families.map((family) => {
            const eligibility = bulkEligibility(family, activeThreadId);
            return (
              <ThreadCard
                key={family.root.id}
                thread={family.root}
                childThreads={family.children}
                providerInfoById={providerInfoById}
                activeThreadId={activeThreadId}
                canPark={lifecycle.canPark(family.root)}
                forceExpanded={forceExpanded}
                onNavigate={onNavigate}
                onSettle={() => lifecycle.settle(family.root.id)}
                onSnooze={(until) => lifecycle.snooze(family.root.id, until)}
                now={now}
                selectionMode={selectionMode}
                selected={selectedRootIds.has(family.root.id)}
                selectionDisabledReason={
                  eligibility.eligible
                    ? null
                    : BULK_PROTECTION_LABELS[eligibility.reason]
                }
                selectionHintId={selectionHintId}
                onToggleSelected={(intent) => onToggleRoot(family.root.id, intent)}
                reorderEnabled={false}
                reorderDisabledReason="Switch to All to reorder thread families."
                onMoveByKeyboard={() => {}}
                onReorderDragStart={(event) => event.preventDefault()}
                onReorderDragOver={() => {}}
                onReorderDrop={(event) => event.preventDefault()}
                preferences={preferences}
                leadingVisual="provider"
              />
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
