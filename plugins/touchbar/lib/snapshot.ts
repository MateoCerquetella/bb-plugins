export const SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CARD_LIMIT = 24;
export const MAX_CARD_LIMIT = 24;
export const THREAD_QUERY_LIMIT = 200;

export type CompactStatus =
  | "active"
  | "error"
  | "idle"
  | "stopping"
  | "waiting";

export type AttentionKind = "connection" | "error" | "input" | "unread";

export interface ThreadSnapshotInput {
  archivedAt: number | null;
  deletedAt: number | null;
  hasPendingInteraction: boolean;
  id: string;
  lastReadAt: number | null;
  latestAttentionAt: number;
  projectId: string;
  providerId: string;
  runtime: {
    displayStatus:
      | "active"
      | "error"
      | "host-reconnecting"
      | "idle"
      | "provisioning"
      | "starting"
      | "stopping"
      | "waiting-for-host";
  };
  status: "active" | "error" | "idle" | "starting" | "stopping";
  title: string | null;
  titleFallback: string | null;
  updatedAt: number;
  visibility: "hidden" | "visible";
}

export interface TouchBarThread {
  id: string;
  title: string;
  status: CompactStatus;
  providerId: string;
  project: string;
  updatedAtMs: number;
  unread: boolean;
  attention: AttentionKind | null;
}

export interface TouchBarSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  generatedAtMs: number;
  summary: {
    active: number;
    attention: number;
    visible: number;
  };
  threads: TouchBarThread[];
  usage?: TouchBarUsage[];
}

export interface TouchBarUsage {
  id: "codex" | "claudeCode" | "cursor";
  name: string;
  status: "ok" | "not_installed" | "unauthenticated" | "expired" | "error";
  usedPercent: number | null;
  windowLabel: string | null;
}

export interface SnapshotOptions {
  cardLimit: number;
  includeHidden: boolean;
  nowMs?: number;
  projectNames?: ReadonlyMap<string, string>;
}

export function resolveCardLimit(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CARD_LIMIT;
  return Math.min(MAX_CARD_LIMIT, Math.max(1, parsed));
}

export function compactText(
  value: string | null | undefined,
  fallback: string,
  maxLength: number,
): string {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const text = normalized === "" ? fallback : normalized;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function compactStatus(
  input: ThreadSnapshotInput,
): CompactStatus {
  switch (input.runtime.displayStatus) {
    case "error":
      return "error";
    case "active":
    case "provisioning":
    case "starting":
      return "active";
    case "stopping":
      return "stopping";
    case "host-reconnecting":
    case "waiting-for-host":
      return "waiting";
    case "idle":
      return "idle";
  }
}

export function isUnread(input: ThreadSnapshotInput): boolean {
  return (
    input.latestAttentionAt > 0 &&
    (input.lastReadAt === null || input.latestAttentionAt > input.lastReadAt)
  );
}

export function attentionKind(
  input: ThreadSnapshotInput,
  status = compactStatus(input),
): AttentionKind | null {
  if (input.hasPendingInteraction) return "input";
  if (status === "error") return "error";
  if (status === "waiting") return "connection";
  if (status === "idle" && isUnread(input)) return "unread";
  return null;
}

function priority(thread: TouchBarThread): number {
  if (thread.attention === "input") return 0;
  if (thread.attention === "error") return 1;
  if (thread.attention === "unread") return 2;
  if (thread.status === "active") return 3;
  if (thread.status === "stopping") return 4;
  if (thread.attention === "connection") return 5;
  return 6;
}

export function buildSnapshot(
  inputs: readonly ThreadSnapshotInput[],
  options: SnapshotOptions,
): TouchBarSnapshot {
  const projectNames = options.projectNames ?? new Map<string, string>();
  const projected = inputs
    .filter(
      (thread) =>
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        (options.includeHidden || thread.visibility === "visible"),
    )
    .map((thread): TouchBarThread => {
      const status = compactStatus(thread);
      return {
        id: thread.id,
        title: compactText(
          thread.title ?? thread.titleFallback,
          "Untitled thread",
          38,
        ),
        status,
        providerId: compactText(thread.providerId, "agent", 24),
        project: compactText(
          projectNames.get(thread.projectId),
          "Personal",
          22,
        ),
        updatedAtMs: thread.updatedAt,
        unread: isUnread(thread),
        attention: attentionKind(thread, status),
      };
    })
    // BB keeps a failed thread in the error lifecycle after its attention has
    // been read. Those acknowledged failures remain available in BB itself,
    // but keeping them pinned red on the Touch Bar makes them look like new,
    // actionable failures forever.
    .filter(
      (thread) =>
        thread.status !== "error" ||
        thread.unread ||
        thread.attention === "input",
    )
    .sort(
      (left, right) =>
        priority(left) - priority(right) ||
        right.updatedAtMs - left.updatedAtMs ||
        left.id.localeCompare(right.id),
    );

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAtMs: options.nowMs ?? Date.now(),
    summary: {
      active: projected.filter(
        (thread) =>
          thread.status === "active" || thread.status === "stopping",
      ).length,
      attention: projected.filter((thread) => thread.attention !== null).length,
      visible: projected.length,
    },
    threads: projected.slice(0, resolveCardLimit(String(options.cardLimit))),
  };
}

export function renderSummary(snapshot: TouchBarSnapshot): string {
  if (snapshot.summary.visible === 0) return "BB idle";
  const active = `${snapshot.summary.active} active`;
  return snapshot.summary.attention > 0
    ? `BB · ${active} · ${snapshot.summary.attention} need you`
    : `BB · ${active}`;
}

export function renderCard(
  snapshot: TouchBarSnapshot,
  index: number,
): string {
  const thread = snapshot.threads[index];
  if (thread === undefined) return "";
  const glyph =
    thread.attention === "input"
      ? "◆"
      : thread.status === "error"
        ? "!"
        : thread.status === "waiting"
          ? "↻"
          : thread.status === "active"
            ? "●"
            : thread.status === "stopping"
              ? "◌"
              : "○";
  return `${glyph} ${thread.title} · ${thread.project}`;
}
