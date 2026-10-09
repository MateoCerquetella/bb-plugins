import { useId, useRef, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ThreadCard } from "@/components/inbox/thread-card";
import type { ProviderGlyphInfo } from "@/components/inbox/provider-glyph";
import type { LifecycleApi } from "@/hooks/use-lifecycle";
import {
  threadIsWorking,
  type ProjectThreadGroup,
} from "@/lib/inbox";
import {
  BULK_PROTECTION_LABELS,
  bulkEligibility,
  type RootSelectionIntent,
} from "@/lib/thread-management";
import type { DocksidePreferences } from "@/lib/preferences";
import {
  projectBadgeLetter,
  projectBadgePresentation,
} from "@/lib/project-colors";

export function ProjectGroup({
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
  reorderEnabled,
  reorderDisabledReason,
  onReorder,
  onKeyboardMove,
  projectReorderEnabled,
  projectReorderDisabledReason,
  onProjectReorder,
  onProjectKeyboardMove,
  preferences,
  projectColorOverrides,
}: {
  group: ProjectThreadGroup;
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
  reorderEnabled: boolean;
  reorderDisabledReason: string | null;
  onReorder: (input: {
    sourceProjectId: string;
    sourceRootId: string;
    targetProjectId: string;
    targetRootId: string;
    position: "before" | "after";
  }) => void;
  onKeyboardMove: (projectId: string, rootId: string, direction: -1 | 1) => void;
  projectReorderEnabled: boolean;
  projectReorderDisabledReason: string | null;
  onProjectReorder: (input: {
    sourceProjectId: string;
    targetProjectId: string;
    position: "before" | "after";
  }) => void;
  onProjectKeyboardMove: (projectId: string, direction: -1 | 1) => void;
  preferences: DocksidePreferences;
  projectColorOverrides: ReadonlyMap<string, string>;
}) {
  const actions = useSidebarThreadActions();
  const projectDragStarted = useRef(false);
  const [expandedByUser, setExpandedByUser] = useState(true);
  const projectListId = useId();
  const threads = group.families.flatMap((family) => [
    family.root,
    ...family.children,
  ]);
  const expanded = forceExpanded || expandedByUser;
  const badge = projectBadgePresentation(
    group.project.id,
    projectColorOverrides.get(group.project.id),
  );

  return (
    <section
      aria-label={group.project.name}
      data-dockside-project={group.project.id}
      className="mt-1.5 first:mt-0"
      onDragOver={(event) => {
        if (
          !projectReorderEnabled ||
          !event.dataTransfer.types.includes("application/x-dockside-project")
        ) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const dragged = parseDraggedProject(
          event.dataTransfer.getData("application/x-dockside-project"),
        );
        if (dragged === null) return;
        event.preventDefault();
        event.stopPropagation();
        const header = event.currentTarget.firstElementChild;
        const bounds = header?.getBoundingClientRect();
        onProjectReorder({
          sourceProjectId: dragged.projectId,
          targetProjectId: group.project.id,
          position:
            bounds && event.clientY >= bounds.top + bounds.height / 2
              ? "after"
              : "before",
        });
      }}
    >
      <div className="group/project relative flex h-8 w-full items-center gap-2 rounded-md px-1.5 hover:bg-sidebar-accent/60">
        <button
          type="button"
          draggable={projectReorderEnabled}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.project.name}. ${projectReorderEnabled ? "Drag this header to reorder projects, or press Alt+Up or Alt+Down." : (projectReorderDisabledReason ?? "Project reordering is unavailable.")}`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          title={
            projectReorderEnabled
              ? "Drag to reorder projects · Alt+Up / Alt+Down"
              : (projectReorderDisabledReason ?? "Project reordering is unavailable.")
          }
          aria-expanded={expanded}
          aria-controls={projectListId}
          onClick={(event) => {
            if (projectDragStarted.current) {
              event.preventDefault();
              return;
            }
            setExpandedByUser(!expanded);
          }}
          onDragStart={(event) => {
            if (!projectReorderEnabled) {
              event.preventDefault();
              return;
            }
            projectDragStarted.current = true;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-dockside-project",
              JSON.stringify({ projectId: group.project.id }),
            );
          }}
          onDragEnd={() => {
            setTimeout(() => {
              projectDragStarted.current = false;
            }, 0);
          }}
          onKeyDown={(event) => {
            if (!event.altKey) return;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              onProjectKeyboardMove(
                group.project.id,
                event.key === "ArrowUp" ? -1 : 1,
              );
            }
          }}
          className="absolute inset-0 cursor-grab rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
        />
        <span
          aria-hidden
          data-dockside-project-badge={group.project.id}
          className="pointer-events-none relative flex size-5 shrink-0 items-center justify-center rounded-md border border-black/15 text-2xs font-semibold uppercase shadow-sm"
          style={{
            backgroundColor: badge.backgroundColor,
            color: badge.foregroundColor,
          }}
        >
          {projectBadgeLetter(group.project.name)}
        </span>
        <span className="pointer-events-none relative min-w-0 flex-1 truncate text-xs font-semibold text-foreground/90">
          {group.project.name}
        </span>
        <span className="pointer-events-none relative shrink-0 tabular-nums text-2xs text-muted-foreground/70">
          {group.families.length}
        </span>
        <button
          type="button"
          aria-label={`New thread in ${group.project.name}`}
          title={`New thread in ${group.project.name}`}
          onClick={() => {
            actions.openNewThread({
              projectId: group.project.id,
              focusPrompt: true,
            });
            onNavigate();
          }}
          className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-sidebar-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon name="Add" className="size-3.5" aria-hidden />
        </button>
        <Icon
          name="ChevronDown"
          className={cn(
            "pointer-events-none relative size-3 shrink-0 text-muted-foreground/70 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
        <span className="sr-only">{projectStatusLabel(threads)}</span>
      </div>

      {expanded ? (
        <ul id={projectListId} className="mt-0.5 flex flex-col gap-0.5">
          {group.families.map((family) => {
            const eligibility = bulkEligibility(family, activeThreadId);
            return (
              <ThreadCard
                key={family.root.id}
                thread={family.root}
                projectName={group.project.name}
                projectColorOverride={projectColorOverrides.get(group.project.id)}
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
                selectionHintId={selectionHintId}
                selectionDisabledReason={
                  eligibility.eligible
                    ? null
                    : BULK_PROTECTION_LABELS[eligibility.reason]
                }
                onToggleSelected={(intent) =>
                  onToggleRoot(family.root.id, intent)
                }
                reorderEnabled={reorderEnabled}
                reorderDisabledReason={reorderDisabledReason}
                onMoveByKeyboard={(direction) =>
                  onKeyboardMove(
                    group.project.id,
                    family.root.id,
                    direction,
                  )
                }
                onReorderDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/x-dockside-family",
                    JSON.stringify({
                      projectId: group.project.id,
                      rootId: family.root.id,
                    }),
                  );
                }}
                onReorderDragOver={(event) => {
                  if (!reorderEnabled) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onReorderDrop={(event) => {
                  event.preventDefault();
                  const dragged = parseDraggedFamily(
                    event.dataTransfer.getData(
                      "application/x-dockside-family",
                    ),
                  );
                  if (dragged === null) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onReorder({
                    sourceProjectId: dragged.projectId,
                    sourceRootId: dragged.rootId,
                    targetProjectId: group.project.id,
                    targetRootId: family.root.id,
                    position:
                      event.clientY < bounds.top + bounds.height / 2
                        ? "before"
                        : "after",
                  });
                }}
                preferences={preferences}
              />
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function parseDraggedFamily(
  raw: string,
): { projectId: string; rootId: string } | null {
  if (raw.length === 0 || raw.length > 1_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("projectId" in parsed) ||
      !("rootId" in parsed) ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.rootId !== "string"
    ) {
      return null;
    }
    return { projectId: parsed.projectId, rootId: parsed.rootId };
  } catch {
    return null;
  }
}

function parseDraggedProject(raw: string): { projectId: string } | null {
  if (raw.length === 0 || raw.length > 500) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("projectId" in parsed) ||
      typeof parsed.projectId !== "string"
    ) {
      return null;
    }
    return { projectId: parsed.projectId };
  } catch {
    return null;
  }
}

function projectStatusLabel(threads: readonly PluginSidebarThread[]): string {
  const labels: string[] = [];
  if (threads.some((thread) => thread.hasPendingInteraction)) {
    labels.push("needs you");
  }
  if (threads.some(threadIsWorking)) labels.push("working");
  if (threads.some((thread) => thread.isUnread)) labels.push("unread");
  return labels.length > 0 ? labels.join(", ") : "No active status";
}
