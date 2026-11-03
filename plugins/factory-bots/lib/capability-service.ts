import {
  CapabilitiesPayloadSchema,
  CapabilityAuditPayloadSchema,
  CapabilitySetPayloadSchema,
  type CapabilitiesResult,
  type CapabilityAuditResult,
  type CapabilitySetResult,
} from "./capability-contract.js";
import type { BotName } from "./soul-contract.js";
import type { ToolCaller } from "./soul-service.js";

type FailureReason = "not-running" | "unavailable";

interface ToolRead {
  ok: boolean;
  value?: unknown;
  reason?: FailureReason;
  message?: string;
}

export interface CapabilityServiceOptions {
  caller: ToolCaller | null;
  startCommand: string | null;
  configError?: string | null;
  now?: () => number;
}

export const ALLOWED_CAPABILITY_TOOLS = [
  "factory_capabilities",
  "factory_capability_set",
  "factory_capability_audit",
] as const;

const ALLOWED = new Set<string>(ALLOWED_CAPABILITY_TOOLS);

function isNotRunningText(text: string): boolean {
  return /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up|connect ECONN|network error/i.test(
    text,
  );
}

/** The live capability store across the Factory's three MCP tools. */
export class CapabilityService {
  private readonly caller: ToolCaller | null;
  private readonly startCommand: string | null;
  private readonly configError: string | null;
  private readonly now: () => number;

  constructor(options: CapabilityServiceOptions) {
    this.caller = options.caller;
    this.startCommand = options.startCommand;
    this.configError = options.configError ?? null;
    this.now = options.now ?? Date.now;
  }

  async getCapabilities(): Promise<CapabilitiesResult> {
    const fetchedAt = this.now();
    const read = await this.readTool("factory_capabilities");
    if (!read.ok) return this.failure(read.reason, read.message, fetchedAt);
    const parsed = CapabilitiesPayloadSchema.safeParse(read.value);
    if (!parsed.success) {
      return this.failure(
        "unavailable",
        `Capabilities did not match the expected shape (${describe(parsed.error)}).`,
        fetchedAt,
      );
    }
    return { ok: true, fetchedAt, capabilities: parsed.data };
  }

  async getCapabilityAudit(): Promise<CapabilityAuditResult> {
    const fetchedAt = this.now();
    const read = await this.readTool("factory_capability_audit");
    if (!read.ok) return this.failure(read.reason, read.message, fetchedAt);
    const parsed = CapabilityAuditPayloadSchema.safeParse(read.value);
    if (!parsed.success) {
      return this.failure(
        "unavailable",
        `Capability audit did not match the expected shape (${describe(parsed.error)}).`,
        fetchedAt,
      );
    }
    return { ok: true, fetchedAt, entries: parsed.data.entries };
  }

  async setCapability(
    bot: BotName,
    enabled: boolean,
  ): Promise<CapabilitySetResult> {
    const fetchedAt = this.now();
    const read = await this.writeTool("factory_capability_set", {
      bot,
      enabled,
    });
    if (!read.ok) return this.failure(read.reason, read.message, fetchedAt);
    const parsed = CapabilitySetPayloadSchema.safeParse(read.value);
    if (!parsed.success) {
      return this.failure(
        "unavailable",
        `The capability change did not match the expected shape (${describe(parsed.error)}).`,
        fetchedAt,
      );
    }
    if (parsed.data.bot !== bot || parsed.data.enabled !== enabled) {
      return this.failure(
        "unavailable",
        "The Factory did not confirm the capability change.",
        fetchedAt,
      );
    }
    return {
      ok: true,
      fetchedAt,
      bot: parsed.data.bot,
      enabled: parsed.data.enabled,
      previous: parsed.data.previous,
      author: parsed.data.author,
      capabilities: parsed.data.capabilities,
    };
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
        reason: "not-running",
        message: this.configError ?? "The Factory MCP is not configured.",
      };
    }
    try {
      const result = await this.caller.callTool(name, args);
      if (result.isError) {
        if (isNotRunningText(result.text)) {
          return { ok: false, reason: "not-running", message: result.text };
        }
        return { ok: false, reason: "unavailable", message: result.text };
      }
      try {
        return { ok: true, value: JSON.parse(result.text) as unknown };
      } catch {
        return {
          ok: false,
          reason: "unavailable",
          message: "The Factory MCP returned non-JSON data.",
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: isNotRunningText(message) ? "not-running" : "unavailable",
        message,
      };
    }
  }

  private async writeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolRead> {
    const read = await this.readTool(name, args);
    if (!read.ok) return read;
    return read;
  }

  private failure(
    reason: FailureReason | undefined,
    message: string | undefined,
    fetchedAt: number,
  ) {
    return {
      ok: false as const,
      reason: reason ?? "unavailable",
      message: message ?? "The Factory did not answer the capability request.",
      startCommand: this.startCommand,
      fetchedAt,
    };
  }
}

function describe(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}
