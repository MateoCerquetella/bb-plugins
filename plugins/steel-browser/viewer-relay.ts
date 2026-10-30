import type { BbPluginApi, ExperimentalPluginWebSocket } from "@get-bb/plugin-sdk";
import { scopeSchema, type Binding, type Scope } from "./contract.ts";
import { normalizeBaseUrl } from "./steel-client.ts";

const SOCKET_PATH = "/api/v1/plugins/steel-browser/http/viewer-cast";

function scopeFrom(url: URL): Scope {
  const input: Record<string, string> = {};
  for (const key of ["threadId", "projectId"]) {
    if (url.searchParams.getAll(key).length > 1) throw new Error("Duplicate viewer scope.");
    const value = url.searchParams.get(key);
    if (value !== null) input[key] = value;
  }
  return scopeSchema.parse(input);
}

function localApi(binding: Binding): URL {
  const url = normalizeBaseUrl(binding.apiUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("The embedded viewer requires the project's loopback Steel API.");
  }
  return url;
}

function rewriteViewer(html: string, scope: Scope): string {
  const socket = new URL(SOCKET_PATH, "http://bb.invalid");
  if (scope.threadId) socket.searchParams.set("threadId", scope.threadId);
  if (scope.projectId) socket.searchParams.set("projectId", scope.projectId);
  const base = /const baseWsUrl = '[^'\r\n]*';/u;
  if (!base.test(html) || !html.includes("${baseWsUrl}?tabInfo=true") || !html.includes("${baseWsUrl}?pageId=")) {
    throw new Error("Unsupported Steel player: the embedded transport could not be configured.");
  }
  return html.replace(base,
    `const baseWsUrl = (() => { const url = new URL(${JSON.stringify(socket.pathname + socket.search)}, location.href); url.protocol = location.protocol === "https:" ? "wss:" : "ws:"; return url.href; })();`)
    .replace("${baseWsUrl}?tabInfo=true", "${baseWsUrl}&tabInfo=true")
    .replace("${baseWsUrl}?pageId=", "${baseWsUrl}&pageId=");
}

export function registerViewerRelay(bb: BbPluginApi, bindingFor: (scope: Scope) => Promise<Binding>): void {
  const connections = new Set<() => void>();
  bb.onDispose(() => { for (const close of connections) close(); });

  bb.http.route("GET", "/viewer", async context => {
    let scope: Scope;
    try { scope = scopeFrom(new URL(context.req.url)); }
    catch { return context.text("A valid project or thread is required.", 400); }
    try {
      const api = localApi(await bindingFor(scope));
      const url = new URL("/v1/sessions/debug?interactive=true&clipboardBridge=true", api);
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
        throw new Error("Steel player unavailable.");
      }
      const html = await response.text();
      if (html.length > 262144) throw new Error("Steel player exceeds the supported size.");
      return new Response(rewriteViewer(html, scope), { headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: http: https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      } });
    } catch {
      return context.text("The project viewer is unavailable. Reconnect after checking Steel.", 502);
    }
  }, { auth: "local" });

  bb.http.experimental_websocket("/viewer-cast", ({ url }) => {
    let upstream: WebSocket | undefined;
    let downstream: ExperimentalPluginWebSocket | undefined;
    let closed = false;
    let queue: (string | Uint8Array)[] = [];
    let queuedBytes = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      queue = [];
      connections.delete(close);
      downstream?.close(1000, "Viewer disconnected");
      upstream?.close();
    };
    return {
      async onOpen(socket) {
        downstream = socket;
        connections.add(close);
        timer = setTimeout(close, 10000);
        try {
          const scope = scopeFrom(url);
          const api = localApi(await bindingFor(scope));
          if (closed) return;
          const target = new URL("/v1/sessions/cast", api);
          const pageId = url.searchParams.get("pageId");
          if (pageId !== null) {
            if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(pageId)) throw new Error("Invalid page target.");
            target.searchParams.set("pageId", pageId);
          } else if (url.searchParams.get("tabInfo") === "true") target.searchParams.set("tabInfo", "true");
          else throw new Error("A page target or tab discovery is required.");
          target.protocol = "ws:";
          upstream = new WebSocket(target.href);
          upstream.binaryType = "arraybuffer";
          upstream.addEventListener("open", () => {
            clearTimeout(timer);
            if (closed) { upstream?.close(); return; }
            for (const data of queue) upstream!.send(typeof data === "string" ? data : new Uint8Array(data));
            queue = [];
            queuedBytes = 0;
          });
          upstream.addEventListener("message", event => {
            if (!closed && socket.readyState === 1) socket.send(
              typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
          });
          upstream.addEventListener("close", close);
          upstream.addEventListener("error", close);
        } catch { close(); }
      },
      onMessage(_socket, data) {
        if (closed) return;
        const size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
        if (size > 65536) { close(); return; }
        if (upstream?.readyState === WebSocket.OPEN) {
          upstream.send(typeof data === "string" ? data : new Uint8Array(data));
        } else {
          queuedBytes += size;
          if (queuedBytes > 65536) { close(); return; }
          queue.push(data);
        }
      },
      onClose: close,
      onError: close,
    };
  }, { auth: "local" });
}
