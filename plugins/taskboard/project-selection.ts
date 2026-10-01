import type { TrackerProject } from './contract.js';

export interface NavigationEntryLike {
  index: number;
  url: string;
}

export interface ProjectRouteContext {
  projectId: string;
  threadId: string | null;
}

export type ContextSelectableRoute =
  | { kind: 'root' }
  | { kind: 'all' }
  | { kind: 'project'; projectId: string }
  | { kind: 'manage'; projectId: string | null }
  | { kind: 'item'; projectId: string }
  | { kind: 'worker'; projectId: string };

function decodedSegment(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function projectRouteContext(
  rawUrl: string,
  expectedOrigin: string
): ProjectRouteContext | null {
  let url: URL;
  try {
    url = new URL(rawUrl, expectedOrigin);
  } catch {
    return null;
  }
  if (url.origin !== expectedOrigin) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'projects') return null;
  const projectId = decodedSegment(segments[1]);
  if (!projectId) return null;
  const threadId =
    segments[2] === 'threads' ? decodedSegment(segments[3]) : null;
  return { projectId, threadId };
}

export function previousProjectRouteContext(
  entries: readonly NavigationEntryLike[],
  currentIndex: number,
  expectedOrigin: string
): ProjectRouteContext | null {
  const previous = entries.find(entry => entry.index === currentIndex - 1);
  return previous
    ? projectRouteContext(previous.url, expectedOrigin)
    : null;
}

export function availableContextProjectId(
  projects: readonly TrackerProject[] | undefined,
  contextProjectId: string | null
): string | null {
  if (!projects || !contextProjectId) return null;
  return projects.some(project => project.id === contextProjectId)
    ? contextProjectId
    : null;
}

export function contextSelectionToken(
  threadId: string | null,
  contextProjectId: string | null,
  availableProjectId: string | null
): string {
  return [
    availableProjectId === null ? 'unavailable' : 'available',
    threadId ?? 'no-thread',
    contextProjectId ?? 'no-project'
  ].join(':');
}

export function shouldApplyContextProject(
  route: ContextSelectableRoute
): boolean {
  return route.kind === 'root' || (route.kind === 'manage' && !route.projectId);
}
