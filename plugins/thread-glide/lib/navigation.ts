export interface Thread {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  isArchived: boolean;
  createdAt: number;
}

/** BB's visible sidebar projection already excludes hidden work. */
export function navigationThreads<T extends Thread>(threads: readonly T[], currentId: string): T[] {
  const current = threads.find(thread => thread.id === currentId && !thread.isArchived);
  if (!current) return [];
  return threads.filter(thread =>
    thread.projectId === current.projectId && !thread.isArchived &&
    (thread.parentThreadId === null || thread.id === currentId)
  ).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function neighbor(threads: readonly Thread[], currentId: string, direction: -1 | 1): string | null {
  const index = threads.findIndex(thread => thread.id === currentId);
  return index < 0 ? null : threads[index + direction]?.id ?? null;
}

export function titleFor(thread: Thread | undefined): string {
  return thread?.title?.trim() || thread?.titleFallback?.trim() || "Untitled thread";
}

export interface Gesture { id: number; x: number; y: number; cancelled: boolean }
export function updateGesture(start: Gesture, x: number, y: number): Gesture {
  return { ...start, cancelled: start.cancelled || Math.abs(y - start.y) > 20 };
}
export function swipeDirection(start: Gesture, id: number, x: number, y: number): -1 | 1 | null {
  const dx = x - start.x, dy = y - start.y;
  if (start.cancelled || start.id !== id || Math.abs(dy) > 20 || Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy) * 2) return null;
  return dx < 0 ? 1 : -1;
}
