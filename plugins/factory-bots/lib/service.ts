import {
  FactoryStatusPayloadSchema,
  FactoryTicketsPayloadSchema,
  FactoryTasksPayloadSchema,
  TicketDetailSchema,
  TranscriptSchema,
  type BoardFailure,
  type BoardResult,
  type TicketResult,
  type Transcript,
} from "../contract.js";
import { deriveAgents, deriveSnapshot } from "./derive.js";

export interface ToolCaller {
  callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ isError: boolean; text: string }>;
}

export interface FactoryServiceOptions {
  caller: ToolCaller | null;
  startCommand: string | null;
  configError?: string | null;
  now?: () => number;
}

type FailureReason = BoardFailure["reason"];

type ToolRead =
  | { ok: true; value: unknown }
  | { ok: false; reason: FailureReason; message: string };

interface TranscriptCacheEntry {
  stage: string;
  conversationId: string;
  value: Transcript;
}

/** A fetch failure is the factory being down, not a broken plugin. */
export function isNotRunningText(text: string): boolean {
  return /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up|connect ECONN|network error/i.test(
    text,
  );
}

/**
 * The only reader of factory state. Every method reaches the factory through
 * the five read-only MCP tools; nothing here writes, and nothing opens storage.
 */
export class FactoryService {
  private readonly caller: ToolCaller | null;
  private readonly startCommand: string | null;
  private readonly configError: string | null;
  private readonly now: () => number;
  private readonly transcripts = new Map<string, TranscriptCacheEntry>();

  constructor(options: FactoryServiceOptions) {
    this.caller = options.caller;
    this.startCommand = options.startCommand;
    this.configError = options.configError ?? null;
    this.now = options.now ?? Date.now;
  }

  async getBoard(): Promise<BoardResult> {
    const fetchedAt = this.now();
    const statusRead = await this.readTool("factory_status");
    if (!statusRead.ok) {
      return this.failure(statusRead.reason, statusRead.message, fetchedAt);
    }
    const status = FactoryStatusPayloadSchema.safeParse(statusRead.value);
    if (!status.success) {
      return this.failure(
        "unavailable",
        `Factory status did not match the expected shape (${describe(status.error)}).`,
        fetchedAt,
      );
    }

    const [ticketsRead, tasksRead] = await Promise.all([
      this.readTool("factory_tickets"),
      this.readTool("factory_tasks"),
    ]);
    if (!ticketsRead.ok) {
      return this.failure(ticketsRead.reason, ticketsRead.message, fetchedAt);
    }
    if (!tasksRead.ok) {
      return this.failure(tasksRead.reason, tasksRead.message, fetchedAt);
    }

    const tickets = FactoryTicketsPayloadSchema.safeParse(ticketsRead.value);
    if (!tickets.success) {
      return this.failure(
        "unavailable",
        `Factory tickets did not match the expected shape (${describe(tickets.error)}).`,
        fetchedAt,
      );
    }
    const tasks = FactoryTasksPayloadSchema.safeParse(tasksRead.value);
    if (!tasks.success) {
      return this.failure(
        "unavailable",
        `Factory tasks did not match the expected shape (${describe(tasks.error)}).`,
        fetchedAt,
      );
    }

    // `factory_tickets` omits stopReason, so one detail read per ticket keeps
    // blocked state truthful. Reporting "Live" while a detail read failed
    // would silently clear a blocked agent, so the first failure is the
    // board's failure instead.
    const stopReasons: Record<string, string | null> = {};
    const detailFailures: { reason: FailureReason; message: string }[] = [];
    await mapLimit(tickets.data.tickets, 4, async (ticket) => {
      if (detailFailures.length > 0) return;
      const read = await this.readDetail(ticket.linearId);
      if (!read.ok) {
        detailFailures.push({ reason: read.reason, message: read.message });
        return;
      }
      const detail = TicketDetailSchema.safeParse(read.value);
      if (!detail.success) {
        detailFailures.push({
          reason: "unavailable",
          message: `Factory ticket ${ticket.linearId} did not match the expected shape (${describe(detail.error)}).`,
        });
        return;
      }
      stopReasons[ticket.linearId] = detail.data.stopReason;
    });
    const detailFailure = detailFailures[0];
    if (detailFailure !== undefined) {
      return this.failure(detailFailure.reason, detailFailure.message, fetchedAt);
    }

    return {
      ok: true,
      fetchedAt,
      snapshot: deriveSnapshot(status.data, tickets.data.tickets),
      agents: deriveAgents({
        status: status.data,
        tickets: tickets.data.tickets,
        tasks: tasks.data.tasks,
        stopReasons,
      }),
      tickets: tickets.data.tickets,
      tasks: tasks.data.tasks,
    };
  }

  async getTicket(linearId: string): Promise<TicketResult> {
    const fetchedAt = this.now();
    const detailRead = await this.readTool("factory_ticket", { linearId });
    if (!detailRead.ok) {
      return this.failure(detailRead.reason, detailRead.message, fetchedAt);
    }
    const detail = TicketDetailSchema.safeParse(detailRead.value);
    if (!detail.success) {
      return this.failure(
        "unavailable",
        `Factory ticket did not match the expected shape (${describe(detail.error)}).`,
        fetchedAt,
      );
    }

    const ticket = detail.data;
    const cached = this.transcripts.get(linearId);
    const changed =
      cached === undefined ||
      cached.stage !== ticket.stage ||
      cached.conversationId !== ticket.conversationId;

    if (!changed) {
      return {
        ok: true,
        fetchedAt,
        ticket,
        transcript: cached.value,
        transcriptError: null,
        transcriptRefetched: false,
      };
    }

    const transcriptRead = await this.readTool("factory_transcript", {
      linearId,
      limit: 50,
    });
    if (!transcriptRead.ok) {
      return {
        ok: true,
        fetchedAt,
        ticket,
        transcript: null,
        transcriptError: transcriptRead.message,
        transcriptRefetched: true,
      };
    }
    const transcript = TranscriptSchema.safeParse(transcriptRead.value);
    if (!transcript.success) {
      return {
        ok: true,
        fetchedAt,
        ticket,
        transcript: null,
        transcriptError: `Transcript did not match the expected shape (${describe(transcript.error)}).`,
        transcriptRefetched: true,
      };
    }

    this.transcripts.set(linearId, {
      stage: ticket.stage,
      conversationId: ticket.conversationId,
      value: transcript.data,
    });
    return {
      ok: true,
      fetchedAt,
      ticket,
      transcript: transcript.data,
      transcriptError: null,
      transcriptRefetched: true,
    };
  }

  /**
   * One transient detail failure should not blank the board; a second failure
   * still fails closed so a blocked ticket can never silently disappear.
   */
  private async readDetail(linearId: string): Promise<ToolRead> {
    const first = await this.readTool("factory_ticket", { linearId });
    if (first.ok) return first;
    return this.readTool("factory_ticket", { linearId });
  }

  private async readTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolRead> {
    if (this.caller === null) {
      return {
        ok: false,
        reason: "unavailable",
        message: this.configError ?? "The Factory MCP config is missing.",
      };
    }

    let response: { isError: boolean; text: string };
    try {
      response = await this.caller.callTool(name, args);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        reason: isNotRunningText(message) ? "not-running" : "unavailable",
        message: trimMessage(message),
      };
    }

    if (response.isError) {
      if (isNotRunningText(response.text)) {
        return {
          ok: false,
          reason: "not-running",
          message: "The Factory MCP could not reach the factory process.",
        };
      }
      return {
        ok: false,
        reason: "unavailable",
        message: trimMessage(response.text),
      };
    }

    try {
      return { ok: true, value: JSON.parse(response.text) as unknown };
    } catch {
      return {
        ok: false,
        reason: "unavailable",
        message: `Factory MCP returned a non-JSON answer for ${name}.`,
      };
    }
  }

  private failure(
    reason: FailureReason,
    message: string,
    fetchedAt: number,
  ): BoardFailure {
    return {
      ok: false,
      reason,
      message,
      startCommand: this.startCommand,
      fetchedAt,
    };
  }
}

async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: width }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      await worker(items[current]!);
    }
  });
  await Promise.all(runners);
}

function describe(error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  if (issue === undefined) return "invalid payload";
  const path = issue.path.map(String).join(".");
  return `${path === "" ? "payload" : path}: ${issue.message}`;
}

function trimMessage(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact === "") return "The Factory MCP returned an empty error.";
  return compact.length > 320 ? `${compact.slice(0, 317)}…` : compact;
}
