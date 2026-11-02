/** Presentation helpers for Pi Durable's live document. Unknown stays unknown. */

export interface LiveTool {
  callId: string;
  name: string;
  status: "pending" | "running" | "done" | string;
  output: string | null;
  nested: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function readSlots(value: unknown, nested: boolean): LiveTool[] {
  if (!Array.isArray(value)) return [];
  const tools: LiveTool[] = [];
  for (const entry of value) {
    const slot = record(entry);
    if (slot === null) continue;
    const callId = text(slot.callId);
    const name = text(slot.name);
    if (callId === null || name === null) continue;
    tools.push({
      callId,
      name,
      status: text(slot.status) ?? "done",
      output: text(slot.output),
      nested,
    });
  }
  return tools;
}

/** Model-issued tools first, then nested calls, in the order the factory sent. */
export function readLiveTools(live: unknown): LiveTool[] {
  const doc = record(live);
  if (doc === null) return [];
  return [...readSlots(doc.tools, false), ...readSlots(doc.nestedTools, true)];
}

/** The call worth highlighting: the running one, else the newest pending one. */
export function activeLiveTool(tools: readonly LiveTool[]): LiveTool | null {
  for (let index = tools.length - 1; index >= 0; index -= 1) {
    if (tools[index]!.status === "running") return tools[index]!;
  }
  for (let index = tools.length - 1; index >= 0; index -= 1) {
    if (tools[index]!.status === "pending") return tools[index]!;
  }
  return null;
}

/** True while a generation is in flight even before a tool call starts. */
export function isGenerating(live: unknown): boolean {
  const doc = record(live);
  if (doc === null) return false;
  return record(doc.generation) !== null || record(doc.run) !== null;
}
