import { randomBytes } from "node:crypto";
import type { ProcessTerminationMode } from "../contract.js";

export const PROCESS_CONFIRMATION_TTL_MS = 60_000;
export const PROCESS_CONFIRMATION_MAX_ENTRIES = 256;

export interface ProcessConfirmationPayload {
  readonly hostId: string;
  readonly hostName: string;
  readonly pid: number;
  readonly name: string;
  readonly identity: string;
  readonly mode: ProcessTerminationMode;
}

interface StoredProcessConfirmation extends ProcessConfirmationPayload {
  readonly expiresAtMs: number;
}

export type ProcessConfirmationConsumeResult =
  | { readonly outcome: "ok"; readonly confirmation: StoredProcessConfirmation }
  | { readonly outcome: "expired" }
  | { readonly outcome: "invalid" };

type TokenFactory = () => string;

function secureToken(): string {
  return randomBytes(32).toString("base64url");
}

export class ProcessConfirmationStore {
  readonly #confirmations = new Map<string, StoredProcessConfirmation>();
  readonly #tokensByProcess = new Map<string, string>();
  readonly #tokenFactory: TokenFactory;
  readonly #ttlMs: number;
  readonly #maxEntries: number;

  constructor({
    tokenFactory = secureToken,
    ttlMs = PROCESS_CONFIRMATION_TTL_MS,
    maxEntries = PROCESS_CONFIRMATION_MAX_ENTRIES,
  }: {
    tokenFactory?: TokenFactory;
    ttlMs?: number;
    maxEntries?: number;
  } = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new RangeError("Confirmation TTL must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError("Confirmation capacity must be a positive safe integer.");
    }
    this.#tokenFactory = tokenFactory;
    this.#ttlMs = ttlMs;
    this.#maxEntries = maxEntries;
  }

  issue(
    payload: ProcessConfirmationPayload,
    nowMs = Date.now(),
  ): { readonly confirmationToken: string; readonly expiresAtMs: number } {
    this.prune(nowMs);
    const processKey = this.#processKey(payload);
    const priorToken = this.#tokensByProcess.get(processKey);
    if (priorToken !== undefined) {
      this.#confirmations.delete(priorToken);
      this.#tokensByProcess.delete(processKey);
    }
    if (this.#confirmations.size >= this.#maxEntries) {
      throw new Error("Too many process confirmations are waiting.");
    }
    let confirmationToken = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = this.#tokenFactory();
      if (
        /^[A-Za-z0-9_-]{43}$/u.test(candidate) &&
        !this.#confirmations.has(candidate)
      ) {
        confirmationToken = candidate;
        break;
      }
    }
    if (confirmationToken.length === 0) {
      throw new Error("Could not generate a unique confirmation token.");
    }
    const expiresAtMs = Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.max(0, Math.round(nowMs)) + this.#ttlMs,
    );
    this.#confirmations.set(confirmationToken, {
      ...payload,
      expiresAtMs,
    });
    this.#tokensByProcess.set(processKey, confirmationToken);
    return { confirmationToken, expiresAtMs };
  }

  consume(
    confirmationToken: string,
    nowMs = Date.now(),
  ): ProcessConfirmationConsumeResult {
    const confirmation = this.#confirmations.get(confirmationToken);
    // Delete before returning so a caller cannot race a second execution while
    // the first awaits a remote host response.
    this.#confirmations.delete(confirmationToken);
    if (confirmation === undefined) return { outcome: "invalid" };
    const processKey = this.#processKey(confirmation);
    if (this.#tokensByProcess.get(processKey) === confirmationToken) {
      this.#tokensByProcess.delete(processKey);
    }
    if (Math.max(0, Math.round(nowMs)) >= confirmation.expiresAtMs) {
      return { outcome: "expired" };
    }
    return { outcome: "ok", confirmation };
  }

  prune(nowMs = Date.now()): void {
    const now = Math.max(0, Math.round(nowMs));
    for (const [token, confirmation] of this.#confirmations) {
      if (now >= confirmation.expiresAtMs) {
        this.#confirmations.delete(token);
        const processKey = this.#processKey(confirmation);
        if (this.#tokensByProcess.get(processKey) === token) {
          this.#tokensByProcess.delete(processKey);
        }
      }
    }
  }

  clear(): void {
    this.#confirmations.clear();
    this.#tokensByProcess.clear();
  }

  #processKey(payload: ProcessConfirmationPayload): string {
    return JSON.stringify([payload.hostId, payload.pid, payload.identity]);
  }
}
