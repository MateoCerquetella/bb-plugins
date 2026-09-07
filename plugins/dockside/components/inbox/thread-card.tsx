import {
  useId,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { RowContextMenu } from "@/components/inbox/row-context-menu";
import {
  ProviderGlyph,
  type ProviderGlyphInfo,
} from "@/components/inbox/provider-glyph";
import { StatusGlyph } from "@/components/inbox/status-glyph";
import { threadStatus } from "@/components/inbox/status-slot";
import { PullRequestMetadata } from "@/components/inbox/row-metadata";
import {
  FamilyStatusBadge,
  FamilyStatusIcon,
} from "@/components/inbox/family-status";
import { familyWaitingForAgents } from "@/lib/attention-state";
import { familyStatus } from "@/lib/family-status";
import { threadDisplayTitle, threadIsWorking } from "@/lib/inbox";
import { resolveFamilyExpanded } from "@/lib/thread-management";
import type { RootSelectionIntent } from "@/lib/thread-management";
import type { DocksidePreferences } from "@/lib/preferences";
import { relativeTimeLabel } from "@/lib/relative-time";
import { resolveSnoozePresets } from "@/lib/lifecycle";

export function ThreadCard({
  thread,
  childThreads,
  providerInfoById,
  activeThreadId,
  canPark,
  forceExpanded,
  onNavigate,
  onSettle,
  onSnooze,
  now,
  selectionMode,
  selected,
  selectionDisabledReason,
  selectionHintId,
  onToggleSelected,
  reorderEnabled,
  reorderDisabledReason,
  onMoveByKeyboard,
  onReorderDragStart,
  onReorderDragOver,
  onReorderDrop,
  preferences,
  leadingVisual = "status",
}: {
  thread: PluginSidebarThread;
  childThreads: readonly PluginSidebarThread[];
  providerInfoById: ReadonlyMap<string, ProviderGlyphInfo>;
  activeThreadId: string | null;
  /** False while the root is working or blocked on the user. */
  canPark: boolean;
  /** Search results reveal their matching descendants. */
  forceExpanded: boolean;
  onNavigate: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  /** Quantized clock, shared by every row in one render. */
  now: number;
  selectionMode: boolean;
  selected: boolean;
  selectionDisabledReason: string | null;
  selectionHintId: string;
  onToggleSelected: (intent: RootSelectionIntent) => void;
  reorderEnabled: boolean;
  reorderDisabledReason: string | null;
  onMoveByKeyboard: (direction: -1 | 1) => void;
  onReorderDragStart: (event: DragEvent<HTMLSpanElement>) => void;
  onReorderDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onReorderDrop: (event: DragEvent<HTMLLIElement>) => void;
  preferences: DocksidePreferences;
  /** Status views put semantic state on the section and provider identity on rows. */
  leadingVisual?: "status" | "provider";
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);
  const childListId = useId();
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );

  const familyIsActive =
    thread.id === activeThreadId ||
    childThreads.some((child) => child.id === activeThreadId);
  const childNeedsAttention = childThreads.some(
    (child) =>
      child.hasPendingInteraction ||
      child.isUnread ||
      threadIsWorking(child),
  );
  const expanded = resolveFamilyExpanded({
    childCount: childThreads.length,
    forceExpanded,
    override: expandedOverride,
    defaultExpanded: preferences.defaultChildrenExpanded,
  });
  const waitingForAgents = familyWaitingForAgents(childThreads);
  const childProviderIds = useMemo(
    () => [...new Set(childThreads.map((child) => child.providerId))].slice(0, 2),
    [childThreads],
  );
  const childProviderNames = childProviderIds
    .map(
      (providerId) =>
        providerInfoById.get(providerId)?.displayName ?? providerId,
    )
    .join(", ");
  const childDisclosureLabel = `${expanded ? "Hide" : "Show"} ${childThreads.length} child${childThreads.length === 1 ? " thread" : " threads"}${childProviderNames ? `; providers: ${childProviderNames}` : ""}`;
  const rootIsActive = thread.id === activeThreadId;
  const familyState = familyStatus([thread, ...childThreads], now);

  return (
    <RowContextMenu thread={thread}>
      <li
        className="list-none"
        data-dockside-family={thread.id}
        onDragOver={onReorderDragOver}
        onDrop={onReorderDrop}
      >
        <div
          className={cn(
            "rounded-xl border transition-colors",
            expanded
              ? "border-sidebar-border bg-sidebar-accent/35 py-1"
              : "border-transparent",
            familyIsActive && "bg-sidebar-accent/60",
            !familyIsActive && layout !== null && "bg-sidebar-accent/25",
          )}
        >
          <div
            data-dockside-root-card=""
            className={cn(
              "group/root relative grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[1rem_1rem] items-center gap-x-2 gap-y-0.5 rounded-lg px-2",
              preferences.density === "compact"
                ? "min-h-10 py-1"
                : "min-h-12 py-1.5",
              rootIsActive
                ? "bg-sidebar-accent"
                : "hover:bg-sidebar-accent/60",
            )}
          >
            {selectionMode ? (
              <button
                type="button"
                data-dockside-selection-target={thread.id}
                aria-label={
                  selectionDisabledReason === null
                    ? `${selected ? "Deselect" : "Select"} ${threadDisplayTitle(thread)}`
                    : `${threadDisplayTitle(thread)} cannot be selected: ${selectionDisabledReason}`
                }
                aria-pressed={
                  selectionDisabledReason === null ? selected : undefined
                }
                aria-describedby={
                  selectionDisabledReason === null ? selectionHintId : undefined
                }
                title={
                  selectionDisabledReason ?? "Shift+click to select a range"
                }
                disabled={selectionDisabledReason !== null}
                onClick={(event) => {
                  onToggleSelected({
                    selected: !selected,
                    shiftKey: event.shiftKey,
                  });
                }}
                className={cn(
                  "absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selectionDisabledReason === null
                    ? "cursor-pointer"
                    : "cursor-not-allowed",
                )}
              />
            ) : (
              <>
                {/* The shortcut/split contract requires an anchor, while the
                    controls remain sibling buttons above it. */}
                {/* oxlint-disable-next-line jsx-a11y/anchor-is-valid -- bb's
                    shortcut and split-drag contracts require an anchor. */}
                <a
                  data-sidebar-thread-shortcut-target=""
                  data-sidebar-thread-id={thread.id}
                  href="#"
                  aria-label={threadDisplayTitle(thread)}
                  aria-current={rootIsActive ? "page" : undefined}
                  {...splitProps}
                  onClick={(event) => {
                    event.preventDefault();
                    actions.open(thread.id, {
                      split: event.metaKey || event.ctrlKey,
                    });
                    onNavigate();
                  }}
                  className="absolute inset-0 cursor-pointer rounded-lg"
                />
              </>
            )}

            {selectionMode ? (
              <input
                type="checkbox"
                checked={selected}
                data-dockside-select-root={thread.id}
                aria-label={
                  selectionDisabledReason === null
                    ? `${selected ? "Deselect" : "Select"} ${threadDisplayTitle(thread)}`
                    : `${threadDisplayTitle(thread)} cannot be selected: ${selectionDisabledReason}`
                }
                aria-describedby={
                  selectionDisabledReason === null ? selectionHintId : undefined
                }
                title={
                  selectionDisabledReason ?? "Shift+click to select a range"
                }
                disabled={selectionDisabledReason !== null}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onChange={(event) => {
                  onToggleSelected({
                    selected: event.currentTarget.checked,
                    shiftKey:
                      "shiftKey" in event.nativeEvent &&
                      event.nativeEvent.shiftKey === true,
                  });
                }}
                className={cn(
                  "relative z-10 col-start-1 row-start-1 size-4 shrink-0 cursor-pointer rounded border accent-primary transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selectionDisabledReason !== null &&
                    "cursor-not-allowed opacity-35",
                )}
              />
            ) : null}

            {selectionMode ? null : leadingVisual === "provider" ? (
              <ProviderGlyph
                providerId={thread.providerId}
                provider={providerInfoById.get(thread.providerId)}
                className="col-start-1 row-start-1 size-5"
              />
            ) : (
              <FamilyStatusIcon
                status={familyState}
                className="col-start-1 row-start-1"
                draggable={reorderEnabled}
                reorderHelp={
                  reorderEnabled
                    ? "Drag this status icon to reorder. Press Alt+Up or Alt+Down to move the family."
                    : (reorderDisabledReason ?? "Reordering is unavailable.")
                }
                onDragStart={(event) => {
                  event.stopPropagation();
                  if (!reorderEnabled) {
                    event.preventDefault();
                    return;
                  }
                  onReorderDragStart(event);
                }}
                onKeyDown={(event) => {
                  if (!event.altKey) return;
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveByKeyboard(event.key === "ArrowUp" ? -1 : 1);
                  }
                }}
              />
            )}

            <div className="pointer-events-none relative col-start-2 row-span-2 min-w-0">
              <div
                data-dockside-root-title-row=""
                className="flex h-4 min-w-0 items-center gap-1.5"
              >
                <span
                  title={threadDisplayTitle(thread)}
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    thread.isUnread ? "font-semibold" : "font-medium",
                    !familyState.receded
                      ? "text-foreground"
                      : "text-muted-foreground/65",
                  )}
                >
                  {threadDisplayTitle(thread)}
                </span>
                {thread.isPinned ? (
                  <Icon
                    name="Pin"
                    aria-label="Pinned thread"
                    className="size-3 shrink-0 text-muted-foreground/70"
                  />
                ) : null}
              </div>
              <div
                data-dockside-root-detail-row=""
                className={cn(
                  "mt-0.5 flex h-4 min-w-0 items-center gap-1.5 text-2xs",
                  familyState.receded
                    ? "text-muted-foreground/55"
                    : "text-muted-foreground",
                )}
              >
                <ThreadLocation thread={thread} />
              </div>
            </div>

            <div
              className={cn(
                "relative z-10 col-start-3 row-span-2 flex shrink-0 flex-col items-end gap-0.5",
                selectionMode && "pointer-events-none",
              )}
            >
              <span
                data-dockside-root-time=""
                className={cn(
                  "flex h-4 items-center justify-end",
                  canPark && !selectionMode && "group-hover/root:hidden",
                )}
              >
                {preferences.showRelativeTime ? (
                  <ThreadStatusLabel thread={thread} now={now} />
                ) : null}
              </span>
              {canPark && !selectionMode ? (
                <span className="hidden h-4 items-center gap-0.5 group-hover/root:flex">
                  <ParkButton
                    label="Snooze until tomorrow"
                    icon="Clock"
                    onActivate={() => {
                      const tomorrow = resolveSnoozePresets(new Date()).find(
                        (preset) => preset.id === "tomorrow",
                      );
                      if (tomorrow) onSnooze(tomorrow.snoozedUntil);
                    }}
                  />
                  <ParkButton
                    label="Settle thread"
                    icon="Archive"
                    onActivate={onSettle}
                  />
                </span>
              ) : null}
              <div
                data-dockside-root-metadata=""
                className="flex h-4 max-w-full items-center justify-end gap-1 whitespace-nowrap"
              >
                {preferences.showPullRequestMetadata && pullRequest ? (
                  <PullRequestMetadata
                    pullRequest={pullRequest}
                    interactive={!selectionMode}
                  />
                ) : null}
                {childThreads.length > 0 ? (
                  <button
                    type="button"
                    aria-label={
                      selectionMode
                        ? `${childThreads.length} child threads; exit selection mode to ${expanded ? "hide" : "show"}${childProviderNames ? `; providers: ${childProviderNames}` : ""}`
                        : childDisclosureLabel
                    }
                    aria-expanded={expanded}
                    aria-controls={childListId}
                    disabled={selectionMode}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExpandedOverride(!expanded);
                    }}
                    className={cn(
                      "group/children relative flex h-4 items-center gap-0.5 rounded px-0.5 text-2xs font-medium text-muted-foreground",
                      "hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      selectionMode && "pointer-events-none",
                      childNeedsAttention && "text-primary",
                    )}
                  >
                    <Icon
                      name="ChevronDown"
                      className={cn(
                        "size-3 transition-transform",
                        expanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                    <span className="tabular-nums">{childThreads.length}</span>
                    {preferences.showProviderIcons ? (
                      <span className="flex items-center -space-x-0.5">
                        {childProviderIds.map((providerId) => (
                          <ProviderGlyph
                            key={providerId}
                            providerId={providerId}
                            provider={providerInfoById.get(providerId)}
                            className="size-3 opacity-80"
                            interactive={false}
                          />
                        ))}
                      </span>
                    ) : null}
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full right-0 z-30 mb-1 w-max max-w-56 translate-y-0.5 rounded-md border border-border bg-popover px-2 py-1.5 text-2xs leading-tight text-popover-foreground opacity-0 shadow-md transition-all group-hover/children:translate-y-0 group-hover/children:opacity-100 group-focus-visible/children:translate-y-0 group-focus-visible/children:opacity-100"
                    >
                      {childDisclosureLabel}
                    </span>
                  </button>
                ) : preferences.showProviderIcons && leadingVisual === "status" ? (
                  <ProviderGlyph
                    providerId={thread.providerId}
                    provider={providerInfoById.get(thread.providerId)}
                    className="size-3 opacity-75"
                  />
                ) : null}
                <FamilyStatusBadge status={familyState} />
              </div>
            </div>
          </div>

          {expanded ? (
            <ul
              id={childListId}
              aria-label={`Agents for ${threadDisplayTitle(thread)}`}
              className={cn(
                "ml-[14px] border-l pb-0.5 pl-3 transition-colors",
                waitingForAgents
                  ? "border-current"
                  : "border-sidebar-border",
              )}
              style={
                waitingForAgents
                  ? { borderColor: "var(--dockside-status-working)" }
                  : undefined
              }
            >
              {childThreads.map((child) => (
                <ChildThreadRow
                  key={child.id}
                  thread={child}
                  provider={providerInfoById.get(child.providerId)}
                  isActive={child.id === activeThreadId}
                  onNavigate={onNavigate}
                  now={now}
                  preferences={preferences}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </li>
    </RowContextMenu>
  );
}

function ChildThreadRow({
  thread,
  provider,
  isActive,
  onNavigate,
  now,
  preferences,
}: {
  thread: PluginSidebarThread;
  provider?: ProviderGlyphInfo;
  isActive: boolean;
  onNavigate: () => void;
  now: number;
  preferences: DocksidePreferences;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const status = threadStatus(thread);
  const isWorking = threadIsWorking(thread);

  return (
    <RowContextMenu thread={thread}>
      <li className="relative list-none py-px">
        <span
          aria-hidden
          className={cn(
            "absolute -left-3 top-1/2 h-px w-3 transition-colors",
            !isWorking && "bg-sidebar-border",
          )}
          style={
            isWorking
              ? { backgroundColor: "var(--dockside-status-working)" }
              : undefined
          }
        />
        <div
          className={cn(
            "group/child relative flex items-start gap-1.5 rounded-md px-1.5",
            preferences.density === "compact"
              ? "min-h-9 py-0.5"
              : "min-h-10 py-1",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            !isActive && layout !== null && "bg-sidebar-accent/25",
          )}
        >
          {/* oxlint-disable-next-line jsx-a11y/anchor-is-valid -- bb's
              shortcut and split-drag contracts require an anchor. */}
          <a
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            href="#"
            aria-label={threadDisplayTitle(thread)}
            aria-current={isActive ? "page" : undefined}
            {...splitProps}
            onClick={(event) => {
              event.preventDefault();
              actions.open(thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onNavigate();
            }}
            className="absolute inset-0 cursor-pointer rounded-md"
          />
          {preferences.showProviderIcons ? (
            <ProviderGlyph
              providerId={thread.providerId}
              provider={provider}
              className="relative mt-0.5"
            />
          ) : null}
          <ThreadStateGlyph thread={thread} className="relative mt-0.5" />
          <div className="pointer-events-none relative min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                title={threadDisplayTitle(thread)}
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  thread.isUnread
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {threadDisplayTitle(thread)}
              </span>
              {preferences.showRelativeTime ? (
                <span className="shrink-0 tabular-nums text-2xs text-muted-foreground/70">
                  {relativeTimeLabel(thread.updatedAt, now)}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex h-3.5 min-w-0 items-center gap-1.5 text-2xs">
              <ThreadLocation thread={thread} />
            </div>
          </div>
        </div>
      </li>
    </RowContextMenu>
  );
}

function ThreadStateGlyph({
  thread,
  className,
}: {
  thread: PluginSidebarThread;
  className?: string;
}) {
  const status = threadStatus(thread);
  const label =
    status === null
      ? "Inactive: no active work in this child thread"
      : `${thread.indicatorLabel ?? status.label}: child thread status`;

  const glyph =
    status === null ? (
      <span
        aria-hidden
        className="size-2 rounded-full opacity-50"
        style={{
          backgroundColor:
            "var(--dockside-status-inactive, var(--muted-foreground))",
        }}
      />
    ) : (
      <StatusGlyph indicator={status.indicator} label={null} />
    );

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      tabIndex={0}
      className={cn(
        "group/child-status flex size-3.5 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      {glyph}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 w-max max-w-56 translate-y-0.5 rounded-md border border-border bg-popover px-2 py-1.5 text-2xs leading-tight text-popover-foreground opacity-0 shadow-md transition-all group-hover/child-status:translate-y-0 group-hover/child-status:opacity-100 group-focus-visible/child-status:translate-y-0 group-focus-visible/child-status:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

function ThreadStatusLabel({
  thread,
  now,
}: {
  thread: PluginSidebarThread;
  now: number;
}) {
  return (
    <span className="tabular-nums text-2xs text-muted-foreground/70">
      {relativeTimeLabel(thread.updatedAt, now)}
    </span>
  );
}

function ThreadLocation({ thread }: { thread: PluginSidebarThread }) {
  const branch = thread.environment?.branchName;
  if (branch) {
    return (
      <span
        title={`Branch: ${branch}`}
        className="flex min-w-0 flex-1 items-center gap-1 truncate text-muted-foreground"
      >
        <Icon
          name="GitBranch"
          aria-label="Branch"
          className="size-3 shrink-0 text-muted-foreground/60"
        />
        <span className="truncate font-mono">{branch}</span>
      </span>
    );
  }
  if (thread.host) {
    return (
      <span
        title={`Host: ${thread.host.name}`}
        className="min-w-0 flex-1 truncate text-muted-foreground"
      >
        {thread.host.name}
      </span>
    );
  }
  return <span className="flex-1" />;
}

function ParkButton({
  label,
  icon,
  onActivate,
}: {
  label: string;
  icon: Extract<IconName, "Archive" | "Clock">;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}
