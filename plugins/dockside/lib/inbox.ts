import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@bb/plugin-sdk";

export interface ThreadFamily {
  root: PluginSidebarThread;
  /** Every visible descendant, oldest first, flattened for the compact tree. */
  children: PluginSidebarThread[];
}

export interface ProjectThreadGroup {
  project: PluginSidebarProject;
  families: ThreadFamily[];
}

/**
 * The sort that defines this sidebar: newest thread on top, and NOTHING moves
 * it afterwards. Activity never re-orders the list, so a row holds its place
 * from creation until you park it and the screen only changes when you act.
 * Status is carried by the card, not by position.
 *
 * Ties break on id so the order is total and stable across renders.
 */
export function sortByCreatedAtDescending<
  T extends { readonly id: string; readonly createdAt: number },
>(threads: readonly T[]): T[] {
  return [...threads].sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );
}

export function threadDisplayTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}

/** Every live-work signal bb exposes for a sidebar row. */
export function threadIsWorking(thread: PluginSidebarThread): boolean {
  const { activity } = thread;
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0 ||
    thread.indicator === "runtime" ||
    thread.indicator === "working-draft"
  );
}

/** Substring match on the visible title only, preserving the incoming order. */
export function searchThreadsByTitle(
  threads: readonly PluginSidebarThread[],
  query: string,
): PluginSidebarThread[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...threads];
  return threads.filter((thread) =>
    threadDisplayTitle(thread).toLowerCase().includes(normalized),
  );
}

export interface ProjectScope {
  /** Project id, or null for "all projects". */
  id: string | null;
  name: string;
}

/** Threads in the chosen scope; every thread when the scope is null. */
export function filterByProject(
  threads: readonly PluginSidebarThread[],
  projectId: string | null,
): PluginSidebarThread[] {
  if (projectId === null) return [...threads];
  return threads.filter((thread) => thread.projectId === projectId);
}

/**
 * Turn a flat sidebar result into the two stable levels people navigate by:
 * project, then root thread. Descendants stay attached to their oldest visible
 * ancestor and are flattened into one compact agent list.
 *
 * A parent that is not in `threads` (parked, archived, filtered, or deleted)
 * cannot own a visible row, so its child becomes a root instead of vanishing.
 * Project order comes from bb; roots keep the inbox's static creation order,
 * with the user's pinned roots first.
 */
export function groupThreadsByProject(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
): ProjectThreadGroup[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectOrder = new Map(
    projects.map((project, index) => [project.id, index]),
  );
  const threadsByProject = new Map<string, PluginSidebarThread[]>();

  for (const thread of threads) {
    const bucket = threadsByProject.get(thread.projectId) ?? [];
    bucket.push(thread);
    threadsByProject.set(thread.projectId, bucket);
  }

  const groups: ProjectThreadGroup[] = [];
  for (const [projectId, projectThreads] of threadsByProject) {
    const threadById = new Map(
      projectThreads.map((thread) => [thread.id, thread]),
    );
    const familyByRootId = new Map<string, ThreadFamily>();

    for (const thread of projectThreads) {
      const root = visibleRootOf(thread, threadById);
      let family = familyByRootId.get(root.id);
      if (family === undefined) {
        family = { root, children: [] };
        familyByRootId.set(root.id, family);
      }
      if (thread.id !== root.id) family.children.push(thread);
    }

    const families = [...familyByRootId.values()];
    for (const family of families) {
      family.children.sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      );
    }
    families.sort((left, right) => {
      const pinOrder = Number(right.root.isPinned) - Number(left.root.isPinned);
      if (pinOrder !== 0) return pinOrder;
      return (
        right.root.createdAt - left.root.createdAt ||
        left.root.id.localeCompare(right.root.id)
      );
    });

    groups.push({
      project:
        projectById.get(projectId) ??
        ({
          id: projectId,
          name: "Other project",
          isPersonal: false,
        } satisfies PluginSidebarProject),
      families,
    });
  }

  return groups.sort((left, right) => {
    const leftOrder = projectOrder.get(left.project.id);
    const rightOrder = projectOrder.get(right.project.id);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (
        (leftOrder ?? Number.MAX_SAFE_INTEGER) -
        (rightOrder ?? Number.MAX_SAFE_INTEGER)
      );
    }
    return left.project.name.localeCompare(right.project.name);
  });
}

/**
 * Search without throwing away hierarchy. A matching child keeps its parent
 * visible as context; a matching parent keeps all of its children visible.
 */
export function searchProjectThreadGroups(
  groups: readonly ProjectThreadGroup[],
  query: string,
): ProjectThreadGroup[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return groups.filter((group) => group.families.length > 0);
  }

  return groups.flatMap((group) => {
    const projectMatches = group.project.name.toLowerCase().includes(normalized);
    const families = group.families.flatMap((family) => {
      const rootMatches = threadDisplayTitle(family.root)
        .toLowerCase()
        .includes(normalized);
      if (projectMatches || rootMatches) return [family];
      const children = family.children.filter((thread) =>
        threadDisplayTitle(thread).toLowerCase().includes(normalized),
      );
      return children.length > 0 ? [{ ...family, children }] : [];
    });
    return families.length > 0 ? [{ ...group, families }] : [];
  });
}

function visibleRootOf(
  thread: PluginSidebarThread,
  threadById: ReadonlyMap<string, PluginSidebarThread>,
): PluginSidebarThread {
  let current = thread;
  const visited = new Set([thread.id]);
  while (current.parentThreadId !== null) {
    const parent = threadById.get(current.parentThreadId);
    if (
      parent === undefined ||
      parent.projectId !== thread.projectId ||
      visited.has(parent.id)
    ) {
      break;
    }
    visited.add(parent.id);
    current = parent;
  }
  return current;
}

/**
 * Archived threads never belong in the inbox — except the ones this plugin
 * parked, which it archives itself.
 *
 * Settling a thread archives it in bb, so leaving the flag alone to decide
 * visibility would empty the settled shelf the instant anything landed on it.
 * A parked row is the plugin saying "I put it there", and that outranks the
 * archive it set.
 */
export function visibleInboxThreads(
  threads: readonly PluginSidebarThread[],
  parkedThreadIds: ReadonlySet<string>,
): PluginSidebarThread[] {
  return threads.filter(
    (thread) => !thread.isArchived || parkedThreadIds.has(thread.id),
  );
}

/** Pinned first (they are the user's own ordering), then the static sort. */
export function partitionPinned(threads: readonly PluginSidebarThread[]): {
  pinned: PluginSidebarThread[];
  inbox: PluginSidebarThread[];
} {
  const pinned: PluginSidebarThread[] = [];
  const inbox: PluginSidebarThread[] = [];
  for (const thread of threads) {
    (thread.isPinned ? pinned : inbox).push(thread);
  }
  return { pinned, inbox };
}

/**
 * Child threads leave the flat list and live in their parent's header chip
 * instead — a flat inbox has nowhere to nest them.
 *
 * A child is only hidden when its parent is actually on screen. An orphan
 * (parent archived, deleted, or filtered out by the project scope) stays in
 * the list, because hiding it would make it unreachable everywhere.
 */
export function hideChildrenOfVisibleParents(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  const visibleIds = new Set(threads.map((thread) => thread.id));
  return threads.filter(
    (thread) =>
      thread.parentThreadId === null || !visibleIds.has(thread.parentThreadId),
  );
}

/**
 * The parent of one thread, or null when the thread is a root, when the id is
 * unknown, or when the parent row is gone (deleted). The parent may be
 * archived or in another project: the flat list hides those, but the child
 * still needs a way back to them.
 */
export function parentOf(
  threads: readonly PluginSidebarThread[],
  threadId: string,
): PluginSidebarThread | null {
  const thread = threads.find((candidate) => candidate.id === threadId);
  const parentThreadId = thread?.parentThreadId;
  if (!parentThreadId) return null;
  return threads.find((candidate) => candidate.id === parentThreadId) ?? null;
}

/** The children of one thread, oldest first (the order they were spawned). */
export function childrenOf(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
): PluginSidebarThread[] {
  return threads
    .filter((thread) => thread.parentThreadId === parentThreadId)
    .sort((left, right) => left.createdAt - right.createdAt);
}
