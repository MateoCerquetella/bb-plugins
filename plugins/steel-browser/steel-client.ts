import { z } from "zod";
import type { BrowserSession, CreateOptions, Dashboard } from "./contract.ts";

const DEFAULT_TIMEOUT_MS = 8_000;

const upstreamSessionSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().min(1),
    status: z.enum(["idle", "live", "released", "failed"]),
    duration: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    websocketUrl: z.string().default(""),
    debugUrl: z.string().default(""),
    debuggerUrl: z.string().default(""),
    sessionViewerUrl: z.string().default(""),
    dimensions: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

const sessionsSchema = z.object({ sessions: z.array(upstreamSessionSchema) }).passthrough();
const healthSchema = z.object({ status: z.literal("ok") }).passthrough();
const releaseSchema = upstreamSessionSchema.extend({ success: z.boolean() }).passthrough();

export class SteelClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteelClientError";
  }
}

export function normalizeBaseUrl(input: string): URL {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SteelClientError("Steel endpoint must be a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SteelClientError("Steel endpoint must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new SteelClientError("Steel endpoint cannot include credentials, a query, or a fragment.");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url;
}

function publicError(error: unknown): SteelClientError {
  if (error instanceof SteelClientError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new SteelClientError("Steel did not respond before the request timed out.");
  }
  return new SteelClientError("Steel is unavailable at the configured endpoint.");
}

function normalizeSession(session: z.infer<typeof upstreamSessionSchema>): BrowserSession {
  return {
    id: session.id,
    createdAt: session.createdAt,
    status: session.status,
    durationMs: session.duration,
    eventCount: session.eventCount,
    websocketUrl: session.websocketUrl,
    debugUrl: session.debugUrl,
    debuggerUrl: session.debuggerUrl,
    viewerUrl: session.sessionViewerUrl,
    dimensions: session.dimensions ?? null,
  };
}

export class SteelClient {
  readonly baseUrl: URL;

  constructor(
    endpoint: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.baseUrl = normalizeBaseUrl(endpoint);
  }

  private url(path: string): URL {
    return new URL(path.replace(/^\/+/u, ""), `${this.baseUrl.toString().replace(/\/?$/u, "/")}`);
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.url(path), {
        ...init,
        headers: {
          accept: "application/json",
          ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
          ...init?.headers,
        },
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        throw new SteelClientError(`Steel returned HTTP ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      throw publicError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<void> {
    const payload = await this.request("/v1/health");
    const parsed = healthSchema.safeParse(payload);
    if (!parsed.success) throw new SteelClientError("Steel returned an invalid health response.");
  }

  async listSessions(): Promise<BrowserSession[]> {
    const payload = await this.request("/v1/sessions");
    const parsed = sessionsSchema.safeParse(payload);
    if (!parsed.success) throw new SteelClientError("Steel returned an invalid session list.");
    return parsed.data.sessions.map(normalizeSession);
  }

  async createSession(options: CreateOptions): Promise<BrowserSession> {
    const sessions = await this.listSessions();
    if (sessions.some((session) => session.status === "live" || session.status === "idle")) {
      throw new SteelClientError("A browser session is already live. Reuse it or release it first.");
    }
    const payload = await this.request("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({
        blockAds: options.blockAds,
        dimensions: { width: options.width, height: options.height },
      }),
    });
    const parsed = upstreamSessionSchema.safeParse(payload);
    if (!parsed.success) throw new SteelClientError("Steel returned an invalid created session.");
    return normalizeSession(parsed.data);
  }

  async releaseSession(sessionId: string): Promise<{ sessionId: string; success: boolean }> {
    if (!z.string().uuid().safeParse(sessionId).success) {
      throw new SteelClientError("A valid session UUID is required.");
    }
    const sessions = await this.listSessions();
    if (!sessions.some((session) => session.id === sessionId && (session.status === "live" || session.status === "idle"))) {
      throw new SteelClientError("That session is not live. Refresh before releasing a session.");
    }
    const payload = await this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/release`, {
      method: "POST",
    });
    const parsed = releaseSchema.safeParse(payload);
    if (!parsed.success) throw new SteelClientError("Steel returned an invalid release response.");
    if (parsed.data.id !== sessionId || !parsed.data.success) {
      throw new SteelClientError("Steel did not confirm release of the requested session. Refresh before retrying.");
    }
    return { sessionId: parsed.data.id, success: parsed.data.success };
  }

  async dashboard(): Promise<Dashboard> {
    const checkedAt = new Date().toISOString();
    try {
      await this.health();
      const sessions = await this.listSessions();
      return {
        endpoint: this.baseUrl.toString().replace(/\/$/u, ""),
        connected: true,
        checkedAt,
        error: null,
        uiUrl: this.url("/ui").toString(),
        docsUrl: this.url("/documentation/").toString(),
        sessions,
      };
    } catch (error) {
      const message = publicError(error).message;
      return {
        endpoint: this.baseUrl.toString().replace(/\/$/u, ""),
        connected: false,
        checkedAt,
        error: message,
        uiUrl: this.url("/ui").toString(),
        docsUrl: this.url("/documentation/").toString(),
        sessions: [],
      };
    }
  }
}
