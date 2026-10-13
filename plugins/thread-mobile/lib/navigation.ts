export interface Thread {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  latestAttentionAt: number;
  isUnread: boolean;
  indicator: string;
}

const ACTIVE_INDICATORS = new Set([
  "runtime", "workflow", "background-agent", "background-command",
  "plan-mode", "goal", "waiting-for-input", "working-draft",
]);

/** BB's live sidebar projection already spans projects and excludes hidden work. */
export function navigationThreads<T extends Thread>(threads: readonly T[], currentId: string): T[] {
  const current = threads.find(thread => thread.id === currentId && !thread.isArchived);
  if (!current) return [];
  return threads.filter(thread => !thread.isArchived && (
    thread.id === currentId || thread.isUnread || ACTIVE_INDICATORS.has(thread.indicator)
  )).sort((a, b) =>
    b.latestAttentionAt - a.latestAttentionAt ||
    b.updatedAt - a.updatedAt ||
    b.createdAt - a.createdAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function neighbor(threads: readonly Thread[], currentId: string, direction: -1 | 1): string | null {
  const index = threads.findIndex(thread => thread.id === currentId);
  return index < 0 ? null : threads[index + direction]?.id ?? null;
}

export function titleFor(thread: Thread | undefined): string {
  return thread?.title?.trim() || thread?.titleFallback?.trim() || "Untitled thread";
}

export function statusFor(thread: { indicator: string; indicatorLabel: string | null } | undefined): string {
  if (!thread) return "Status unavailable";
  if (thread.indicator === "none") return "Idle";
  return thread.indicatorLabel?.trim() || "Status unavailable";
}

export function statusIconFor(indicator: string | undefined) {
  switch (indicator) {
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal": return "working";
    case "waiting-for-input": return "waiting";
    case "unread-error": return "error";
    case "unread-success": return "unread";
    case "draft":
    case "working-draft": return "draft";
    case "none": return "idle";
    default: return "unknown";
  }
}

const PROJECT_COLORS = [
  "#2563EB", "#7C3AED", "#C026D3", "#DB2777", "#DC2626", "#EA580C",
  "#CA8A04", "#16A34A", "#059669", "#0891B2", "#0284C7", "#4F46E5",
] as const;

export function projectBadge(projectId: string, projectName: string | undefined) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < projectId.length; index += 1) {
    hash ^= projectId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const name = projectName?.trim() || "Unknown project";
  const color = PROJECT_COLORS[(hash >>> 0) % PROJECT_COLORS.length];
  const channels = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  const luminance = channels.map(channel =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return {
    color,
    foreground: (luminance > 0.38 ? "#000000" : "#FFFFFF") as "#000000" | "#FFFFFF",
    letter: name.charAt(0).toLocaleUpperCase() || "?",
    name,
  };
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
