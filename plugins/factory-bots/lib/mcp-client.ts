import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { FactoryMcpConfig } from "./config.js";

/** One `tools/call` answer, before the caller parses its JSON text. */
export interface ToolResult {
  isError: boolean;
  text: string;
}

export interface FactoryMcpClientOptions {
  timeoutMs?: number;
  onStderr?: (line: string) => void;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface PendingRequest {
  resolve: (message: JsonRpcMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

/** Runtime essentials only; provider credentials stay with BB. */
const BASE_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "TZ",
  "USER",
  "LOGNAME",
  "SHELL",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
];

function childEnvironment(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...overrides };
}

/**
 * A small client for one Factory MCP server on stdio. It only sends the
 * protocol handshake and `tools/call`; the factory's writes are not exposed
 * here and the board never sends one.
 */
export class FactoryMcpClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private disposed = false;
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<number, PendingRequest>();
  private readonly timeoutMs: number;

  constructor(
    private readonly config: FactoryMcpConfig,
    private readonly options: FactoryMcpClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** The live child's pid, for tests and diagnostics. */
  get childPid(): number | null {
    return this.child?.pid ?? null;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    options: { timeoutMs?: number } = {},
  ): Promise<ToolResult> {
    await this.ensureStarted();
    const response = await this.request(
      "tools/call",
      { name, arguments: args },
      `tool ${name}`,
      options.timeoutMs,
    );
    const result = asRecord(response.result);
    if (result === null) {
      throw new Error(`Factory MCP returned no result for ${name}.`);
    }
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((part) => {
        const record = asRecord(part);
        return record !== null && record.type === "text" ? String(record.text ?? "") : "";
      })
      .filter((part) => part !== "")
      .join("\n");
    return {
      isError: result.isError === true,
      text: text !== "" ? text : JSON.stringify(result),
    };
  }

  /** Kill the child and reject anything still in flight. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const child = this.child;
    this.child = null;
    this.failAll(new Error("Factory MCP client was disposed."));
    if (child !== null) {
      this.terminate(child);
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.disposed) throw new Error("Factory MCP client is disposed.");
    // A concurrent first call must wait for the handshake, not just the child.
    if (this.starting !== null) return this.starting;
    if (this.child !== null) return;
    this.starting = this.start();
    try {
      await this.starting;
    } catch (error) {
      // A failed handshake must not leave a half-started child behind.
      this.stopChild();
      throw error;
    } finally {
      this.starting = null;
    }
  }

  private async start(): Promise<void> {
    const child = spawn(this.config.command, this.config.args, {
      env: childEnvironment(this.config.env),
      ...(this.config.cwd === undefined ? {} : { cwd: this.config.cwd }),
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    this.child = child;
    this.buffer = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (this.child !== child) return;
      this.onData(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (this.child !== child) return;
      for (const line of chunk.split("\n")) {
        if (line.trim() !== "") this.options.onStderr?.(line.trim().slice(0, 500));
      }
    });
    // A write racing the process exit emits EPIPE on stdin. Without a
    // listener it becomes an unhandled error; fail the in-flight calls instead.
    child.stdin.on("error", (error) => {
      this.failChild(child, `Factory MCP stdin failed: ${error.message}`);
    });
    child.stdout.on("error", (error) => {
      this.failChild(child, `Factory MCP stdout failed: ${error.message}`);
    });
    child.stderr.on("error", (error) => {
      this.failChild(child, `Factory MCP stderr failed: ${error.message}`);
    });
    child.on("error", (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.failAll(new Error(`Factory MCP failed to start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      // A replaced child's exit must not reject calls sent to its successor.
      if (this.child !== child) return;
      this.child = null;
      this.failAll(
        new Error(
          `Factory MCP exited (${signal ?? (code === null ? "unknown" : `code ${code}`)}).`,
        ),
      );
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "factory-bots", version: "0.1.0" },
    });
    this.notify("notifications/initialized");
  }

  private request(
    method: string,
    params: unknown,
    label = method,
    timeoutMs = this.timeoutMs,
  ): Promise<JsonRpcMessage> {
    if (this.disposed) {
      return Promise.reject(new Error("Factory MCP client is disposed."));
    }
    const child = this.child;
    if (child === null) {
      return Promise.reject(new Error("Factory MCP is not running."));
    }
    const id = this.nextId++;
    return new Promise<JsonRpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `Factory MCP did not answer ${label} within ${timeoutMs}ms.`,
          ),
        );
        // A wedged request must not hold the next 5s refresh; replace the
        // process and let the next call start a clean handshake.
        this.stopChild();
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      try {
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
        );
      } catch (cause) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }

  private notify(method: string): void {
    try {
      this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
    } catch {
      // The exit handler reports the real failure; a notification is best effort.
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.buffer = "";
      this.failAll(new Error("Factory MCP sent more data than the client can hold."));
      this.stopChild();
      return;
    }

    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
      if (line === "") continue;
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch {
        continue;
      }
      this.onMessage(message);
    }
  }

  private onMessage(message: JsonRpcMessage): void {
    // A server-initiated request is not part of this client's surface.
    if (message.method !== undefined && message.id !== undefined) {
      try {
        this.child?.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: `Unknown client method ${message.method}.` },
          })}\n`,
        );
      } catch {
        // Ignore; the pending call path reports a dead process.
      }
      return;
    }
    const id = message.id;
    if (typeof id !== "number") return;
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error !== undefined) {
      pending.reject(
        new Error(message.error.message ?? "Factory MCP returned an error."),
      );
      return;
    }
    pending.resolve(message);
  }

  private stopChild(): void {
    const child = this.child;
    this.child = null;
    if (child !== null) this.terminate(child);
    this.failAll(new Error("Factory MCP was replaced after a failed request."));
  }

  private failChild(child: ChildProcessWithoutNullStreams, message: string): void {
    if (this.child !== child) return;
    this.child = null;
    this.terminate(child);
    this.failAll(new Error(message));
  }

  /** SIGTERM, then SIGKILL if a wedged child ignores it. */
  private terminate(child: ChildProcessWithoutNullStreams): void {
    child.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 1_000);
    timer.unref?.();
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
