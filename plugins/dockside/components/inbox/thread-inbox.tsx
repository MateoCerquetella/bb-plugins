import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  experimental_useProviders as useProviders,
  experimental_useSidebarThreads as useSidebarThreads,
  useRpc,
  useSettings,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@bb/plugin-sdk/app";
import type { docksideRpcContract } from "@/server";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ProjectGroup } from "@/components/inbox/project-group";
import { StatusGroup } from "@/components/inbox/status-group";
import type { ProviderGlyphInfo } from "@/components/inbox/provider-glyph";
import { SlimRow } from "@/components/inbox/slim-row";
import { FilterMenu } from "@/components/inbox/filter-menu";
import {
  BulkDeleteDialog,
  type BulkDeletePreviewView,
} from "@/components/inbox/bulk-delete-dialog";
import { useLifecycle } from "@/hooks/use-lifecycle";
import { useSettledThreads } from "@/hooks/use-settled-threads";
import { useProjectColors } from "@/hooks/use-project-colors";
import {
  mergeSettledThreads,
  pendingSettledCount,
} from "@/lib/settled-threads";
import { TRAILING_GLYPH_BOX_CLASS } from "@/components/inbox/status-slot";
import {
  groupThreadsByProject,
  searchProjectThreadGroups,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  visibleInboxThreads,
} from "@/lib/inbox";
import {
  applyRootSelection,
  filterProjectThreadGroups,
  includeSelectedFamilies,
  pruneSelectedRootIds,
  selectableRootIds,
  type ThreadFilterPreset,
  type RootSelectionIntent,
} from "@/lib/thread-management";
import {
  docksidePreferenceStyle,
  resolveDocksidePreferences,
} from "@/lib/preferences";
import {
  applyFamilyOrder,
  keyboardFamilyMove,
  moveProjectFamily,
  readFamilyOrder,
  withProjectFamilyOrder,
  writeFamilyOrder,
  type FamilyMoveResult,
} from "@/lib/family-order";
import {
  applyProjectOrder,
  keyboardProjectMove,
  moveProject,
  readProjectOrder,
  writeProjectOrder,
  type ProjectMoveResult,
} from "@/lib/project-order";
import { groupFamiliesByStatus } from "@/lib/status-groups";

const EMPTY_STATE_CLASS = "px-2 py-6 text-center text-xs text-muted-foreground";

/**
 * A project-first inbox. Project sections stay put; roots keep their creation
 * order; active root/child families expand in place instead of jumping around.
 */
export function ThreadInbox({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads: hostThreads, projects } = useSidebarThreads();
  const { providers } = useProviders();
  const rpc = useRpc<typeof docksideRpcContract>();
  const settings = useSettings();
  const preferences = useMemo(
    () => resolveDocksidePreferences(settings.values),
    [settings.values],
  );
  const { overrides: projectColorOverrides } = useProjectColors();
  const inboxRef = useRef<HTMLDivElement>(null);
  const selectionAnchorRootId = useRef<string | null>(null);
  const selectionHintId = useId();
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = nowMinute * 60_000;

  // Settling archives a thread in bb, so the host list alone cannot draw the
  // settled shelf. Merge the plugin's bounded archived read back in first.
  const { threads: settledThreads, rowsPending: settledRowsPending } =
    useSettledThreads(now);
  const threads = useMemo(
    () => mergeSettledThreads(hostThreads, settledThreads),
    [hostThreads, settledThreads],
  );
  const lifecycle = useLifecycle(threads);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [filterPreset, setFilterPreset] =
    useState<ThreadFilterPreset>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [familyOrder, setFamilyOrder] = useState(readFamilyOrder);
  const [projectOrder, setProjectOrder] = useState(readProjectOrder);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [selectedRootIds, setSelectedRootIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkPreview, setBulkPreview] =
    useState<BulkDeletePreviewView | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkOutcomes, setBulkOutcomes] = useState<
    Array<{ id: string; message: string; failed: boolean }>
  >([]);

  const providerInfoById = useMemo<
    ReadonlyMap<string, ProviderGlyphInfo>
  >(
    () =>
      new Map(
        providers.map((provider) => [
          provider.id,
          {
            displayName: provider.displayName,
            logoUrl: provider.logoUrl,
          },
        ]),
      ),
    [providers],
  );

  const { unfilteredProjectGroups, projectGroups, snoozed, settled } = useMemo(() => {
    const visible = visibleInboxThreads(threads, lifecycle.parkedThreadIds);
    const active: PluginSidebarThread[] = [];
    const onSnoozeShelf: PluginSidebarThread[] = [];
    const onSettledShelf: PluginSidebarThread[] = [];

    for (const thread of visible) {
      const shelf = lifecycle.shelfFor(thread);
      if (shelf === "snoozed") onSnoozeShelf.push(thread);
      else if (shelf === "settled") onSettledShelf.push(thread);
      else active.push(thread);
    }

    const unfilteredProjectGroups = applyProjectOrder(
      groupThreadsByProject(active, projects),
      projectOrder,
    ).map((group) => ({
        ...group,
        families: applyFamilyOrder(
          group.families,
          familyOrder[group.project.id],
        ),
      }),
    );
    const filteredProjectGroups = filterProjectThreadGroups(
      unfilteredProjectGroups,
      filterPreset,
      now,
    );

    const searchedProjectGroups = searchProjectThreadGroups(
      filteredProjectGroups,
      searchQuery,
    );

    return {
      unfilteredProjectGroups,
      projectGroups: selectionMode
        ? includeSelectedFamilies(
            searchedProjectGroups,
            unfilteredProjectGroups,
            selectedRootIds,
          )
        : searchedProjectGroups,
      snoozed: searchThreadsByTitle(
        [...onSnoozeShelf].sort(
          (left, right) =>
            (lifecycle.wakeAtFor(left) ?? 0) -
            (lifecycle.wakeAtFor(right) ?? 0),
        ),
        searchQuery,
      ),
      settled: searchThreadsByTitle(
        sortByCreatedAtDescending(onSettledShelf),
        searchQuery,
      ),
    };
  }, [
    filterPreset,
    familyOrder,
    lifecycle,
    now,
    projects,
    projectOrder,
    searchQuery,
    selectedRootIds,
    selectionMode,
    threads,
  ]);

  useEffect(() => {
    setSelectedRootIds((current) => {
      const next = pruneSelectedRootIds(current, unfilteredProjectGroups);
      return setsEqual(current, next) ? current : next;
    });
  }, [unfilteredProjectGroups]);

  // Lifecycle rows can arrive before the archived thread DTOs they name. Keep
  // the collapsed Settled count truthful during that one round trip.
  const pendingSettled = useMemo(() => {
    if (
      filterPreset !== "all" ||
      selectionMode ||
      !settledRowsPending ||
      searchQuery.trim().length > 0
    ) {
      return 0;
    }
    return pendingSettledCount(
      lifecycle.parkedRows.values(),
      new Set(threads.map((thread) => thread.id)),
      now,
    );
  }, [
    lifecycle.parkedRows,
    filterPreset,
    now,
    searchQuery,
    selectionMode,
    settledRowsPending,
    threads,
  ]);

  const activeVisibleCount = projectGroups.reduce(
    (total, group) =>
      total +
      group.families.reduce(
        (groupTotal, family) => groupTotal + 1 + family.children.length,
        0,
      ),
    0,
  );
  const statusGroups = useMemo(
    () =>
      groupFamiliesByStatus(
        projectGroups.flatMap((group) => group.families),
        now,
      ),
    [now, projectGroups],
  );
  const showParkedShelves = filterPreset === "all" && !selectionMode;
  const visibleTotal = showParkedShelves
    ? activeVisibleCount + snoozed.length + settled.length + pendingSettled
    : activeVisibleCount;
  const searching = searchQuery.trim().length > 0;
  const reorderDisabledReason = selectionMode
    ? "Exit bulk selection to reorder thread families."
    : filterPreset !== "all"
      ? "Choose the All filter to reorder the complete project."
      : searching
        ? "Clear search to reorder the complete project."
        : null;
  const reorderEnabled = reorderDisabledReason === null;
  const selectableVisibleRootIds = useMemo(
    () => selectableRootIds(projectGroups, activeThreadId),
    [activeThreadId, projectGroups],
  );
  const visibleRootCount = projectGroups.reduce(
    (total, group) => total + group.families.length,
    0,
  );
  const visibleRootOrderKey = projectGroups
    .flatMap((group) => group.families.map((family) => family.root.id))
    .join("\u001f");
  const rootTitleById = useMemo(
    () =>
      new Map(
        unfilteredProjectGroups.flatMap((group) =>
          group.families.map((family) => [
            family.root.id,
            family.root.title?.trim() ||
              family.root.titleFallback?.trim() ||
              "Untitled thread",
          ] as const),
        ),
      ),
    [unfilteredProjectGroups],
  );

  useEffect(() => {
    selectionAnchorRootId.current = null;
  }, [filterPreset, searchQuery, selectionMode, visibleRootOrderKey]);

  const changeSelectedRoot = (
    threadId: string,
    intent: RootSelectionIntent,
  ) => {
    setBulkMessage(null);
    setBulkOutcomes([]);
    const update = applyRootSelection({
      selectedRootIds,
      visibleEligibleRootIds: renderedSelectableRootIds(inboxRef.current),
      anchorRootId: selectionAnchorRootId.current,
      targetRootId: threadId,
      targetSelected: intent.selected,
      shiftKey: intent.shiftKey,
    });
    selectionAnchorRootId.current = update.anchorRootId;
    setSelectedRootIds(update.selectedRootIds);
  };

  const commitFamilyOrder = (
    projectId: string,
    order: readonly string[],
    announcement: string,
  ) => {
    const next = withProjectFamilyOrder(familyOrder, projectId, order);
    if (next === null || !writeFamilyOrder(next)) {
      setReorderAnnouncement("Thread family order could not be saved.");
      return;
    }
    setFamilyOrder(next);
    setReorderAnnouncement(announcement);
  };

  const projectOrderInputs = (projectId: string) => {
    const group = unfilteredProjectGroups.find(
      (candidate) => candidate.project.id === projectId,
    );
    if (group === undefined) return null;
    return {
      rootIds: group.families.map((family) => family.root.id),
      pinnedRootIds: group.families
        .filter((family) => family.root.isPinned)
        .map((family) => family.root.id),
    };
  };

  const announceRejectedMove = (result: FamilyMoveResult) => {
    if (result.ok) return;
    const messages: Record<Exclude<FamilyMoveResult, { ok: true }>["reason"], string> = {
      "cross-project": "Thread families cannot move between projects.",
      "incomplete-order": "Reordering requires the complete project order.",
      "invalid-id": "That reorder request was invalid.",
      "missing-root": "That thread family cannot move farther in this direction.",
      "pinned-boundary": "Pinned and unpinned thread families cannot cross.",
      "same-root": "Thread family order did not change.",
    };
    setReorderAnnouncement(messages[result.reason]);
  };

  const reorderByDrag = (input: {
    sourceProjectId: string;
    sourceRootId: string;
    targetProjectId: string;
    targetRootId: string;
    position: "before" | "after";
  }) => {
    if (!reorderEnabled) {
      setReorderAnnouncement(reorderDisabledReason ?? "Reordering is unavailable.");
      return;
    }
    const project = projectOrderInputs(input.targetProjectId);
    if (project === null) {
      setReorderAnnouncement("That project is no longer available.");
      return;
    }
    const result = moveProjectFamily({
      projectId: input.targetProjectId,
      ...input,
      ...project,
    });
    if (!result.ok) {
      announceRejectedMove(result);
      return;
    }
    commitFamilyOrder(
      input.targetProjectId,
      result.order,
      `Moved ${rootTitleById.get(input.sourceRootId) ?? "thread family"}.`,
    );
  };

  const reorderByKeyboard = (
    projectId: string,
    rootId: string,
    direction: -1 | 1,
  ) => {
    if (!reorderEnabled) {
      setReorderAnnouncement(reorderDisabledReason ?? "Reordering is unavailable.");
      return;
    }
    const project = projectOrderInputs(projectId);
    if (project === null) return;
    const result = keyboardFamilyMove(
      projectId,
      project.rootIds,
      project.pinnedRootIds,
      rootId,
      direction,
    );
    if (!result.ok) {
      announceRejectedMove(result);
      return;
    }
    commitFamilyOrder(
      projectId,
      result.order,
      `Moved ${rootTitleById.get(rootId) ?? "thread family"} ${direction < 0 ? "up" : "down"}.`,
    );
  };

  const commitProjectOrder = (
    order: readonly string[],
    announcement: string,
  ) => {
    if (!writeProjectOrder(order)) {
      setReorderAnnouncement("Project order could not be saved.");
      return;
    }
    setProjectOrder([...order]);
    setReorderAnnouncement(announcement);
  };

  const announceRejectedProjectMove = (result: ProjectMoveResult) => {
    if (result.ok) return;
    const messages: Record<Exclude<ProjectMoveResult, { ok: true }>["reason"], string> = {
      "incomplete-order": "Project reordering requires the complete project list.",
      "invalid-id": "That project reorder request was invalid.",
      "missing-project": "That project cannot move farther in this direction.",
      "same-project": "Project order did not change.",
    };
    setReorderAnnouncement(messages[result.reason]);
  };

  const reorderProjectByDrag = (input: {
    sourceProjectId: string;
    targetProjectId: string;
    position: "before" | "after";
  }) => {
    if (!reorderEnabled) {
      setReorderAnnouncement(reorderDisabledReason ?? "Reordering is unavailable.");
      return;
    }
    const result = moveProject({
      projectIds: unfilteredProjectGroups.map((group) => group.project.id),
      ...input,
    });
    if (!result.ok) {
      announceRejectedProjectMove(result);
      return;
    }
    commitProjectOrder(result.order, "Moved project.");
  };

  const reorderProjectByKeyboard = (projectId: string, direction: -1 | 1) => {
    if (!reorderEnabled) {
      setReorderAnnouncement(reorderDisabledReason ?? "Reordering is unavailable.");
      return;
    }
    const result = keyboardProjectMove(
      unfilteredProjectGroups.map((group) => group.project.id),
      projectId,
      direction,
    );
    if (!result.ok) {
      announceRejectedProjectMove(result);
      return;
    }
    const projectName = unfilteredProjectGroups.find(
      (group) => group.project.id === projectId,
    )?.project.name;
    commitProjectOrder(
      result.order,
      `Moved ${projectName ?? "project"} ${direction < 0 ? "up" : "down"}.`,
    );
  };

  const selectAllVisible = () => {
    selectionAnchorRootId.current = null;
    setBulkMessage(null);
    setBulkOutcomes([]);
    setSelectedRootIds((current) =>
      new Set([...current, ...selectableVisibleRootIds]),
    );
  };

  const cancelSelection = () => {
    selectionAnchorRootId.current = null;
    setSelectedRootIds(new Set());
    setSelectionMode(false);
    setBulkPreview(null);
    setBulkMessage(null);
    setBulkOutcomes([]);
  };

  const previewSelectedDeletion = async () => {
    if (selectedRootIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    setBulkMessage(null);
    setBulkOutcomes([]);
    try {
      const preview = await rpc.call("previewBulkDelete", {
        threadIds: [...selectedRootIds],
        protectedThreadId: activeThreadId,
      });
      if (preview.token === null) {
        setBulkMessage(
          `${preview.skipped.length} selected ${preview.skipped.length === 1 ? "family is" : "families are"} protected. Nothing can be deleted.`,
        );
        setBulkOutcomes(
          preview.skipped.map((entry) => ({
            id: entry.id,
            message: entry.message,
            failed: false,
          })),
        );
      } else {
        setBulkPreview(preview);
      }
    } catch (error) {
      setBulkMessage(errorMessage(error));
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmSelectedDeletion = async () => {
    const preview = bulkPreview;
    if (preview?.token == null || bulkBusy) return;
    setBulkBusy(true);
    try {
      const result = await rpc.call("confirmBulkDelete", {
        token: preview.token,
      });
      const remaining = new Set(selectedRootIds);
      for (const threadId of result.deleted) remaining.delete(threadId);
      setSelectedRootIds(remaining);
      selectionAnchorRootId.current = null;
      setBulkPreview(null);
      const skippedCount = preview.skipped.length + result.skipped.length;
      setBulkOutcomes([
        ...preview.skipped.map((entry) => ({
          id: entry.id,
          message: entry.message,
          failed: false,
        })),
        ...result.skipped.map((entry) => ({
          id: entry.id,
          message: entry.message,
          failed: false,
        })),
        ...result.failed.map((entry) => ({
          id: entry.id,
          message: entry.message,
          failed: true,
        })),
      ]);
      const summary = [
        result.deleted.length > 0
          ? `Deleted ${result.deleted.length}.`
          : "Deleted none.",
        skippedCount > 0 ? `${skippedCount} protected.` : "",
        result.failed.length > 0 ? `${result.failed.length} failed.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      setBulkMessage(summary);
      if (remaining.size === 0) setSelectionMode(false);
    } catch (error) {
      setBulkPreview(null);
      setBulkMessage(errorMessage(error));
      setBulkOutcomes([]);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div
      ref={inboxRef}
      data-dockside-palette={preferences.palettePreset}
      data-dockside-density={preferences.density}
      style={docksidePreferenceStyle(preferences) as CSSProperties}
      className="flex min-h-0 flex-1 flex-col"
    >
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {reorderAnnouncement}
      </output>
      <div className="shrink-0">
        <div className="flex h-8 items-center gap-2 px-2.5 pb-1 text-muted-foreground">
          <Icon name="Folder" className="size-3.5" aria-hidden />
          <span className="text-2xs font-semibold uppercase tracking-wider">
            Workspaces
          </span>
          <span className="tabular-nums text-2xs text-muted-foreground/70">
            {projectGroups.length}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
            {selectionMode ? null : (
              <FilterMenu value={filterPreset} onChange={setFilterPreset} />
            )}
            <button
              type="button"
              aria-label={
                selectionMode ? "Thread selection active" : "Select threads"
              }
              title={selectionMode ? "Thread selection active" : "Select threads"}
              disabled={selectionMode}
              onClick={() => {
                selectionAnchorRootId.current = null;
                setSelectionMode(true);
                setBulkMessage(null);
                setBulkOutcomes([]);
              }}
              className={cn(
                "flex size-6 items-center justify-center rounded-md text-muted-foreground",
                "hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
                selectionMode && "bg-primary/10 text-primary",
              )}
            >
              <Icon name="ListTodo" className="size-3.5" aria-hidden />
            </button>
          </span>
        </div>

        {selectionMode ? (
          <div className="flex h-8 items-center gap-1 border-y border-sidebar-border/70 px-2 text-2xs">
            <span id={selectionHintId} className="sr-only">
              Use Shift+click on another checkbox to select or deselect a range.
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {selectedRootIds.size} selected
            </span>
            <button
              type="button"
              disabled={selectableVisibleRootIds.length === 0}
              title={`${Math.max(0, visibleRootCount - selectableVisibleRootIds.length)} visible protected`}
              onClick={selectAllVisible}
              className="h-6 rounded px-1.5 font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              All
            </button>
            <button
              type="button"
              disabled={selectedRootIds.size === 0}
              onClick={() => {
                selectionAnchorRootId.current = null;
                setSelectedRootIds(new Set());
                setBulkMessage(null);
                setBulkOutcomes([]);
              }}
              className="h-6 rounded px-1.5 font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              aria-label={`Delete ${selectedRootIds.size} selected thread families`}
              title="Delete selected permanently"
              disabled={selectedRootIds.size === 0 || bulkBusy}
              onClick={() => void previewSelectedDeletion()}
              className="flex size-6 items-center justify-center rounded text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              <Icon
                name={bulkBusy ? "Loading" : "Trash"}
                className={cn("size-3.5", bulkBusy && "animate-spin")}
                aria-hidden
              />
            </button>
            <button
              type="button"
              aria-label="Cancel thread selection"
              title="Cancel selection"
              disabled={bulkBusy}
              onClick={cancelSelection}
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              <Icon name="CircleX" className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}

        {bulkMessage || bulkOutcomes.length > 0 ? (
          <div className="border-b border-sidebar-border/70 px-2.5 py-1 text-2xs leading-snug text-muted-foreground">
            {bulkMessage ? (
              <output aria-live="polite">{bulkMessage}</output>
            ) : null}
            {bulkOutcomes.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5" aria-label="Bulk delete outcomes">
                {bulkOutcomes.map((outcome) => (
                  <li
                    key={`${outcome.id}:${outcome.message}`}
                    className={cn(
                      "truncate",
                      outcome.failed && "text-destructive",
                    )}
                    title={`${rootTitleById.get(outcome.id) ?? outcome.id}: ${outcome.message}`}
                  >
                    <span className="font-medium text-foreground/80">
                      {rootTitleById.get(outcome.id) ?? outcome.id}
                    </span>
                    {`: ${outcome.message}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {status === "loading" ? null : status === "error" ? (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          <p role="status" className={EMPTY_STATE_CLASS}>
            Could not load threads.
          </p>
        ) : !lifecycle.shelvesReady ? null : visibleTotal === 0 ? (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          <p role="status" className={EMPTY_STATE_CLASS}>
            {searching ? "No threads found" : "No threads yet"}
          </p>
        ) : (
          <>
            {filterPreset === "status"
              ? statusGroups.map((group) => (
                  <StatusGroup
                    key={group.kind}
                    group={group}
                    providerInfoById={providerInfoById}
                    activeThreadId={activeThreadId}
                    forceExpanded={searching}
                    lifecycle={lifecycle}
                    onNavigate={onNavigate}
                    now={now}
                    selectionMode={selectionMode}
                    selectedRootIds={selectedRootIds}
                    selectionHintId={selectionHintId}
                    onToggleRoot={changeSelectedRoot}
                    preferences={preferences}
                  />
                ))
              : projectGroups.map((group) => (
              <ProjectGroup
                key={group.project.id}
                group={group}
                providerInfoById={providerInfoById}
                activeThreadId={activeThreadId}
                forceExpanded={searching}
                lifecycle={lifecycle}
                onNavigate={onNavigate}
                now={now}
                selectionMode={selectionMode}
                selectedRootIds={selectedRootIds}
                selectionHintId={selectionHintId}
                onToggleRoot={changeSelectedRoot}
                reorderEnabled={reorderEnabled}
                reorderDisabledReason={reorderDisabledReason}
                onReorder={reorderByDrag}
                onKeyboardMove={reorderByKeyboard}
                projectReorderEnabled={reorderEnabled}
                projectReorderDisabledReason={reorderDisabledReason}
                onProjectReorder={reorderProjectByDrag}
                onProjectKeyboardMove={reorderProjectByKeyboard}
                preferences={preferences}
                projectColorOverrides={projectColorOverrides}
              />
            ))}
            {showParkedShelves ? (
              <>
                <ParkedShelf
                  label="Snoozed"
                  threads={snoozed}
                  expanded={showSnoozed}
                  onToggle={() => setShowSnoozed((open) => !open)}
                  shelf="snoozed"
                  activeThreadId={activeThreadId}
                  lifecycle={lifecycle}
                  onNavigate={onNavigate}
                  now={now}
                />
                <ParkedShelf
                  label="Settled"
                  threads={settled}
                  pendingCount={pendingSettled}
                  expanded={showSettled}
                  onToggle={() => setShowSettled((open) => !open)}
                  shelf="settled"
                  activeThreadId={activeThreadId}
                  lifecycle={lifecycle}
                  onNavigate={onNavigate}
                  now={now}
                />
              </>
            ) : null}
          </>
        )}
      </div>

      <BulkDeleteDialog
        open={bulkPreview !== null}
        preview={bulkPreview}
        busy={bulkBusy}
        onCancel={() => setBulkPreview(null)}
        onConfirm={() => void confirmSelectedDeletion()}
      />
    </div>
  );
}

function ParkedShelf({
  label,
  threads,
  pendingCount = 0,
  expanded,
  onToggle,
  shelf,
  activeThreadId,
  lifecycle,
  onNavigate,
  now,
}: {
  label: string;
  threads: readonly PluginSidebarThread[];
  pendingCount?: number;
  expanded: boolean;
  onToggle: () => void;
  shelf: "snoozed" | "settled";
  activeThreadId: string | null;
  lifecycle: ReturnType<typeof useLifecycle>;
  onNavigate: () => void;
  now: number;
}) {
  const count = threads.length + pendingCount;
  if (count === 0) return null;
  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 flex w-full cursor-pointer items-center gap-2 px-2.5 pb-1 text-left"
      >
        <span className="text-2xs font-medium text-muted-foreground/70">
          {expanded ? label : `${label} (${count})`}
        </span>
        <span className="h-px flex-1 bg-sidebar-border" />
        <span className={TRAILING_GLYPH_BOX_CLASS}>
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 text-muted-foreground/70 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-px">
          {threads.map((thread) => (
            <SlimRow
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              shelf={shelf}
              wakeAt={lifecycle.wakeAtFor(thread)}
              now={now}
              onNavigate={onNavigate}
              onRestore={() =>
                shelf === "snoozed"
                  ? lifecycle.unsnooze(thread.id)
                  : lifecycle.unsettle(thread.id)
              }
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function renderedSelectableRootIds(root: HTMLDivElement | null): string[] {
  if (root === null) return [];
  return Array.from(
    root.querySelectorAll<HTMLInputElement>(
      "input[data-dockside-select-root]:not(:disabled)",
    ),
  ).flatMap((input) => {
    const rootId = input.dataset.docksideSelectRoot;
    return rootId && input.getClientRects().length > 0 ? [rootId] : [];
  });
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  return [...left].every((value) => right.has(value));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "string" &&
    error.error.trim()
  ) {
    return error.error;
  }
  return "Could not update the selected threads.";
}
