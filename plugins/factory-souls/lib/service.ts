import {
  FactoryStatusPayloadSchema,
  FailureSchema,
  SoulAuditPayloadSchema,
  SoulsPayloadSchema,
  SoulSavePayloadSchema,
  type AuditResult,
  type BotName,
  type Failure,
  type SaveResult,
  type SoulsResult,
  type StatusResult,
  type ToolsByBot,
} from "../contract.js";

export interface ToolCaller {
  callTool(
    name: string,
    args?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<{ isError: boolean; text: string }>;
}

export interface SoulServiceOptions {
  caller: ToolCaller | null;
  startCommand: string | null;
  configError?: string | null;
  now?: () => number;
}

/** The whole remote authority of this plugin. */
export const ALLOWED_TOOLS = [
  "factory_status",
  "factory_souls",
  "factory_soul_set",
  "factory_soul_audit",
] as const;

const ALLOWED = new Set<string>(ALLOWED_TOOLS);

type FailureReason = Failure["reason"];

type ToolRead =
  | { ok: true; value: unknown }
  | { ok: false; reason: FailureReason; message: string };

export function isNotRunningText(text: string): boolean {
  return /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up|connect ECONN|network error/i.test(
    text,
  );
}

/** The only bridge between the panel and the Factory MCP. */
export class SoulService {
  private readonly caller: ToolCaller | null;
  private readonly startCommand: string | null;
  private readonly configError: string | null;
  private readonly now: () => number;

  constructor(options: SoulServiceOptions) {
    this.caller = options.caller;
    this.startCommand = options.startCommand;
    this.configError = options.configError ?? null;
    this.now = options.now ?? Date.now;
  }

  async getSouls(): Promise<SoulsResult> {
    const fetchedAt = this.now();
    const read = await this.readTool("factory_souls");
    if (!read.ok) return this.failure(read.reason, read.message, fetchedAt);

    const parsed = SoulsPayloadSchema.safeParse(read.value);
    if (!parsed.success) {
      return this.failure(
        "unavailable",
        `Souls did not match the expected shape (${describe(parsed.error)}).`,
        fetchedAt,
      );
    }
    return { ok: true, fetchedAt, souls: parsed.data.souls };
  }

  async getStatus(): Promise<StatusResult> {
    const fetchedAt = this.now();
    const read = await this.readTool("factory_status");
    if (!read.ok) return this.failure(read.reason, read.message, fetchedAt);

    const parsed = FactoryStatusPayloadSchema.safeParse(read.value);
    if (!parsed.success) {
      return this.failure(
        "unavailable",
        `Factory status did not match the expected shape (${describe(parsed.error)}).`,
        fetchedAt,
      );
    }
    return {
      ok: true,
      fetchedAt,
      toolsByBot: extractToolsByBot(parsed.data),
    };
  }

  async getAudit(): Promise<AuditResult> {
    const fetchedAt = this.now();
    const read = await this.readTool("factory_soul_audit");
    if (!read.ok) return this.failure(read.reason, read.message, fetchedAt);

    const parsed = SoulAuditPayloadSchema.safeParse(read.value);
    if (!parsed.success) {
      return this.failure(
        "unavailable",
        `Soul audit did not match the expected shape (${describe(parsed.error)}).`,
        fetchedAt,
      );
    }
    return { ok: true, fetchedAt, entries: parsed.data.entries };
  }

  async saveSoul(
    bot: BotName,
    soul: string,
    author: string,
  ): Promise<SaveResult> {
    const fetchedAt = this.now();
    const trimmedAuthor = author.trim();
    if (soul.trim() === "") {
      return this.failure("unavailable", "The soul cannot be empty.", fetchedAt);
    }
    if (trimmedAuthor === "") {
      return this.failure(
        "unavailable",
        "An author is required for every soul change.",
        fetchedAt,
      );
    }

    const read = await this.writeTool("factory_soul_set", {
      bot,
      soul,
      author: trimmedAuthor,
    });
    if (!read.ok) return this.failure(read.reason, read.message, fetchedAt);

    const parsed = SoulSavePayloadSchema.safeParse(read.value);
    if (!parsed.success) {
      return this.failure(
        "unavailable",
        `The save response did not match the expected shape (${describe(parsed.error)}).`,
        fetchedAt,
      );
    }
    if (!parsed.data.saved) {
      return this.failure(
        "unavailable",
        "The Factory did not confirm that the soul was saved.",
        fetchedAt,
      );
    }
    return {
      ok: true,
      fetchedAt,
      bot: parsed.data.bot,
      digest: parsed.data.digest,
    };
  }

  private async writeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolRead> {
    if (!ALLOWED.has(name)) {
      return {
        ok: false,
        reason: "unavailable",
        message: `The panel is not allowed to call ${name}.`,
      };
    }
    return this.readTool(name, args);
  }

  private async readTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolRead> {
    if (!ALLOWED.has(name)) {
      return {
        ok: false,
        reason: "unavailable",
        message: `The panel is not allowed to call ${name}.`,
      };
    }
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
  ): Failure & { ok: false } {
    return FailureSchema.parse({
      ok: false,
      reason,
      message,
      startCommand: this.startCommand,
      fetchedAt,
    });
  }
}

/**
 * Tool authority is only accepted from fields the factory reports. A plain
 * bot-to-conversation map yields null rather than a guessed list.
 */
export function extractToolsByBot(payload: {
  toolsByBot?: Record<string, string[]>;
  tools?: Record<string, string[]>;
  bots?: unknown;
}): ToolsByBot | null {
  const direct = payload.toolsByBot ?? payload.tools;
  if (direct !== undefined) {
    return Object.keys(direct).length === 0 ? null : direct;
  }

  const bots = payload.bots;
  if (typeof bots !== "object" || bots === null || Array.isArray(bots)) {
    return null;
  }

  const found: Record<string, string[]> = {};
  for (const [bot, value] of Object.entries(bots)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      continue;
    }
    const tools = (value as Record<string, unknown>).tools;
    if (Array.isArray(tools) && tools.every((tool) => typeof tool === "string")) {
      found[bot] = tools;
    }
  }
  return Object.keys(found).length === 0 ? null : found;
}

function describe(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): string {
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
