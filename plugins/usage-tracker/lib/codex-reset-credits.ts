import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { z } from "zod";

const APP_SERVER_TIMEOUT_MS = 15_000;
const CODEX_EXECUTABLE = process.env.CODEX_BIN?.trim() || "codex";

const resetCreditCountSchema = z.preprocess(
  (value) =>
    typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value,
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
);

const rateLimitResetCreditsSchema = z
  .object({
    availableCount: resetCreditCountSchema,
  })
  .passthrough();

const accountRateLimitsResponseSchema = z
  .object({
    rateLimitResetCredits: rateLimitResetCreditsSchema.nullable().optional(),
  })
  .passthrough();

const consumeResponseSchema = z
  .object({
    outcome: z.enum([
      "reset",
      "nothingToReset",
      "noCredit",
      "alreadyRedeemed",
    ]),
  })
  .passthrough();

interface JsonRpcError {
  message?: unknown;
}

interface JsonRpcMessage {
  id?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

function parseJsonRpcMessage(line: string): JsonRpcMessage | null {
  try {
    const value: unknown = JSON.parse(line);
    if (value === null || typeof value !== "object") return null;
    return value as JsonRpcMessage;
  } catch {
    return null;
  }
}

function rpcError(message: JsonRpcMessage, fallback: string): Error {
  const detail = message.error?.message;
  return new Error(
    typeof detail === "string" && detail.trim().length > 0
      ? detail.trim()
      : fallback,
  );
}

function terminate(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const forceKill = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  }, 250);
  forceKill.unref();
}

function runCodexAppServerRequest(
  method: string,
  params?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams | null = null;
    let reader: Interface | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let requestSent = false;

    const finish = (error: Error | null, result?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reader?.close();
      if (child !== null) terminate(child);
      if (error !== null) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    const send = (message: Record<string, unknown>): void => {
      if (settled || child === null) return;
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error !== undefined && error !== null) finish(error);
      });
    };

    try {
      child = spawn(CODEX_EXECUTABLE, ["app-server", "--stdio"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    timeout = setTimeout(() => {
      finish(new Error("Codex app-server timed out."));
    }, APP_SERVER_TIMEOUT_MS);
    timeout.unref();

    child.stderr.resume();
    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => {
      if (settled) return;
      const reason = signal === null ? `exit code ${code ?? "unknown"}` : signal;
      finish(new Error(`Codex app-server exited before responding (${reason}).`));
    });

    reader = createInterface({ input: child.stdout });
    reader.on("line", (line) => {
      const message = parseJsonRpcMessage(line);
      if (message === null || message.id === undefined) return;

      if (message.id === 1) {
        if (message.error !== undefined) {
          finish(rpcError(message, "Codex app-server initialization failed."));
          return;
        }
        if (requestSent) return;
        requestSent = true;
        send({ method: "initialized" });
        send({
          id: 2,
          method,
          ...(params === undefined ? {} : { params }),
        });
        return;
      }

      if (message.id !== 2) return;
      if (message.error !== undefined) {
        finish(rpcError(message, `Codex app-server request failed: ${method}.`));
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(message, "result")) {
        finish(new Error(`Codex app-server returned no result for ${method}.`));
        return;
      }
      finish(null, message.result);
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "bb-usage-tracker",
          title: "Usage Tracker",
          version: "0.1.6",
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
        },
      },
    });
  });
}

export function normalizeCodexResetCreditsResponse(
  result: unknown,
): number | null {
  const parsed = accountRateLimitsResponseSchema.safeParse(result);
  if (!parsed.success) return null;
  return parsed.data.rateLimitResetCredits?.availableCount ?? null;
}

export async function readCodexResetCredits(): Promise<number | null> {
  const result = await runCodexAppServerRequest("account/rateLimits/read");
  return normalizeCodexResetCreditsResponse(result);
}

export type CodexResetConsumptionOutcome =
  | "reset"
  | "nothingToReset"
  | "noCredit"
  | "alreadyRedeemed";

export async function consumeCodexRateLimitResetCredit(
  idempotencyKey: string,
): Promise<CodexResetConsumptionOutcome> {
  const result = await runCodexAppServerRequest(
    "account/rateLimitResetCredit/consume",
    { idempotencyKey },
  );
  return consumeResponseSchema.parse(result).outcome;
}
