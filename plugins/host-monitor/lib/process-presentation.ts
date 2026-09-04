export type ProcessSort = "cpu" | "memory" | "name";
export type TerminationMode = "graceful" | "force";

export interface ProcessPresentationRow {
  pid: number;
  name: string;
  cpuPercent: number;
  rssBytes: number;
  memoryPercent: number;
  ownerCategory: "same-user" | "different-user" | "unknown";
  allowedTerminationModes: TerminationMode[];
  blockedReason:
    | "elevated-session"
    | "system-process"
    | "monitor-process"
    | "monitor-ancestor"
    | "ancestry-unavailable"
    | "different-owner"
    | "unknown-owner"
    | "identity-unavailable"
    | "unsupported-platform"
    | "mode-unsupported"
    | null;
}

export interface ProcessActionPresentation {
  disabled: boolean;
  label: string;
  mode: TerminationMode | null;
  reason: string | null;
}

export interface ProcessSummary<Row extends ProcessPresentationRow> {
  protectedCount: number;
  topCpu: Row | null;
  topMemory: Row | null;
}

export function filterProcessRows<Row extends ProcessPresentationRow>(
  rows: readonly Row[],
  query: string,
): Row[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...rows];
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(normalized) ||
      String(row.pid).includes(normalized),
  );
}

export function summarizeProcessRows<Row extends ProcessPresentationRow>(
  rows: readonly Row[],
): ProcessSummary<Row> {
  return {
    protectedCount: rows.reduce(
      (count, row) => count + (row.blockedReason === null ? 0 : 1),
      0,
    ),
    topCpu: sortProcessRows(rows, "cpu")[0] ?? null,
    topMemory: sortProcessRows(rows, "memory")[0] ?? null,
  };
}

export function sortProcessRows<Row extends ProcessPresentationRow>(
  rows: readonly Row[],
  sort: ProcessSort,
): Row[] {
  return [...rows].sort((left, right) => {
    if (sort === "name") {
      const byName = left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
      });
      return byName === 0 ? left.pid - right.pid : byName;
    }
    const byMetric =
      sort === "cpu"
        ? right.cpuPercent - left.cpuPercent
        : right.memoryPercent - left.memoryPercent;
    if (byMetric !== 0) return byMetric;
    const byName = left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
    return byName === 0 ? left.pid - right.pid : byName;
  });
}

export function blockedProcessReason(
  reason: ProcessPresentationRow["blockedReason"],
): string | null {
  switch (reason) {
    case "elevated-session":
      return "Protected while Host Monitor is running with elevated privileges.";
    case "system-process":
      return "Protected system process.";
    case "monitor-process":
      return "Host Monitor cannot stop itself.";
    case "monitor-ancestor":
      return "Protected because Host Monitor depends on this process.";
    case "ancestry-unavailable":
      return "Protected because process ancestry could not be verified.";
    case "different-owner":
      return "Protected process owned by a different user.";
    case "unknown-owner":
      return "Protected because process ownership could not be verified.";
    case "identity-unavailable":
      return "Protected because process identity could not be verified.";
    case "unsupported-platform":
      return "Process control is unavailable on this platform.";
    case "mode-unsupported":
      return "That process action is unavailable on this platform.";
    case null:
      return null;
  }
}

export function processActionPresentation(
  row: ProcessPresentationRow,
): ProcessActionPresentation {
  const reason = blockedProcessReason(row.blockedReason);
  if (reason !== null || row.allowedTerminationModes.length === 0) {
    return {
      disabled: true,
      label: "Protected",
      mode: null,
      reason: reason ?? "This process cannot be stopped safely.",
    };
  }
  if (row.allowedTerminationModes.includes("graceful")) {
    return {
      disabled: false,
      label: "End process",
      mode: "graceful",
      reason: null,
    };
  }
  if (row.allowedTerminationModes.includes("force")) {
    return {
      disabled: false,
      label: "Force stop",
      mode: "force",
      reason: null,
    };
  }
  return {
    disabled: true,
    label: "Protected",
    mode: null,
    reason: "This process cannot be stopped safely.",
  };
}

export function processOwnerLabel(
  owner: ProcessPresentationRow["ownerCategory"],
): string {
  if (owner === "same-user") return "You";
  if (owner === "different-user") return "Other user";
  return "Unknown";
}
